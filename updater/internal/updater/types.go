package updater

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var versionPattern = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+(-dev\.[0-9]+\.[0-9]+)?$`)
var namePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$`)
var repositories = map[string]string{"xboard": "VoidInTheShell/Xboard", "xboard-admin": "VoidInTheShell/xboard-admin", "dk_theme": "VoidInTheShell/DK_Theme", "xboard-node": "VoidInTheShell/Xboard-Node"}

type Config struct {
	PanelURL           string `json:"panel_url"`
	TokenFile          string `json:"token_file"`
	StateDir           string `json:"state_dir"`
	ExecutorID         string `json:"executor_id,omitempty"`
	InstallationMethod string `json:"installation_method,omitempty"`
	HandoffPath        string `json:"handoff_path,omitempty"`
	// The updater is normally a Compose service. These values describe the
	// service which owns this process, rather than a task-provided resource.
	// Defaults are kept for the standard xboard-updater service so older
	// configurations remain readable.
	UpdaterContainer string   `json:"updater_container,omitempty"`
	UpdaterService   string   `json:"updater_service,omitempty"`
	DeploymentDir    string   `json:"deployment_dir,omitempty"`
	UpdaterImage     string   `json:"updater_image,omitempty"`
	Targets          []Target `json:"targets"`
}
type Target struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Component      string `json:"component"`
	Method         string `json:"method"`
	Binary         string `json:"binary,omitempty"`
	Service        string `json:"service,omitempty"`
	Container      string `json:"container,omitempty"`
	ComposeFile    string `json:"compose_file,omitempty"`
	ComposeEnvFile string `json:"compose_env_file,omitempty"`
	ComposeProject string `json:"compose_project,omitempty"`
	ComposeService string `json:"compose_service,omitempty"`
	HealthURL      string `json:"health_url"`
	// Hooks are local, administrator-owned argv arrays; never accepted from the panel.
	Quiesce []string `json:"quiesce,omitempty"`
	Backup  []string `json:"backup,omitempty"`
	Migrate []string `json:"migrate,omitempty"`
	Verify  []string `json:"verify,omitempty"`
	Restore []string `json:"restore,omitempty"`
	Resume  []string `json:"resume,omitempty"`
}

func (t Target) DatabaseRecovery() bool {
	return len(t.Quiesce) > 0 && len(t.Backup) > 0 && len(t.Migrate) > 0 && len(t.Verify) > 0 && len(t.Restore) > 0 && len(t.Resume) > 0
}

type Task struct {
	ID         string   `json:"task_id"`
	InstanceID string   `json:"instance_id"`
	Component  string   `json:"component"`
	Version    string   `json:"target_version"`
	Manifest   Manifest `json:"manifest"`
	Token      string   `json:"claim_token"`
	Sequence   int      `json:"sequence"`
	Status     string   `json:"status"`
	Reclaimed  bool     `json:"reclaimed"`
}
type Manifest struct {
	Schema       int    `json:"schema_version"`
	Component    string `json:"component"`
	Repository   string `json:"repository"`
	Version      string `json:"version"`
	Channel      string `json:"channel"`
	SourceCommit string `json:"source_commit"`
	// Image is retained only for component releases whose contract has not yet
	// moved to a named artifact map. Admin releases must use Artifacts.AdminImage.
	Image         string    `json:"image,omitempty"`
	Platforms     []string  `json:"platforms"`
	Artifacts     Artifacts `json:"artifacts"`
	Compatibility struct {
		Panel  int `json:"panel_contract"`
		Update int `json:"update_protocol"`
		State  int `json:"updater_state_schema"`
	} `json:"compatibility"`
}
type Artifacts struct {
	AdminImage      string            `json:"admin_image,omitempty"`
	UpdaterImage    string            `json:"updater_image,omitempty"`
	UpdaterBinaries map[string]string `json:"updater_binaries,omitempty"`
}
type Event struct {
	TaskID       string         `json:"task_id"`
	Token        string         `json:"claim_token"`
	Sequence     int            `json:"sequence"`
	Status       string         `json:"status"`
	HandoffPhase string         `json:"handoff_phase,omitempty"`
	RecoveryStep string         `json:"recovery_step,omitempty"`
	Message      string         `json:"message"`
	Result       map[string]any `json:"result,omitempty"`
}
type Journal struct {
	Task                   Task    `json:"task"`
	Target                 Target  `json:"target"`
	Previous               string  `json:"previous"`
	OldContainer           string  `json:"old_container,omitempty"`
	Mutating               bool    `json:"mutating"`
	Quiesced               bool    `json:"quiesced"`
	BackedUp               bool    `json:"backed_up"`
	Resumed                bool    `json:"resumed"`
	AdminReplaced          bool    `json:"admin_replaced,omitempty"`
	AdminRestored          bool    `json:"admin_restored,omitempty"`
	UpdaterSwitchAttempted bool    `json:"updater_switch_attempted,omitempty"`
	UpdaterReplaced        bool    `json:"updater_replaced,omitempty"`
	HandoffDelegated       bool    `json:"handoff_delegated,omitempty"`
	Done                   bool    `json:"done"`
	Events                 []Event `json:"events"`
	Ack                    int     `json:"ack"`
}

