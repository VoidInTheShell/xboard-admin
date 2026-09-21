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

func retireTestAgent(t *testing.T) (*Agent, string) {
	t.Helper()
	dir := t.TempDir()
	token := filepath.Join(dir, "token")
	if err := os.WriteFile(token, []byte("test-only"), 0600); err != nil {
		t.Fatal(err)
	}
	agent := New(Config{PanelURL: "http://127.0.0.1:1", StateDir: dir, TokenFile: token})
	return agent, dir
}

func withBuildVersion(t *testing.T, version string) {
	t.Helper()
	original := BuildVersionValue
	BuildVersionValue = version
	t.Cleanup(func() { BuildVersionValue = original })
}

func TestRetireSupersededHandoffQuietsOldExecutor(t *testing.T) {
	agent, dir := retireTestAgent(t)
	h := validTestHandoff()
	h.Phase = HandoffTargetBooting
	h.Target.StateDir = dir
	h.Lease.ExpiresAt = time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	if err := SaveHandoff(filepath.Join(dir, "handoff.json"), h); err != nil {
		t.Fatal(err)
	}
	withBuildVersion(t, h.FromUpdaterVersion)
	retired, err := agent.retireSupersededHandoff(context.Background())
	if err != nil {
		t.Fatalf("retire superseded handoff: %v", err)
	}
	if !retired {
		t.Fatal("old executor must retire quietly while the target owns a live handoff")
	}
}

func TestRetireKeepsTargetExecutorWorking(t *testing.T) {
	agent, dir := retireTestAgent(t)
	h := validTestHandoff()
	h.Phase = HandoffTargetBooting
	h.Target.StateDir = dir
	if err := SaveHandoff(filepath.Join(dir, "handoff.json"), h); err != nil {
		t.Fatal(err)
	}
	withBuildVersion(t, h.ToUpdaterVersion)
	retired, err := agent.retireSupersededHandoff(context.Background())
	if err != nil {
		t.Fatalf("target executor retire check: %v", err)
	}
	if retired {
		t.Fatal("the target updater must proceed to adoption instead of retiring")
	}
}

func TestRetireDelegatesRollbackFromStableExecutor(t *testing.T) {
	agent, dir := retireTestAgent(t)
	h := validTestHandoff()
	h.Phase = HandoffRollingBack
	h.Target.StateDir = dir
	h.Previous.UpdaterImage = "ghcr.io/voidintheshell/xboard-admin-updater:v0.1.0"
	if err := SaveHandoff(filepath.Join(dir, "handoff.json"), h); err != nil {
		t.Fatal(err)
	}
	target := Target{
		ID: h.InstanceID, Name: "Admin", Component: "xboard-admin", Method: "compose",
		ComposeFile: filepath.Join(dir, "compose.yaml"), ComposeProject: "retire-test", ComposeService: "admin",
		HealthURL: "http://127.0.0.1:1/healthz",
	}
	journal := Journal{Task: Task{ID: h.TaskID, InstanceID: h.InstanceID, Component: "xboard-admin", Version: h.ToVersion, Token: "123456789012345678901234567890123456789012345678"}, Target: target}
	raw, err := json.Marshal(journal)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "active.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}

	var commands []string
	handoffName := ""
	agent.Execute = func(_ context.Context, name string, args ...string) ([]byte, error) {
		line := name + " " + strings.Join(args, " ")
		commands = append(commands, line)
		switch {
		case strings.Contains(line, "run --no-deps") && strings.Contains(line, "xboard-updater"):
			for i, part := range strings.Fields(line) {
				if part == "--name" && i+1 < len(strings.Fields(line)) {
					handoffName = strings.Fields(line)[i+1]
				}
			}
			return nil, nil
		case strings.Contains(line, "ps --all --format json") && strings.Contains(line, "xboard-updater"):
			return []byte(fmt.Sprintf(`{"ID":"rollback-updater","Name":%q,"Image":%q,"State":"running"}`, handoffName, rollbackUpdaterImage(h))), nil
		default:
			return nil, fmt.Errorf("unexpected simulated command: %s", line)
		}
	}

	withBuildVersion(t, h.FromUpdaterVersion)
	retired, err := agent.retireSupersededHandoff(context.Background())
	if err != nil {
		t.Fatalf("delegate rollback: %v", err)
	}
	if !retired {
		t.Fatal("stable from-version executor must retire after delegating the rollback")
	}
	joined := strings.Join(commands, "\n")
	if !strings.Contains(joined, "run --no-deps") {
		t.Fatalf("rollback was not delegated to a one-off from-version executor: %s", joined)
	}
	// The Compose override must pin the from-version image for the one-off.
	override := filepath.Join(dir, "compose-retire-test.json")
	raw, readErr := os.ReadFile(override)
	if readErr != nil {
		t.Fatal(readErr)
	}
	var pinned struct {
		Services map[string]struct {
			Image string `json:"image"`
		} `json:"services"`
	}
	if err := json.Unmarshal(raw, &pinned); err != nil {
		t.Fatal(err)
	}
	if pinned.Services["xboard-updater"].Image != rollbackUpdaterImage(h) {
		t.Fatalf("rollback switch pinned %q, want the from-version image %q", pinned.Services["xboard-updater"].Image, rollbackUpdaterImage(h))
	}
}

