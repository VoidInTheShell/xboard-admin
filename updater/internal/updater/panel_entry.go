package updater

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Panel-scope certificate resources are the source of truth for the public
// entry Caddyfile. The panel never writes gateway configuration directly:
// this reconciler fetches the desired certificate list, renders the
// Caddyfile, reloads the entry container, verifies the resulting certificate
// material and reports status back. Machine-scope certificates are never
// touched here.

const panelEntryInterval = time.Minute

type panelCertificate struct {
	ID                  string   `json:"id"`
	Domains             []string `json:"domains"`
	SourceType          string   `json:"source_type"`
	AutoRenew           bool     `json:"auto_renew"`
	Email               string   `json:"email"`
	Revision            int      `json:"revision"`
	Status              string   `json:"status"`
	CertificatePath     string   `json:"certificate_path,omitempty"`
	PrivateKeyPath      string   `json:"private_key_path,omitempty"`
	CertificateContent  string   `json:"certificate_content,omitempty"`
	PrivateKeyContent   string   `json:"private_key_content,omitempty"`
}

type panelCertReport struct {
	ID              string `json:"id"`
	Status          string `json:"status"`
	AppliedRevision int    `json:"applied_revision"`
	NotBeforeAt     string `json:"not_before_at,omitempty"`
	ExpiresAt       string `json:"expires_at,omitempty"`
	Fingerprint     string `json:"fingerprint,omitempty"`
	LastError       string `json:"last_error,omitempty"`
}

// panelEntryState persists what the last successful reconcile round applied,
// so unchanged rounds skip the API report and renewals are detected by a
// revision bump on a previously valid certificate.
type panelEntryState struct {
	Certificates map[string]panelCertReport `json:"certificates"`
}

func (a *Agent) panelEntryLoop(ctx context.Context) {
	entry := a.Config.PanelEntry
	if entry == nil || !entry.Enabled {
		return
	}
	if err := a.reconcilePanelEntry(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "xboard-updater: panel entry:", err)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(panelEntryInterval):
		}
		if err := a.reconcilePanelEntry(ctx); err != nil {
			fmt.Fprintln(os.Stderr, "xboard-updater: panel entry:", err)
		}
	}
}

func (a *Agent) reconcilePanelEntry(ctx context.Context) error {
	entry := a.Config.PanelEntry.canonical()

	var desired struct {
		Certificates []panelCertificate `json:"certificates"`
	}
	if err := a.apiGet(ctx, "panel-certificates", &desired); err != nil {
		// A panel that predates the panel-certificate endpoints keeps the
		// entry running on the last rendered Caddyfile; retry next round.
		if seedErr := a.seedColdStart(ctx, entry); seedErr != nil {
			fmt.Fprintln(os.Stderr, "xboard-updater: panel entry: seed cold start:", seedErr)
		}
		return fmt.Errorf("desired panel certificates unavailable: %w", err)
	}
	certs := sanitizePanelCertificates(desired.Certificates)

	material, materialErr := materializeContentCerts(entry.CertMaterialDir, certs)
	if materialErr != nil {
		// Missing PEM material is an administrator error worth reporting on
		// every affected resource instead of silently keeping an old file.
		material = map[string]materializedCert{}
	}

	state := loadPanelEntryState(a.Config.StateDir)

	rendered, conflicts := renderPanelCaddyfile(entry, certs, material)
	current, readErr := os.ReadFile(entry.CaddyfilePath)
	changed := readErr != nil || string(current) != rendered

	if changed {
		if readErr != nil && !os.IsNotExist(readErr) {
			return fmt.Errorf("entry Caddyfile unreadable: %w", readErr)
		}
		if err := writeCaddyfileInPlace(entry.CaddyfilePath, []byte(rendered)); err != nil {
			return fmt.Errorf("entry Caddyfile write failed: %w", err)
		}
		if _, err := a.exec(ctx, "docker", "exec", entry.CaddyContainer, "caddy", "reload", "--config", entry.CaddyConfigPath); err != nil {
			// Reload keeps the running config on failure, but the file on disk
			// is now invalid for a manual restart; restore the previous one.
			if readErr == nil {
				_ = writeCaddyfileInPlace(entry.CaddyfilePath, current)
			}
			return a.reportPanelCertificates(ctx, certs, state, conflicts, materialErr, fmt.Errorf("entry reload failed: %w", err))
		}
	}

	// A revision bump on a previously valid ACME certificate means the panel
	// asked for a re-issue (for example after a domain change): clear Caddy's
	// cached certificate for those domains and reload so it obtains new ones.
	if renewed := acmeRenewals(certs, state); len(renewed) > 0 {
		if err := a.clearCaddyCertCache(ctx, entry, renewed); err != nil {
			fmt.Fprintln(os.Stderr, "xboard-updater: panel entry: clear ACME cache:", err)
		} else if _, err := a.exec(ctx, "docker", "exec", entry.CaddyContainer, "caddy", "reload", "--config", entry.CaddyConfigPath); err != nil {
			fmt.Fprintln(os.Stderr, "xboard-updater: panel entry: reload after renewal:", err)
		}
	}

	return a.reportPanelCertificates(ctx, certs, state, conflicts, materialErr, nil)
}

