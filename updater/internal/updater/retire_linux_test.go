//go:build linux

package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// runRecoveryHarness models the wedge observed in production: the old updater
// delegated a handoff, the one-off target died before adoption, the handoff
// lease expired, and only the resurrected old service container remains.
type runRecoveryHarness struct {
	running  string
	commands []string
	reports  []map[string]any
	server   *httptest.Server
	agent    *Agent
	task     Task
	target   Target
	stateDir string
}

// rootStateDir provides a state directory whose entire parent chain is
// root-owned without group/other write bits, as secureOwner demands. Run-path
// tests need this and therefore also need to execute as root.
func rootStateDir(t *testing.T) string {
	t.Helper()
	if os.Getuid() != 0 {
		t.Skip("Run-path tests need a root-owned state directory chain")
	}
	base, err := os.UserHomeDir()
	if err != nil || base == "" {
		t.Skipf("no usable home directory for the root state chain: %v", err)
	}
	dir, err := os.MkdirTemp(base, "updater-run-test-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	return dir
}

func newRunRecoveryHarness(t *testing.T, phase, version string) *runRecoveryHarness {
	t.Helper()
	task, target := validAdminTask()
	target.Method = "compose"
	target.ComposeProject = "wedge-test"
	target.ComposeService = "admin"
	target.ComposeFile = filepath.Join(t.TempDir(), "compose.yaml")
	stateDir := rootStateDir(t)
	h := &runRecoveryHarness{running: "v0.2.0", task: task, target: target, stateDir: stateDir}
	token := filepath.Join(stateDir, "token")
	if err := os.WriteFile(token, []byte("test-only"), 0600); err != nil {
		t.Fatal(err)
	}
	h.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/report"):
			var report map[string]any
			if err := json.NewDecoder(r.Body).Decode(&report); err == nil {
				h.reports = append(h.reports, report)
			}
			_, _ = fmt.Fprint(w, `{"data":true}`)
		case strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_, _ = fmt.Fprint(w, `{"data":true}`)
		case strings.HasSuffix(r.URL.Path, "/claim"):
			_, _ = fmt.Fprint(w, `{"data":null}`)
		default:
			_, _ = fmt.Fprint(w, `{"data":true}`)
		}
	}))
	t.Cleanup(h.server.Close)
	target.HealthURL = h.server.URL + "/healthz"
	h.agent = New(Config{PanelURL: h.server.URL, StateDir: stateDir, TokenFile: token, Targets: []Target{h.target}})
	h.agent.Execute = func(_ context.Context, name string, args ...string) ([]byte, error) {
		line := name + " " + strings.Join(args, " ")
		h.commands = append(h.commands, line)
		switch {
		case strings.Contains(line, "ps --all --quiet"):
			return []byte("wedge-admin"), nil
		case strings.Contains(line, "exec wedge-admin cat /etc/xboard-version"):
			return []byte(h.running), nil
		case strings.Contains(line, "inspect wedge-admin"):
			return []byte(`[{"Id":"wedge-admin","Config":{"Image":"ghcr.io/voidintheshell/xboard-admin:v0.2.0"}}]`), nil
		case strings.Contains(line, "up --detach") && strings.Contains(line, " admin"):
			h.running = "v0.2.0"
			return nil, nil
		default:
			return nil, fmt.Errorf("unexpected simulated command: %s", line)
		}
	}

	// Durable wedge state: an expired handoff and an unfinished journal whose
	// task never reached the Admin replacement.
	handoff := validTestHandoff()
	handoff.TaskID = task.ID
	handoff.InstanceID = task.InstanceID
	handoff.FromVersion = "v0.2.0"
	handoff.ToVersion = task.Version
	handoff.FromUpdaterVersion = "v0.2.0"
	handoff.ToUpdaterVersion = task.Version
	handoff.Phase = phase
	handoff.Target.StateDir = stateDir
	handoff.Lease.ExpiresAt = time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	handoff.Previous.UpdaterImage = "ghcr.io/voidintheshell/xboard-admin-updater:v0.1.0"
	if err := SaveHandoff(filepath.Join(stateDir, "handoff.json"), handoff); err != nil {
		t.Fatal(err)
	}
	journal := Journal{Task: Task{ID: task.ID, InstanceID: task.InstanceID, Component: "xboard-admin", Version: task.Version, Token: task.Token, Sequence: 0, Status: "preparing"}, Target: target, Previous: "v0.2.0"}
	raw, err := json.Marshal(journal)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "active.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	// The prepare step snapshot the old executor left behind.
	taskDir := filepath.Join(stateDir, task.ID)
	if err := os.MkdirAll(taskDir, 0700); err != nil {
		t.Fatal(err)
	}
	snapshot := `{"Config":{"Image":"ghcr.io/voidintheshell/xboard-admin:v0.2.0"}}`
	if err := os.WriteFile(filepath.Join(taskDir, "container.json"), []byte(snapshot), 0600); err != nil {
		t.Fatal(err)
	}
	return h
}

