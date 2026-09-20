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
)

type adminHandoffHarness struct {
	running      string
	failAdminUp  bool
	adminUpCount int
	commands     []string
	reports      []map[string]any
	server       *httptest.Server
	agent        *Agent
	task         Task
	target       Target
	stateDir     string
}

func newAdminHandoffHarness(t *testing.T) *adminHandoffHarness {
	t.Helper()
	task, target := validAdminTask()
	target.Method = "compose"
	target.ComposeProject = "handoff-test"
	target.ComposeService = "admin"
	target.ComposeFile = filepath.Join(t.TempDir(), "compose.yaml")
	target.ComposeExtraFiles = []string{filepath.Join(t.TempDir(), "updater.override.yaml")}
	h := &adminHandoffHarness{running: "v0.2.0", task: task, target: target, stateDir: t.TempDir()}
	token := filepath.Join(h.stateDir, "token")
	if err := os.WriteFile(token, []byte("test-only"), 0600); err != nil {
		t.Fatal(err)
	}
	h.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/report") {
			var report map[string]any
			if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
				t.Errorf("decode report: %v", err)
			} else {
				h.reports = append(h.reports, report)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"data":true}`)
	}))
	t.Cleanup(h.server.Close)
	h.target.HealthURL = h.server.URL + "/healthz"
	h.agent = New(Config{PanelURL: h.server.URL, StateDir: h.stateDir, TokenFile: token, Targets: []Target{h.target}})
	h.agent.Execute = func(_ context.Context, name string, args ...string) ([]byte, error) {
		line := name + " " + strings.Join(args, " ")
		h.commands = append(h.commands, line)
		switch {
		case strings.Contains(line, "ps --all --quiet"):
			return []byte("handoff-admin"), nil
		case strings.Contains(line, "exec handoff-admin cat /etc/xboard-version"):
			return []byte(h.running), nil
		case strings.Contains(line, "inspect handoff-admin"):
			return []byte(`[{"Id":"handoff-admin","Config":{"Image":"ghcr.io/voidintheshell/xboard-admin:v0.2.0"}}]`), nil
		case strings.Contains(line, "pull ghcr.io/"):
			return nil, nil
		case strings.Contains(line, "up --detach") && strings.Contains(line, " xboard-updater"):
			return nil, nil
		case strings.Contains(line, "up --detach") && strings.Contains(line, " admin"):
			h.adminUpCount++
			if h.failAdminUp && h.adminUpCount == 1 {
				return nil, fmt.Errorf("simulated Admin start failure")
			}
			if h.adminUpCount == 1 {
				h.running = h.task.Version
			} else {
				h.running = "v0.2.0"
			}
			return nil, nil
		default:
			return nil, fmt.Errorf("unexpected simulated command: %s", line)
		}
	}
	return h
}

func TestAdminPerformPersistsBootingHandoffAndStartsTargetUpdater(t *testing.T) {
	h := newAdminHandoffHarness(t)
	if err := h.agent.perform(context.Background(), &Journal{Task: h.task, Target: h.target}); err != nil {
		t.Fatal(err)
	}
	record, err := LoadHandoff(h.agent.Config.HandoffFile())
	if err != nil {
		t.Fatal(err)
	}
	if record.Phase != HandoffTargetBooting {
		t.Fatalf("handoff phase = %s, want %s", record.Phase, HandoffTargetBooting)
	}
	joined := strings.Join(h.commands, "\n")
	if !strings.Contains(joined, h.task.Manifest.Artifacts.UpdaterImage) || !strings.Contains(joined, "xboard-updater") {
		t.Fatalf("target updater was not pulled and started: %s", joined)
	}
	if !strings.Contains(joined, h.target.ComposeExtraFiles[0]) {
		t.Fatalf("Compose overlay was not loaded: %s", joined)
	}
}

func TestAdminHandoffReportsJointSuccess(t *testing.T) {
	h := newAdminHandoffHarness(t)
	original := BuildVersionValue
	BuildVersionValue = h.task.Version
	t.Cleanup(func() { BuildVersionValue = original })
	j := &Journal{Task: h.task, Target: h.target}
	if err := h.agent.perform(context.Background(), j); err != nil {
		t.Fatal(err)
	}
	record, err := LoadHandoff(h.agent.Config.HandoffFile())
	if err != nil {
		t.Fatal(err)
	}
	record, err = AdoptHandoffFile(h.agent.Config.HandoffFile(), h.stateDir, h.agent.handoffOwner(), record.TaskID, record.InstanceID)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.agent.continueAdminHandoff(context.Background(), j, record); err != nil {
		t.Fatal(err)
	}
	final, err := LoadHandoff(h.agent.Config.HandoffFile())
	if err != nil {
		t.Fatal(err)
	}
	if final.Phase != HandoffSucceeded {
		t.Fatalf("handoff phase = %s, want %s", final.Phase, HandoffSucceeded)
	}
	for _, report := range h.reports {
		if report["status"] != "succeeded" {
			continue
		}
		result, _ := report["result"].(map[string]any)
		if result["version"] != h.task.Version || result["updater_version"] != h.task.Version || report["handoff_phase"] != HandoffSucceeded {
			t.Fatalf("joint success fields mismatch: %#v", report)
		}
		return
	}
	t.Fatal("no joint success report")
}

func TestAdminHandoffRollsBackAdminAndUpdater(t *testing.T) {
	h := newAdminHandoffHarness(t)
	original := BuildVersionValue
	BuildVersionValue = h.task.Version
	t.Cleanup(func() { BuildVersionValue = original })
	j := &Journal{Task: h.task, Target: h.target}
	if err := h.agent.perform(context.Background(), j); err != nil {
		t.Fatal(err)
	}
	record, err := LoadHandoff(h.agent.Config.HandoffFile())
	if err != nil {
		t.Fatal(err)
	}
	record, err = AdoptHandoffFile(h.agent.Config.HandoffFile(), h.stateDir, h.agent.handoffOwner(), record.TaskID, record.InstanceID)
	if err != nil {
		t.Fatal(err)
	}
	h.failAdminUp = true
	if err := h.agent.continueAdminHandoff(context.Background(), j, record); err != nil {
		t.Fatal(err)
	}
	final, err := LoadHandoff(h.agent.Config.HandoffFile())
	if err != nil {
		t.Fatal(err)
	}
	if final.Phase != HandoffRolledBack || h.running != "v0.2.0" {
		t.Fatalf("rollback did not restore Admin state: phase=%s version=%s", final.Phase, h.running)
	}
	joined := strings.Join(h.commands, "\n")
	if !strings.Contains(joined, final.Previous.UpdaterImage) {
		t.Fatalf("rollback did not start the previous updater image: %s", joined)
	}
	for _, report := range h.reports {
		if report["status"] == "rolled_back" {
			if report["handoff_phase"] != HandoffRolledBack {
				t.Fatalf("rollback handoff phase mismatch: %#v", report)
			}
			return
		}
	}
	t.Fatal("no rolled_back report")
}
