package updater

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func testPanelEntry() PanelEntryConfig {
	return PanelEntryConfig{
		Enabled:               true,
		CaddyContainer:        "xboard-entry",
		CaddyfilePath:         rootPath("deploy", "entry", "Caddyfile"),
		CaddyConfigPath:       rootPath("etc", "caddy", "Caddyfile"),
		CaddyDataPath:         rootPath("entry-caddy-data"),
		CaddyInternalDataPath: rootPath("data"),
		CertMaterialDir:       rootPath("entry-certs"),
		SeedDomains:           []string{"panel.example.test"},
		ThemeUpstream:         "http://xboard-theme:80",
	}
}

func rootPath(parts ...string) string {
	relative := filepath.Join(parts...)
	if runtime.GOOS == "windows" {
		// filepath.IsAbs needs a volume on Windows; production configs are
		// Linux paths, tests just need the same "absolute" guarantee.
		return filepath.Join("C:"+string(filepath.Separator), relative)
	}
	return filepath.Join(string(filepath.Separator), relative)
}

func TestPanelEntryValidate(t *testing.T) {
	if err := testPanelEntry().validate(); err != nil {
		t.Fatalf("valid entry rejected: %v", err)
	}
	bad := testPanelEntry()
	bad.ThemeUpstream = "ftp://xboard-theme"
	if err := bad.validate(); err == nil {
		t.Fatal("invalid upstream accepted")
	}
	bad = testPanelEntry()
	bad.SeedDomains = []string{"localhost"}
	if err := bad.validate(); err == nil {
		t.Fatal("loopback seed accepted")
	}
	bad = testPanelEntry()
	bad.CaddyfilePath = filepath.Join("entry", "Caddyfile")
	if err := bad.validate(); err == nil {
		t.Fatal("relative path accepted")
	}
}

func TestRenderPanelCaddyfile(t *testing.T) {
	entry := testPanelEntry()
	certs := []panelCertificate{
		{ID: "id-acme", Domains: []string{"panel.example.test", "www.panel.example.test"}, SourceType: "acme_http", Email: "ops@example.test", Revision: 1},
		{ID: "id-path", Domains: []string{"legacy.example.test"}, SourceType: "path", CertificatePath: "/etc/ssl/fullchain.pem", PrivateKeyPath: "/etc/ssl/privkey.pem", Revision: 1},
	}
	material := map[string]materializedCert{}

	out, conflicts := renderPanelCaddyfile(entry, certs, material)
	if len(conflicts) != 0 {
		t.Fatalf("unexpected conflicts: %v", conflicts)
	}
	expected := "# Managed by xboard-updater; do not edit. Panel entry gateway configuration.\n" +
		"{\n\tadmin localhost:2019\n\temail ops@example.test\n}\n\n" +
		"panel.example.test, www.panel.example.test {\n\treverse_proxy http://xboard-theme:80\n}\n\n" +
		"legacy.example.test {\n\ttls /etc/ssl/fullchain.pem /etc/ssl/privkey.pem\n\treverse_proxy http://xboard-theme:80\n}\n\n"
	if out != expected {
		t.Fatalf("render mismatch:\n%s\n---\n%s", out, expected)
	}
}

func TestRenderPanelCaddyfileContentAndConflicts(t *testing.T) {
	entry := testPanelEntry()
	entry.SeedDomains = []string{"panel.example.test", "extra.example.test"}
	certs := []panelCertificate{
		{ID: "id-content", Domains: []string{"panel.example.test"}, SourceType: "content", Revision: 1},
		{ID: "id-dup", Domains: []string{"panel.example.test"}, SourceType: "acme_http", Revision: 1},
	}
	material := map[string]materializedCert{
		"id-content": {CertPath: "/entry-certs/id-content/tls.crt", KeyPath: "/entry-certs/id-content/tls.key"},
	}

	out, conflicts := renderPanelCaddyfile(entry, certs, material)
	if conflicts["id-dup"] == "" {
		t.Fatal("duplicate-domain certificate must be reported")
	}
	// Content site renders the materialized pair; the overlapping second
	// certificate is skipped; the remaining seed domain stays ACME-covered.
	if !strings.Contains(out, "tls /entry-certs/id-content/tls.crt /entry-certs/id-content/tls.key") {
		t.Fatalf("content tls block missing:\n%s", out)
	}
	if !strings.Contains(out, "extra.example.test {\n\treverse_proxy") {
		t.Fatalf("uncovered seed domain missing:\n%s", out)
	}
	if strings.Contains(out, "email ") {
		t.Fatalf("no email should be emitted without acme_http resources:\n%s", out)
	}
}

