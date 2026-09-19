package updater

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestHeartbeatReportsUpdaterContract(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenFile, []byte("test-token"), 0600); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/v2/update-executor/heartbeat" {
			t.Fatalf("unexpected heartbeat path: %s", request.URL.Path)
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		_, _ = writer.Write([]byte(`{"data":{}}`))
	}))
	defer server.Close()

	target := Target{ID: "primary", Name: "Primary", Component: "xboard-node", Method: "systemd", Binary: "C:\\xboard-node.exe", Service: "xboard-node.service", HealthURL: "http://127.0.0.1:65530/healthz"}
	agent := New(Config{PanelURL: server.URL, TokenFile: tokenFile, StateDir: t.TempDir(), Targets: []Target{target}})
	agent.Execute = func(context.Context, string, ...string) ([]byte, error) { return []byte("v0.2.0\n"), nil }
	if err := agent.heartbeat(context.Background()); err != nil {
		t.Fatal(err)
	}
	if payload["updater_version"] != BuildVersion() || payload["update_protocol"] != float64(UpdateProtocol) || payload["updater_state_schema"] != float64(UpdaterStateSchema) || payload["installation_method"] != "systemd" {
		t.Fatalf("heartbeat contract fields mismatch: %#v", payload)
	}
	if payload["architecture"] != "linux/"+runtime.GOARCH {
		t.Fatalf("unexpected architecture: %#v", payload["architecture"])
	}
	instances, ok := payload["instances"].([]any)
	if !ok || len(instances) != 1 {
		t.Fatalf("unexpected instances: %#v", payload["instances"])
	}
}