func (a *Agent) reportPanelCertificates(ctx context.Context, certs []panelCertificate, state panelEntryState, conflicts map[string]string, materialErr error, fatal error) error {
	entry := a.Config.PanelEntry.canonical()
	rows := []panelCertReport{}
	for _, cert := range certs {
		row := panelCertReport{ID: cert.ID, AppliedRevision: cert.Revision, Status: "pending"}
		if errText := conflicts[cert.ID]; errText != "" {
			row.Status = "error"
			row.LastError = errText
		} else if fatal != nil {
			row.Status = "error"
			row.LastError = truncateLastError(fatal.Error())
		} else {
			switch cert.SourceType {
			case "acme_http":
				row.Status = "issuing"
				for _, domain := range cert.Domains {
					meta, ok := inspectAcmeCertificate(entry.CaddyDataPath, domain)
					if !ok {
						continue
					}
					row.Status = "valid"
					row.NotBeforeAt = meta.notBefore.UTC().Format(time.RFC3339)
					row.ExpiresAt = meta.expires.UTC().Format(time.RFC3339)
					row.Fingerprint = meta.fingerprint
					break
				}
				if row.Status == "issuing" {
					// Keep the previous verified metadata visible while the new
					// certificate is being issued.
					if previous, ok := state.Certificates[cert.ID]; ok && previous.Status == "valid" {
						row.NotBeforeAt = previous.NotBeforeAt
						row.ExpiresAt = previous.ExpiresAt
						row.Fingerprint = previous.Fingerprint
					}
				}
			case "path":
				// Path-sourced files live inside the Caddy container; without a
				// change round there is nothing new to inspect, so the previous
				// verified state stays authoritative.
				if previous, ok := state.Certificates[cert.ID]; ok && previous.Status == "valid" {
					row = previous
					row.AppliedRevision = cert.Revision
				} else if meta, ok := a.inspectContainerCertificate(ctx, entry, cert); ok {
					row.Status = "valid"
					row.NotBeforeAt = meta.notBefore.UTC().Format(time.RFC3339)
					row.ExpiresAt = meta.expires.UTC().Format(time.RFC3339)
					row.Fingerprint = meta.fingerprint
				}
			case "content":
				meta, err := inspectMaterializedCert(entry.CertMaterialDir, cert.ID)
				if err == nil {
					row.Status = "valid"
					row.NotBeforeAt = meta.notBefore.UTC().Format(time.RFC3339)
					row.ExpiresAt = meta.expires.UTC().Format(time.RFC3339)
					row.Fingerprint = meta.fingerprint
				} else {
					row.Status = "error"
					row.LastError = truncateLastError(err.Error())
				}
				if materialErr != nil {
					row.Status = "error"
					row.LastError = truncateLastError(materialErr.Error())
				}
			}
		}
		rows = append(rows, row)
	}

	// Skip the API round-trip when nothing changed since the last report.
	next := panelEntryState{Certificates: map[string]panelCertReport{}}
	for _, row := range rows {
		next.Certificates[row.ID] = row
	}
	if panelReportsEqual(state.Certificates, next.Certificates) {
		return nil
	}

	payload := map[string]any{"certificates": rows}
	if err := a.api(ctx, "panel-certificate-report", payload, nil); err != nil {
		return fmt.Errorf("panel certificate report failed: %w", err)
	}
	return savePanelEntryState(a.Config.StateDir, next)
}

func sanitizePanelCertificates(certs []panelCertificate) []panelCertificate {
	out := make([]panelCertificate, 0, len(certs))
	for _, cert := range certs {
		if cert.ID == "" || cert.Revision < 1 {
			continue
		}
		domains := make([]string, 0, len(cert.Domains))
		for _, domain := range cert.Domains {
			domain = strings.ToLower(strings.TrimSpace(domain))
			if domain != "" && domainPattern.MatchString(domain) {
				domains = append(domains, domain)
			}
		}
		if len(domains) == 0 {
			continue
		}
		cert.Domains = domains
		if cert.SourceType != "acme_http" && cert.SourceType != "path" && cert.SourceType != "content" {
			continue
		}
		cert.Email = strings.TrimSpace(cert.Email)
		if cert.Email != "" && !emailPattern.MatchString(cert.Email) {
			cert.Email = ""
		}
		out = append(out, cert)
	}
	return out
}