func TestRenderPanelCaddyfileEmailConflict(t *testing.T) {
	entry := testPanelEntry()
	entry.SeedDomains = nil
	certs := []panelCertificate{
		{ID: "a", Domains: []string{"a.example.test"}, SourceType: "acme_http", Email: "one@example.test", Revision: 1},
		{ID: "b", Domains: []string{"b.example.test"}, SourceType: "acme_http", Email: "two@example.test", Revision: 1},
	}
	out, _ := renderPanelCaddyfile(entry, certs, map[string]materializedCert{})
	if strings.Contains(out, "email ") {
		t.Fatalf("conflicting emails must not emit a global email:\n%s", out)
	}
}

func TestSanitizePanelCertificates(t *testing.T) {
	in := []panelCertificate{
		{ID: "ok", Domains: []string{" Panel.Example.Test ", "bad domain"}, SourceType: "acme_http", Email: " ops@example.test ", Revision: 1},
		{ID: "", Domains: []string{"x.example.test"}, SourceType: "acme_http", Revision: 1},
		{ID: "no-domains", Domains: []string{"!!"}, SourceType: "acme_http", Revision: 1},
		{ID: "bad-source", Domains: []string{"y.example.test"}, SourceType: "acme_dns", Revision: 1},
		{ID: "bad-email", Domains: []string{"z.example.test"}, SourceType: "acme_http", Email: "not an email", Revision: 2},
	}
	out := sanitizePanelCertificates(in)
	if len(out) != 2 {
		t.Fatalf("expected 2 survivors, got %d: %+v", len(out), out)
	}
	if !reflect.DeepEqual(out[0].Domains, []string{"panel.example.test"}) {
		t.Fatalf("domains not normalized: %+v", out[0].Domains)
	}
	if out[0].Email != "ops@example.test" {
		t.Fatalf("email not normalized: %q", out[0].Email)
	}
	if out[1].Email != "" {
		t.Fatalf("invalid email must be dropped: %q", out[1].Email)
	}
}