func Load(path string) (Config, error) {
	var c Config
	raw, err := os.ReadFile(path)
	if err != nil {
		return c, err
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&c); err != nil {
		return c, err
	}
	if err = c.Validate(); err != nil {
		return c, err
	}
	return c, nil
}
func (c Config) Validate() error {
	u, err := url.Parse(c.PanelURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"))) {
		return errors.New("panel_url requires HTTPS (HTTP is allowed only on loopback)")
	}
	if !filepath.IsAbs(c.TokenFile) || !filepath.IsAbs(c.StateDir) || filepath.Clean(c.StateDir) == string(filepath.Separator) {
		return errors.New("token_file and a dedicated state_dir must be absolute")
	}
	if c.ExecutorID != "" && !namePattern.MatchString(c.ExecutorID) {
		return errors.New("invalid executor_id")
	}
	if c.HandoffPath != "" && (!filepath.IsAbs(c.HandoffPath) || filepath.Clean(c.HandoffPath) == string(filepath.Separator)) {
		return errors.New("handoff_path must be absolute and dedicated")
	}
	for _, value := range []string{c.UpdaterContainer, c.UpdaterService} {
		if value != "" && !namePattern.MatchString(value) {
			return errors.New("invalid updater service identity")
		}
	}
	if c.DeploymentDir != "" && (!filepath.IsAbs(c.DeploymentDir) || filepath.Clean(c.DeploymentDir) == string(filepath.Separator)) {
		return errors.New("deployment_dir must be absolute and dedicated")
	}
	if c.UpdaterImage != "" && (strings.TrimSpace(c.UpdaterImage) != c.UpdaterImage || strings.ContainsAny(c.UpdaterImage, "\r\n\t \"'")) {
		return errors.New("invalid updater_image")
	}
	if len(c.Targets) == 0 {
		return errors.New("no local update targets configured")
	}
	ids := map[string]bool{}
	resources := map[string]bool{}
	for _, t := range c.Targets {
		if !namePattern.MatchString(t.ID) || ids[t.ID] || repositories[t.Component] == "" || strings.TrimSpace(t.Name) == "" || len(t.Name) > 100 {
			return errors.New("invalid or duplicate target")
		}
		ids[t.ID] = true
		if t.HealthURL == "" {
			return errors.New("every target requires a health_url")
		}
		health, e := url.Parse(t.HealthURL)
		if e != nil || health.Host == "" || (health.Scheme != "http" && health.Scheme != "https") {
			return errors.New("invalid health_url")
		}
		resource := ""
		switch t.Method {
		case "systemd":
			if t.Component != "xboard-node" || !filepath.IsAbs(t.Binary) || !namePattern.MatchString(t.Service) {
				return errors.New("systemd target requires node binary and service")
			}
			if resources["service:"+t.Service] {
				return errors.New("multiple targets share a systemd service")
			}
			resources["service:"+t.Service] = true
			resource = "binary:" + filepath.Clean(t.Binary)
		case "docker":
			if !namePattern.MatchString(t.Container) {
				return errors.New("invalid container name")
			}
			resource = "container:" + t.Container
		case "compose":
			if t.ComposeEnvFile != "" && !filepath.IsAbs(t.ComposeEnvFile) {
				return errors.New("compose_env_file must be absolute")
			}
			if !filepath.IsAbs(t.ComposeFile) || !namePattern.MatchString(t.ComposeProject) || !namePattern.MatchString(t.ComposeService) {
				return errors.New("compose target requires absolute file, project and service")
			}
			resource = "compose:" + t.ComposeProject + ":" + t.ComposeService
		default:
			return errors.New("method must be systemd, docker or compose")
		}
		if resources[resource] {
			return errors.New("multiple targets share the same installation resource")
		}
		resources[resource] = true
		if t.Component == "xboard" && !t.DatabaseRecovery() {
			return errors.New("xboard requires quiesce, backup, migrate, verify, restore and resume hooks")
		}
	}
	return nil
}
func (t Task) Validate(target Target) error {
	if matched, _ := regexp.MatchString(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`, t.ID); !matched || len(t.Token) != 48 {
		return errors.New("invalid task identity")
	}
	m := t.Manifest
	channel := "stable"
	if strings.Contains(t.Version, "-dev.") {
		channel = "dev"
	}
	if !versionPattern.MatchString(t.Version) || t.Component != target.Component || t.InstanceID != target.ID || m.Schema != 2 || m.Component != t.Component || m.Version != t.Version || m.Channel != channel || m.Repository != repositories[t.Component] || !regexp.MustCompile(`^[0-9a-fA-F]{40}$`).MatchString(m.SourceCommit) || m.Compatibility.Panel != 1 || m.Compatibility.Update != UpdateProtocol || m.Compatibility.State != UpdaterStateSchema {
		return errors.New("task release identity or compatibility mismatch")
	}
	expectedImage := "ghcr.io/voidintheshell/" + t.Component + ":" + t.Version
	if t.Component == "xboard-admin" {
		if m.Artifacts.AdminImage != expectedImage || m.Artifacts.UpdaterImage != "ghcr.io/voidintheshell/xboard-admin-updater:"+t.Version || m.Artifacts.UpdaterBinaries["linux/amd64"] != "https://github.com/VoidInTheShell/xboard-admin/releases/download/"+t.Version+"/xboard-updater-linux-amd64" || m.Artifacts.UpdaterBinaries["linux/arm64"] != "https://github.com/VoidInTheShell/xboard-admin/releases/download/"+t.Version+"/xboard-updater-linux-arm64" {
			return errors.New("admin release artifacts are not trusted")
		}
	} else if m.Image != expectedImage {
		return errors.New("release image is not trusted")
	}
	for _, platform := range m.Platforms {
		if platform == "linux/"+runtime.GOARCH {
			return nil
		}
	}
	return fmt.Errorf("unsupported architecture: %s", runtime.GOARCH)
}

func (m Manifest) TargetImage() string {
	if m.Component == "xboard-admin" && m.Artifacts.AdminImage != "" {
		return m.Artifacts.AdminImage
	}
	return m.Image
}

func (c Config) HandoffFile() string {
	if c.HandoffPath != "" {
		return c.HandoffPath
	}
	return filepath.Join(c.StateDir, "handoff.json")
}

func (c Config) HeartbeatInstallationMethod() string {
	if c.InstallationMethod != "" {
		return c.InstallationMethod
	}
	if len(c.Targets) == 0 {
		return "unknown"
	}
	method := c.Targets[0].Method
	for _, target := range c.Targets[1:] {
		if target.Method != method {
			return "mixed"
		}
	}
	return method
}