type materializedCert struct {
	CertPath string
	KeyPath  string
}

// materializeContentCerts writes PEM material for content-sourced resources
// into the shared cert volume and removes directories of resources that no
// longer exist.
func materializeContentCerts(dir string, certs []panelCertificate) (map[string]materializedCert, error) {
	out := map[string]materializedCert{}
	keep := map[string]bool{}
	var firstErr error
	for _, cert := range certs {
		if cert.SourceType != "content" {
			continue
		}
		if cert.CertificateContent == "" || cert.PrivateKeyContent == "" {
			if firstErr == nil {
				firstErr = fmt.Errorf("证书 %s 缺少 PEM 内容", cert.ID)
			}
			continue
		}
		target := filepath.Join(dir, sanitizeCertID(cert.ID))
		keep[target] = true
		certPath := filepath.Join(target, "tls.crt")
		keyPath := filepath.Join(target, "tls.key")
		existing, err := os.ReadFile(certPath)
		if err == nil && string(existing) == cert.CertificateContent {
			if key, err := os.ReadFile(keyPath); err == nil && string(key) == cert.PrivateKeyContent {
				out[cert.ID] = materializedCert{CertPath: certPath, KeyPath: keyPath}
				continue
			}
		}
		if err := os.MkdirAll(target, 0o700); err != nil {
			return out, err
		}
		if err := atomicWriteFile(certPath, []byte(cert.CertificateContent), 0o600); err != nil {
			return out, err
		}
		if err := atomicWriteFile(keyPath, []byte(cert.PrivateKeyContent), 0o600); err != nil {
			return out, err
		}
		out[cert.ID] = materializedCert{CertPath: certPath, KeyPath: keyPath}
	}
	entries, err := os.ReadDir(dir)
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() || keep[filepath.Join(dir, e.Name())] {
				continue
			}
			_ = os.RemoveAll(filepath.Join(dir, e.Name()))
		}
	}
	return out, firstErr
}

func sanitizeCertID(id string) string {
	var b strings.Builder
	for _, r := range id {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F') || r == '-' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "unknown"
	}
	return b.String()
}

// renderPanelCaddyfile builds the complete entry Caddyfile. Certificates are
// applied in panel order; a domain may only be claimed by one site block, so
// later resources that overlap earlier ones are skipped and reported.
func renderPanelCaddyfile(entry PanelEntryConfig, certs []panelCertificate, material map[string]materializedCert) (string, map[string]string) {
	entry = entry.canonical()
	conflicts := map[string]string{}
	claimed := map[string]string{}
	usedEmail := ""
	emailSeen := false

	var b strings.Builder
	b.WriteString("# Managed by xboard-updater; do not edit. Panel entry gateway configuration.\n{\n\tadmin localhost:2019\n")
	for _, cert := range certs {
		if cert.Email == "" || cert.SourceType != "acme_http" {
			continue
		}
		if !emailSeen {
			usedEmail = cert.Email
			emailSeen = true
		} else if usedEmail != cert.Email {
			usedEmail = ""
		}
	}
	if usedEmail != "" {
		fmt.Fprintf(&b, "\temail %s\n", usedEmail)
	}
	b.WriteString("}\n\n")

	for _, cert := range certs {
		overlap := ""
		for _, domain := range cert.Domains {
			if owner, ok := claimed[domain]; ok && owner != cert.ID {
				overlap = domain
				break
			}
		}
		if overlap != "" {
			conflicts[cert.ID] = truncateLastError(fmt.Sprintf("域名 %s 已被其他面板证书使用", overlap))
			continue
		}

		var site strings.Builder
		site.WriteString(strings.Join(cert.Domains, ", "))
		site.WriteString(" {\n")
		switch cert.SourceType {
		case "path":
			fmt.Fprintf(&site, "\ttls %s %s\n", cert.CertificatePath, cert.PrivateKeyPath)
		case "content":
			m, ok := material[cert.ID]
			if !ok {
				// Skip the site block but keep the rest of the entry running;
				// the affected resource is reported with the material error.
				conflicts[cert.ID] = truncateLastError("证书 PEM 内容不可用")
				continue
			}
			fmt.Fprintf(&site, "\ttls %s %s\n", m.CertPath, m.KeyPath)
		}
		fmt.Fprintf(&site, "\treverse_proxy %s\n}\n\n", entry.ThemeUpstream)

		for _, domain := range cert.Domains {
			claimed[domain] = cert.ID
		}
		b.WriteString(site.String())
	}

	// Seed domains keep the panel reachable before the first certificate
	// resource exists; Caddy obtains them via ACME automatically.
	var uncovered []string
	for _, domain := range entry.SeedDomains {
		if _, ok := claimed[domain]; !ok {
			uncovered = append(uncovered, domain)
		}
	}
	if len(uncovered) > 0 {
		sort.Strings(uncovered)
		b.WriteString(strings.Join(uncovered, ", "))
		fmt.Fprintf(&b, " {\n\treverse_proxy %s\n}\n\n", entry.ThemeUpstream)
	}
	return b.String(), conflicts
}

