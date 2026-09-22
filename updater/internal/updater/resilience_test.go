package updater

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHeartbeatReportsDegradedTargetsNotReady(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenFile, []byte("test-token"), 0600); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		_, _ = writer.Write([]byte(`{"data":{}}`))
	}))
	defer server.Close()

	target := Target{ID: "primary", Name: "Primary", Component: "xboard-node", Method: "systemd", Binary: "/usr/local/bin/xboard-node", Service: "xboard-node.service", HealthURL: "http://127.0.0.1:65530/healthz"}
	agent := New(Config{PanelURL: server.URL, TokenFile: tokenFile, StateDir: t.TempDir(), Targets: []Target{target}})
	agent.Execute = func(context.Context, string, ...string) ([]byte, error) {
		t.Fatal("a degraded executor must not probe instances for versions")
		return nil, errors.New("unreachable")
	}
	agent.setDegraded(errors.New("invalid update journal: manual recovery required"))
	if err := agent.heartbeat(context.Background()); err != nil {
		t.Fatal(err)
	}
	instances, ok := payload["instances"].([]any)
	if !ok || len(instances) != 1 {
		t.Fatalf("unexpected instances: %#v", payload["instances"])
	}
	row, _ := instances[0].(map[string]any)
	if row["ready"] != false || row["version"] != nil {
		t.Fatalf("degraded instance row must be not-ready without a version: %#v", row)
	}
	if reason, _ := row["reason"].(string); !strings.Contains(reason, "manual recovery") {
		t.Fatalf("degraded reason missing: %#v", row)
	}
}

func TestCycleDegradesOnCorruptJournalAndSkipsClaim(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenFile, []byte("test-token"), 0600); err != nil {
		t.Fatal(err)
	}
	claims := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if strings.HasSuffix(request.URL.Path, "/claim") {
			claims++
		}
		_, _ = writer.Write([]byte(`{"data":null}`))
	}))
	defer server.Close()

	target := Target{ID: "primary", Name: "Primary", Component: "xboard-node", Method: "systemd", Binary: "/usr/local/bin/xboard-node", Service: "xboard-node.service", HealthURL: "http://127.0.0.1:65530/healthz"}
	stateDir := t.TempDir()
	agent := New(Config{PanelURL: server.URL, TokenFile: tokenFile, StateDir: stateDir, Targets: []Target{target}})
	if err := os.WriteFile(filepath.Join(stateDir, "active.json"), []byte("{not json"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := agent.Cycle(context.Background()); err != nil {
		t.Fatalf("a corrupt journal must degrade, not fail the cycle: %v", err)
	}
	if claims != 0 {
		t.Fatalf("a degraded executor must not claim tasks, claims=%d", claims)
	}
	if reason := agent.degradedReason(); !strings.Contains(reason, "manual recovery") {
		t.Fatalf("degraded reason not set: %q", reason)
	}

	// A repaired journal clears the degraded state on the next cycle.
	journal := &Journal{Task: Task{ID: "12345678-1234-1234-1234-123456789abc", Status: "succeeded"}, Target: target}
	if err := agent.save(journal); err != nil {
		t.Fatal(err)
	}
	if err := agent.Cycle(context.Background()); err != nil {
		t.Fatal(err)
	}
	if agent.degradedReason() != "" {
		t.Fatalf("degraded state must clear after repair: %q", agent.degradedReason())
	}
	// After the repair the executor resumes claiming; the empty queue simply
	// returns no task.
	if claims != 1 {
		t.Fatalf("the repaired cycle should have claimed once, claims=%d", claims)
	}
}

func TestCycleDegradesWhenClaimedTaskHasNoLocalJournal(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenFile, []byte("test-token"), 0600); err != nil {
		t.Fatal(err)
	}
	task, target := validAdminTask()
	task.Status = "preparing"
	task.Reclaimed = true
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if strings.HasSuffix(request.URL.Path, "/claim") {
			raw, _ := json.Marshal(task)
			_, _ = writer.Write([]byte(`{"data":` + string(raw) + `}`))
			return
		}
		_, _ = writer.Write([]byte(`{"data":null}`))
	}))
	defer server.Close()

	stateDir := t.TempDir()
	agent := New(Config{PanelURL: server.URL, TokenFile: tokenFile, StateDir: stateDir, Targets: []Target{target}})
	if err := agent.Cycle(context.Background()); err != nil {
		t.Fatalf("a reclaimed task without a journal must degrade, not fail: %v", err)
	}
	if reason := agent.degradedReason(); !strings.Contains(reason, "no local journal") {
		t.Fatalf("degraded reason not set: %q", reason)
	}
}

