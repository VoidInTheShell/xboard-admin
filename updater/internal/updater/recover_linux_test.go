//go:build linux

package updater

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCLIRecoverArchivesCorruptState covers the controlled exit from a
// degraded executor: dry-run lists the findings, --yes archives the corrupted
// journal/handoff while readable files are left in place.
func TestCLIRecoverArchivesCorruptState(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("root test (executor lock and ownership checks)")
	}
	stateDir := t.TempDir()
	configDir := t.TempDir()
	configPath := filepath.Join(configDir, "config.json")
	tokenFile := filepath.Join(configDir, "token")
	if err := os.WriteFile(tokenFile, []byte("token"), 0600); err != nil {
		t.Fatal(err)
	}
	target := Target{ID: "primary", Name: "Primary", Component: "xboard-node", Method: "systemd", Binary: "/usr/local/bin/xboard-node", Service: "xboard-node.service", HealthURL: "http://127.0.0.1:65530/healthz"}
	config := Config{PanelURL: "https://panel.example.com", TokenFile: tokenFile, StateDir: stateDir, Targets: []Target{target}}
	raw, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(configPath, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(stateDir, "active.json"), []byte("{corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(config.HandoffFile(), []byte("{corrupt"), 0600); err != nil {
		t.Fatal(err)
	}

	if err = CLI([]string{"recover", "--config", configPath}); err != nil {
		t.Fatalf("dry-run recover failed: %v", err)
	}
	if _, err = os.Stat(filepath.Join(stateDir, "active.json")); err != nil {
		t.Fatal("dry-run must not touch the corrupted journal")
	}

	if err = CLI([]string{"recover", "--config", configPath, "--yes"}); err != nil {
		t.Fatalf("recover --yes failed: %v", err)
	}
	entries, err := os.ReadDir(stateDir)
	if err != nil {
		t.Fatal(err)
	}
	archived := map[string]bool{}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "active.json.corrupt-") {
			archived["journal"] = true
		}
		if strings.HasPrefix(entry.Name(), "handoff.json.corrupt-") {
			archived["handoff"] = true
		}
	}
	if !archived["journal"] || !archived["handoff"] {
		t.Fatalf("corrupted files were not archived: %#v", entries)
	}
}