func renderPlaceholderCaddyfile() string {
	return "{\n\tadmin localhost:2019\n}\n"
}

// needsSeedRender reports whether the on-disk entry Caddyfile was not
// rendered by the updater: the installer placeholder (or a missing/empty
// file) must be replaced before the first certificate resource can even be
// fetched, because on a fresh install the update API is only reachable
// through this entry.
func needsSeedRender(current []byte, readErr error) bool {
	if readErr != nil {
		return true
	}
	content := string(current)
	if strings.TrimSpace(content) == "" {
		return true
	}
	return !strings.HasPrefix(content, "# Managed by xboard-updater")
}

// seedColdStart replaces a not-yet-managed entry Caddyfile with the
// seed-only render so the entry can obtain its first certificate via ACME
// and the panel API becomes reachable over HTTPS. A Caddyfile that was
// already rendered by a previous reconcile is left untouched: the entry
// keeps serving the last known configuration while the panel is
// temporarily unreachable.
func (a *Agent) seedColdStart(ctx context.Context, entry PanelEntryConfig) error {
	current, readErr := os.ReadFile(entry.CaddyfilePath)
	if !needsSeedRender(current, readErr) {
		return nil
	}
	if readErr != nil && !os.IsNotExist(readErr) {
		return fmt.Errorf("entry Caddyfile unreadable: %w", readErr)
	}
	rendered, _ := renderPanelCaddyfile(entry, nil, nil)
	if readErr == nil && string(current) == rendered {
		return nil
	}
	if err := writeCaddyfileInPlace(entry.CaddyfilePath, []byte(rendered)); err != nil {
		return fmt.Errorf("entry Caddyfile write failed: %w", err)
	}
	if _, err := a.exec(ctx, "docker", "exec", entry.CaddyContainer, "caddy", "reload", "--config", entry.CaddyConfigPath); err != nil {
		return fmt.Errorf("entry reload failed: %w", err)
	}
	return nil
}

// writeCaddyfileInPlace overwrites the entry Caddyfile without renaming it:
// the entry overlay may bind-mount this single file into the Caddy
// container, and a rename would leave the container pinned to the old
// inode forever. The reconcile loop retries every round, and Caddy only
// re-reads the file on the reload that follows the write, so the truncated
// window cannot reach the running configuration.
func writeCaddyfileInPlace(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}
// acmeRenewals returns domains of ACME certificates whose revision increased
// since the last applied state while already being valid: the cached
// certificate no longer matches the desired resource and must be re-issued.
func acmeRenewals(certs []panelCertificate, state panelEntryState) []string {
	var domains []string
	for _, cert := range certs {
		if cert.SourceType != "acme_http" {
			continue
		}
		previous, ok := state.Certificates[cert.ID]
		if !ok || previous.Status != "valid" || previous.AppliedRevision >= cert.Revision {
			continue
		}
		domains = append(domains, cert.Domains...)
	}
	return domains
}

func (a *Agent) clearCaddyCertCache(ctx context.Context, entry PanelEntryConfig, domains []string) error {
	if len(domains) == 0 {
		return nil
	}
	args := []string{"exec", entry.CaddyContainer, "sh", "-c"}
	var script strings.Builder
	fmt.Fprintf(&script, "rm -rf")
	for _, domain := range domains {
		fmt.Fprintf(&script, " %q/caddy/certificates/*/%q %q/caddy/certificates/*/%q", entry.CaddyInternalDataPath, domain, entry.CaddyInternalDataPath, caddyStorageDomain(domain))
	}
	args = append(args, script.String())
	_, err := a.exec(ctx, "docker", args...)
	return err
}

// caddyStorageDomain mirrors Caddy's storage-key encoding for wildcards so
// renewed wildcard certificates clear the right directory.
func caddyStorageDomain(domain string) string {
	return strings.Replace(domain, "*", "wildcard_.", 1)
}