func TestMaterializeContentCerts(t *testing.T) {
	dir := t.TempDir()
	cert, key := testPEMPair(t, "content.example.test")
	certs := []panelCertificate{
		{ID: "11111111-2222-3333-4444-555555555555", SourceType: "content", CertificateContent: cert, PrivateKeyContent: key, Revision: 1},
		{ID: "missing", SourceType: "content", Revision: 1},
	}
	material, err := materializeContentCerts(dir, certs)
	if err == nil {
		t.Fatal("missing PEM material must be reported")
	}
	if len(material) != 1 {
		t.Fatalf("expected one materialized cert, got %d", len(material))
	}
	m := material["11111111-2222-3333-4444-555555555555"]
	if m.CertPath != filepath.Join(dir, "11111111-2222-3333-4444-555555555555", "tls.crt") {
		t.Fatalf("unexpected cert path: %s", m.CertPath)
	}

	// Idempotent rewrite with identical content keeps the same paths.
	again, err := materializeContentCerts(dir, certs[:1])
	if err != nil {
		t.Fatalf("rewrite failed: %v", err)
	}
	if again["11111111-2222-3333-4444-555555555555"] != m {
		t.Fatalf("materialization not idempotent: %+v", again)
	}

	// Stale directories are garbage collected.
	if err = os.MkdirAll(filepath.Join(dir, "stale-id"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err = materializeContentCerts(dir, certs[:1]); err != nil {
		t.Fatal(err)
	}
	if _, statErr := os.Stat(filepath.Join(dir, "stale-id")); !os.IsNotExist(statErr) {
		t.Fatal("stale materialized directory not removed")
	}
}

func TestAcmeRenewals(t *testing.T) {
	certs := []panelCertificate{
		{ID: "renew", Domains: []string{"panel.example.test", "*.panel.example.test"}, SourceType: "acme_http", Revision: 3},
		{ID: "fresh", Domains: []string{"new.example.test"}, SourceType: "acme_http", Revision: 1},
		{ID: "path", Domains: []string{"path.example.test"}, SourceType: "path", Revision: 5},
	}
	state := panelEntryState{Certificates: map[string]panelCertReport{
		"renew": {ID: "renew", Status: "valid", AppliedRevision: 2},
		"fresh": {ID: "fresh", Status: "issuing", AppliedRevision: 1},
		"path":  {ID: "path", Status: "valid", AppliedRevision: 4},
	}}
	renewed := acmeRenewals(certs, state)
	expected := []string{"panel.example.test", "*.panel.example.test"}
	if !reflect.DeepEqual(renewed, expected) {
		t.Fatalf("unexpected renewals: %v", renewed)
	}
}

func TestParseCertificatePEM(t *testing.T) {
	certPEM, _ := testPEMPair(t, "panel.example.test")
	meta, err := parseCertificatePEM([]byte(certPEM))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if len(meta.fingerprint) != 71 || meta.fingerprint[:7] != "SHA256:" {
		t.Fatalf("unexpected fingerprint format: %q", meta.fingerprint)
	}
	if meta.expires.Before(time.Now()) {
		t.Fatal("generated certificate already expired")
	}
	if _, err = parseCertificatePEM([]byte("not a pem")); err == nil {
		t.Fatal("invalid PEM accepted")
	}
}

func TestInspectAcmeCertificate(t *testing.T) {
	root := t.TempDir()
	certPEM, _ := testPEMPair(t, "panel.example.test")
	nested := filepath.Join(root, "caddy", "certificates", "acme-v02.api.letsencrypt.org-directory", "panel.example.test")
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, "panel.example.test.crt"), []byte(certPEM), 0o600); err != nil {
		t.Fatal(err)
	}
	meta, ok := inspectAcmeCertificate(root, "panel.example.test")
	if !ok {
		t.Fatal("issued certificate not found")
	}
	if meta.fingerprint == "" {
		t.Fatal("fingerprint missing")
	}
	if _, ok = inspectAcmeCertificate(root, "other.example.test"); ok {
		t.Fatal("unknown domain must not match")
	}
}

func TestPanelReportsEqual(t *testing.T) {
	a := map[string]panelCertReport{"x": {ID: "x", Status: "valid", AppliedRevision: 1}}
	b := map[string]panelCertReport{"x": {ID: "x", Status: "valid", AppliedRevision: 1}}
	if !panelReportsEqual(a, b) {
		t.Fatal("identical reports compared unequal")
	}
	b["x"] = panelCertReport{ID: "x", Status: "valid", AppliedRevision: 2}
	if panelReportsEqual(a, b) {
		t.Fatal("revision change must be detected")
	}
	b["x"] = panelCertReport{ID: "x", Status: "valid", AppliedRevision: 1}
	b["y"] = panelCertReport{ID: "y", Status: "pending", AppliedRevision: 1}
	if panelReportsEqual(a, b) {
		t.Fatal("added certificate must be detected")
	}
}

func TestCaddyStorageDomain(t *testing.T) {
	// Caddy encodes the wildcard label as a fixed prefix.
	if got := caddyStorageDomain("*.example.test"); got != "wildcard_..example.test" && got != "wildcard_*.example.test" {
		t.Fatalf("unexpected wildcard encoding: %s", got)
	}
	if got := caddyStorageDomain("a.example.test"); got != "a.example.test" {
		t.Fatalf("plain domain must not change: %s", got)
	}
}

func testPEMPair(t *testing.T, domain string) (string, string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		t.Fatal(err)
	}
	template := x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: domain},
		DNSNames:     []string{domain},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(90 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	certPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	keyPEM := string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}))
	return certPEM, keyPEM
}
