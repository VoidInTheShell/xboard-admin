package updater

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func validTestHandoff() Handoff {
	return Handoff{
		SchemaVersion:      HandoffSchemaVersion,
		TaskID:             "12345678-1234-1234-1234-123456789abc",
		ExecutorID:         "executor-1",
		Scope:              "xboard-admin",
		InstanceID:         "primary",
		FromVersion:        "v0.2.0",
		ToVersion:          "v0.3.0-dev.1.1",
		FromUpdaterVersion: "v0.2.0",
		ToUpdaterVersion:   "v0.3.0-dev.1.1",
		Phase:              HandoffPrepared,
		Target:             HandoffTarget{Container: "admin", HandoffContainer: "admin-handoff", DeploymentDir: "/srv/xboard-admin", StateDir: "/var/lib/xboard-updater", Socket: "/var/run/docker.sock"},
		Previous:           HandoffPrevious{UpdaterImage: "ghcr.io/voidintheshell/xboard-admin-updater:v0.2.0", AdminImage: "ghcr.io/voidintheshell/xboard-admin:v0.2.0"},
		Lease:              HandoffLease{Owner: "executor-1", ExpiresAt: "2099-01-01T00:00:00Z"},
		CreatedAt:          "2026-09-18T00:00:00Z",
		UpdatedAt:          "2026-09-18T00:00:00Z",
	}
}

func TestHandoffTransitions(t *testing.T) {
	h := validTestHandoff()
	for _, phase := range []string{HandoffTargetBooting, HandoffTargetAdopted, HandoffAdminInstalling, HandoffVerifying, HandoffSucceeded} {
		if err := TransitionHandoff(&h, phase); err != nil {
			t.Fatalf("transition to %s: %v", phase, err)
		}
	}
	if err := TransitionHandoff(&h, HandoffTargetBooting); err == nil {
		t.Fatal("expected terminal transition to be rejected")
	}
}

func TestHandoffRollbackTransition(t *testing.T) {
	h := validTestHandoff()
	for _, phase := range []string{HandoffRollingBack, HandoffRolledBack} {
		if err := TransitionHandoff(&h, phase); err != nil {
			t.Fatalf("transition to %s: %v", phase, err)
		}
	}
}

func TestHandoffAdoptionIsIdempotentAndOwnerBound(t *testing.T) {
	h := validTestHandoff()
	h.Phase = HandoffTargetBooting
	if err := AdoptHandoff(&h, "executor-2"); err != nil {
		t.Fatalf("adopt handoff: %v", err)
	}
	if h.Phase != HandoffTargetAdopted || h.Lease.Owner != "executor-2" {
		t.Fatalf("unexpected adopted handoff: phase=%s owner=%s", h.Phase, h.Lease.Owner)
	}
	if err := AdoptHandoff(&h, "executor-2"); err != nil {
		t.Fatalf("repeat adoption should be idempotent: %v", err)
	}
	if err := AdoptHandoff(&h, "executor-3"); err == nil {
		t.Fatal("expected a different owner to be rejected")
	}
}

func TestHandoffAdoptionRejectsExpiredLease(t *testing.T) {
	h := validTestHandoff()
	h.Phase = HandoffTargetBooting
	h.Lease.ExpiresAt = "2000-01-01T00:00:00Z"
	if err := AdoptHandoff(&h, "executor-2"); err == nil {
		t.Fatal("expected an expired lease to be rejected")
	}
	if h.Phase != HandoffTargetBooting {
		t.Fatalf("expired adoption mutated phase to %s", h.Phase)
	}
}

func TestHandoffSupportsNMinusOneAndRollbackVersionPairs(t *testing.T) {
	for _, pair := range [][2]string{{"v0.2.0", "v0.3.0-dev.1.1"}, {"v0.3.0-dev.1.1", "v0.2.0"}} {
		h := validTestHandoff()
		h.FromVersion, h.ToVersion = pair[0], pair[1]
		h.FromUpdaterVersion, h.ToUpdaterVersion = pair[0], pair[1]
		if err := h.Validate(); err != nil {
			t.Fatalf("version pair %v was rejected: %v", pair, err)
		}
	}
}

func TestHandoffFaultCannotSkipOrMutatePhase(t *testing.T) {
	h := validTestHandoff()
	if err := TransitionHandoff(&h, HandoffVerifying); err == nil {
		t.Fatal("expected a skipped transition to be rejected")
	}
	if h.Phase != HandoffPrepared {
		t.Fatalf("failed transition mutated phase to %s", h.Phase)
	}
	h.Target.StateDir = "/"
	if err := h.Validate(); err == nil {
		t.Fatal("expected root state directory to be rejected")
	}
}

func TestHandoffSaveLoadIsAtomicAndSecretFree(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "handoff.json")
	h := validTestHandoff()
	if err := SaveHandoff(path, h); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadHandoff(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.TaskID != h.TaskID || loaded.Phase != h.Phase {
		t.Fatalf("loaded handoff mismatch: %#v", loaded)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) == "" || containsSecretField(string(raw)) {
		t.Fatal("handoff contains an unexpected secret field")
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0600 {
			t.Fatalf("handoff permissions = %o, want 600", info.Mode().Perm())
		}
	}
}

func containsSecretField(value string) bool {
	for _, field := range []string{"token", "password", "secret"} {
		if contains(value, field) {
			return true
		}
	}
	return false
}

func contains(value, needle string) bool {
	for i := 0; i+len(needle) <= len(value); i++ {
		if value[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