type certMetadata struct {
	notBefore   time.Time
	expires     time.Time
	fingerprint string
}

func parseCertificatePEM(raw []byte) (certMetadata, error) {
	block, _ := pem.Decode(raw)
	if block == nil || block.Type != "CERTIFICATE" {
		return certMetadata{}, errors.New("证书文件不是有效的 PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return certMetadata{}, fmt.Errorf("证书解析失败: %w", err)
	}
	sum := sha256.Sum256(block.Bytes)
	return certMetadata{
		notBefore:   cert.NotBefore,
		expires:     cert.NotAfter,
		fingerprint: "SHA256:" + strings.ToUpper(hex.EncodeToString(sum[:])),
	}, nil
}

// inspectAcmeCertificate reads Caddy's certificate storage (mounted
// read-only) for an ACME-obtained domain. Caddy nests certificates per CA
// directory, so any match on the storage-encoded domain name is accepted.
func inspectAcmeCertificate(dataPath, domain string) (certMetadata, bool) {
	base := filepath.Join(dataPath, "caddy", "certificates")
	for _, name := range []string{domain, caddyStorageDomain(domain)} {
		if meta, err := findAcmeCert(base, name); err == nil {
			return meta, true
		}
	}
	return certMetadata{}, false
}

func findAcmeCert(base, domain string) (certMetadata, error) {
	if base == "" {
		return certMetadata{}, errors.New("no storage")
	}
	var found certMetadata
	var foundErr error
	_ = filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil || foundErr != nil || d.IsDir() {
			return nil
		}
		if d.Name() != domain+".crt" {
			return nil
		}
		raw, readErr := os.ReadFile(path)
		if readErr != nil {
			foundErr = readErr
			return nil
		}
		meta, parseErr := parseCertificatePEM(raw)
		if parseErr != nil {
			foundErr = parseErr
			return nil
		}
		found = meta
		return filepath.SkipAll
	})
	if foundErr != nil {
		return certMetadata{}, foundErr
	}
	if found.fingerprint == "" {
		return certMetadata{}, errors.New("certificate not found")
	}
	return found, nil
}

func inspectMaterializedCert(dir, certID string) (certMetadata, error) {
	raw, err := os.ReadFile(filepath.Join(dir, sanitizeCertID(certID), "tls.crt"))
	if err != nil {
		return certMetadata{}, fmt.Errorf("证书材料读取失败: %w", err)
	}
	return parseCertificatePEM(raw)
}

// inspectContainerCertificate reads a path-sourced certificate from inside
// the entry container via `docker exec cat`; the updater cannot see those
// mounts directly.
func (a *Agent) inspectContainerCertificate(ctx context.Context, entry PanelEntryConfig, cert panelCertificate) (certMetadata, bool) {
	out, err := a.exec(ctx, "docker", "exec", entry.CaddyContainer, "cat", cert.CertificatePath)
	if err != nil {
		return certMetadata{}, false
	}
	meta, err := parseCertificatePEM([]byte(out))
	if err != nil {
		return certMetadata{}, false
	}
	return meta, true
}

func loadPanelEntryState(stateDir string) panelEntryState {
	var state panelEntryState
	raw, err := os.ReadFile(filepath.Join(stateDir, "panel-entry.json"))
	if err != nil {
		return panelEntryState{Certificates: map[string]panelCertReport{}}
	}
	if json.Unmarshal(raw, &state) != nil {
		return panelEntryState{Certificates: map[string]panelCertReport{}}
	}
	if state.Certificates == nil {
		state.Certificates = map[string]panelCertReport{}
	}
	return state
}

func savePanelEntryState(stateDir string, state panelEntryState) error {
	if state.Certificates == nil {
		state.Certificates = map[string]panelCertReport{}
	}
	return atomicJSON(filepath.Join(stateDir, "panel-entry.json"), state)
}

func panelReportsEqual(previous, next map[string]panelCertReport) bool {
	if len(previous) != len(next) {
		return false
	}
	for id, row := range next {
		old, ok := previous[id]
		if !ok || old != row {
			return false
		}
	}
	return true
}

func truncateLastError(text string) string {
	if len(text) <= 1000 {
		return text
	}
	return text[:1000]
}
// atomicWriteFile mirrors atomicJSON's tmp+rename pattern for plain files.
// Only for files NOT bind-mounted into other containers: a rename swaps the
// inode and single-file bind mounts keep following the old one.
func atomicWriteFile(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err = tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Chmod(mode); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