func TestRunRecoversExpiredWedgedHandoff(t *testing.T) {
	h := newRunRecoveryHarness(t, HandoffTargetBooting, "v0.3.0-dev.123.1")
	withBuildVersion(t, "v0.2.0")
	if err := h.agent.Run(context.Background()); err != nil {
		t.Fatalf("Run must recover an expired wedged handoff instead of failing: %v", err)
	}
	final, err := LoadHandoff(filepath.Join(h.stateDir, "handoff.json"))
	if err != nil {
		t.Fatal(err)
	}
	if final.Phase != HandoffRolledBack {
		t.Logf("commands:\n%s", strings.Join(h.commands, "\n"))
		for _, report := range h.reports {
			t.Logf("report: %#v", report)
		}
		t.Fatalf("handoff phase = %s, want %s", final.Phase, HandoffRolledBack)
	}
	if _, err := os.Stat(filepath.Join(h.stateDir, "active.json")); !os.IsNotExist(err) {
		t.Fatal("the recovered journal must be renamed out of the active slot")
	}
	rolledBack := false
	for _, report := range h.reports {
		if report["status"] == "rolled_back" {
			rolledBack = true
		}
	}
	if !rolledBack {
		t.Fatal("no rolled_back report was delivered")
	}
	// The Compose override must pin the from-version updater image, never the
	// stale bootstrap image recorded in the handoff.
	override := filepath.Join(h.stateDir, "compose-"+h.target.ComposeProject+".json")
	raw, err := os.ReadFile(override)
	if err != nil {
		t.Fatal(err)
	}
	var pinned struct {
		Services map[string]struct {
			Image string `json:"image"`
		} `json:"services"`
	}
	if err := json.Unmarshal(raw, &pinned); err != nil {
		t.Fatal(err)
	}
	if pinned.Services["xboard-updater"].Image != "ghcr.io/voidintheshell/xboard-admin-updater:v0.2.0" {
		t.Fatalf("rollback pinned the wrong updater image: %s", raw)
	}
}

func TestRunRetiresSupersededExecutorQuietly(t *testing.T) {
	h := newRunRecoveryHarness(t, HandoffTargetBooting, "v0.3.0-dev.123.1")
	// Renew the lease: the target is presumed alive and owns the task.
	handoff, err := LoadHandoff(filepath.Join(h.stateDir, "handoff.json"))
	if err != nil {
		t.Fatal(err)
	}
	handoff.Lease.ExpiresAt = time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	if err := SaveHandoff(filepath.Join(h.stateDir, "handoff.json"), handoff); err != nil {
		t.Fatal(err)
	}
	withBuildVersion(t, "v0.2.0")
	if err := h.agent.Run(context.Background()); err != nil {
		t.Fatalf("Run must retire quietly: %v", err)
	}
	final, err := LoadHandoff(filepath.Join(h.stateDir, "handoff.json"))
	if err != nil {
		t.Fatal(err)
	}
	if final.Phase != HandoffTargetBooting {
		t.Fatalf("a superseded executor must not touch the handoff: phase=%s", final.Phase)
	}
	if len(h.commands) != 0 {
		t.Fatalf("a superseded executor must not run host commands: %s", strings.Join(h.commands, "\n"))
	}
}