func TestAPIMarksAuthRejections(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()
	agent := New(Config{PanelURL: server.URL, TokenFile: filepath.Join(t.TempDir(), "token"), StateDir: t.TempDir()})
	if err := os.WriteFile(agent.Config.TokenFile, []byte("token"), 0600); err != nil {
		t.Fatal(err)
	}
	err := agent.api(context.Background(), "claim", map[string]any{}, nil)
	if !isAuthAPIError(err) {
		t.Fatalf("403 must be an auth rejection: %v", err)
	}
	// Auth rejections are deliberately not permanent: outbox events stay
	// queued and are delivered once credentials work again.
	if isPermanentAPIError(err) {
		t.Fatalf("auth rejections must not drop outbox events: %v", err)
	}
}

func TestTaskValidateProtocolFloor(t *testing.T) {
	adminTask, adminTarget := validAdminTask()
	adminTask.Manifest.Compatibility.Panel = 1
	adminTask.Manifest.Compatibility.Update = UpdateProtocol + 1
	adminTask.Manifest.Compatibility.State = UpdaterStateSchema
	// Admin tasks hand execution to the target updater, so a newer protocol
	// is acceptable: this is what keeps panel self-update unblocked when the
	// protocol constant is bumped in the future.
	if err := adminTask.Validate(adminTarget); err != nil {
		t.Fatalf("admin task with newer protocol should pass: %v", err)
	}
	adminTask.Manifest.Compatibility.Update = UpdateProtocolMin - 1
	if err := adminTask.Validate(adminTarget); err == nil {
		t.Fatal("admin task below the protocol floor must be rejected")
	}

	nodeTask, nodeTarget := validAdminTask()
	nodeTask.Component = "xboard-node"
	nodeTask.InstanceID = nodeTarget.ID
	nodeTask.Manifest.Component = "xboard-node"
	nodeTask.Manifest.Repository = repositories["xboard-node"]
	nodeTask.Manifest.Image = "ghcr.io/voidintheshell/xboard-node:" + nodeTask.Version
	nodeTask.Manifest.Artifacts = Artifacts{}
	nodeTarget.Component = "xboard-node"
	nodeTask.Manifest.Compatibility.Panel = 1
	nodeTask.Manifest.Compatibility.State = UpdaterStateSchema
	// Tasks executed by this process must stay within the supported range.
	nodeTask.Manifest.Compatibility.Update = UpdateProtocol + 1
	if err := nodeTask.Validate(nodeTarget); err == nil {
		t.Fatal("node task above the supported protocol must be rejected")
	}
	nodeTask.Manifest.Compatibility.Update = UpdateProtocol
	if err := nodeTask.Validate(nodeTarget); err != nil {
		t.Fatalf("node task at the current protocol should pass: %v", err)
	}
}

func TestHandoffToleratesUnknownFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "handoff.json")
	handoff, err := adminHandoffForTest()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(handoff)
	if err != nil {
		t.Fatal(err)
	}
	// A newer updater may extend the record; an older one rolled back onto the
	// host must still be able to read it.
	extended := map[string]any{}
	if err = json.Unmarshal(raw, &extended); err != nil {
		t.Fatal(err)
	}
	extended["future_field"] = "value"
	extendedRaw, _ := json.Marshal(extended)
	if err = os.WriteFile(path, extendedRaw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = LoadHandoff(path); err != nil {
		t.Fatalf("unknown handoff fields must be tolerated: %v", err)
	}
}

func adminHandoffForTest() (Handoff, error) {
	task, _ := validAdminTask()
	now := "2026-01-01T00:00:00Z"
	return Handoff{
		SchemaVersion:      HandoffSchemaVersion,
		TaskID:             task.ID,
		ExecutorID:         "panel-executor",
		Scope:              "panel",
		InstanceID:         task.InstanceID,
		FromVersion:        "v0.2.0",
		ToVersion:          task.Version,
		FromUpdaterVersion: "v0.2.0",
		ToUpdaterVersion:   task.Version,
		Phase:              HandoffPrepared,
		Target:             HandoffTarget{StateDir: "/var/lib/xboard-updater"},
		Lease:              HandoffLease{Owner: "panel-executor", ExpiresAt: "2026-01-01T00:30:00Z"},
		JournalSequence:    0,
		CreatedAt:          now,
		UpdatedAt:          now,
	}, nil
}