func TestUpdaterImagePrefersBuildVersion(t *testing.T) {
	agent := New(Config{UpdaterImage: "ghcr.io/voidintheshell/xboard-admin-updater:v0.1.0"})
	withBuildVersion(t, "v0.2.3-dev.9.1")
	if got := agent.updaterImage(nil); got != "ghcr.io/voidintheshell/xboard-admin-updater:v0.2.3-dev.9.1" {
		t.Fatalf("updaterImage = %q, want the build-version image", got)
	}
}

func TestRollbackUpdaterImagePrefersFromVersion(t *testing.T) {
	h := validTestHandoff()
	h.Previous.UpdaterImage = "ghcr.io/voidintheshell/xboard-admin-updater:v0.1.0"
	want := "ghcr.io/voidintheshell/xboard-admin-updater:" + h.FromUpdaterVersion
	if got := rollbackUpdaterImage(h); got != want {
		t.Fatalf("rollbackUpdaterImage = %q, want %q", got, want)
	}
	h.FromUpdaterVersion = "dev"
	if got := rollbackUpdaterImage(h); got != h.Previous.UpdaterImage {
		t.Fatalf("rollbackUpdaterImage = %q, want the recorded previous image when the from version is unusable", got)
	}
}

func TestFlushDropsPermanentlyRejectedEvents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"message":"任务已结束。"}`))
	}))
	t.Cleanup(server.Close)
	dir := t.TempDir()
	token := filepath.Join(dir, "token")
	if err := os.WriteFile(token, []byte("test-only"), 0600); err != nil {
		t.Fatal(err)
	}
	agent := New(Config{PanelURL: server.URL, StateDir: dir, TokenFile: token})
	j := &Journal{Task: Task{ID: "12345678-1234-1234-1234-123456789abc", Token: "123456789012345678901234567890123456789012345678", Sequence: 2, Status: "rolling_back"},
		Events: []Event{
			{TaskID: "12345678-1234-1234-1234-123456789abc", Token: "123456789012345678901234567890123456789012345678", Sequence: 1, Status: "rolling_back", Message: "first"},
			{TaskID: "12345678-1234-1234-1234-123456789abc", Token: "123456789012345678901234567890123456789012345678", Sequence: 2, Status: "rolled_back", Message: "second"},
		}, Ack: 0}
	if err := agent.flush(context.Background(), j); err != nil {
		t.Fatalf("flush must tolerate permanently rejected receipts: %v", err)
	}
	if j.Ack != len(j.Events) {
		t.Fatalf("rejected events were not dropped: ack=%d events=%d", j.Ack, len(j.Events))
	}
}

func TestOneShotStopsAtTerminalHandoff(t *testing.T) {
	t.Setenv("XBOARD_UPDATER_HANDOFF_ONESHOT", "1")
	dir := t.TempDir()
	agent := New(Config{StateDir: dir})
	journal := &Journal{Task: Task{Status: "preparing"}}
	if err := agent.save(journal); err != nil {
		t.Fatal(err)
	}
	h := validTestHandoff()
	h.Phase = HandoffRolledBack
	if err := SaveHandoff(filepath.Join(dir, "handoff.json"), h); err != nil {
		t.Fatal(err)
	}
	if !agent.oneShotHandoffComplete() {
		t.Fatal("one-shot updater must stop once the handoff record is terminal")
	}
}
