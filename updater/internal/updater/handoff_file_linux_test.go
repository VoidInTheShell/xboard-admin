//go:build linux

package updater

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestAdoptHandoffFileLocksJournalAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	handoffPath := filepath.Join(dir, "handoff.json")
	h := validTestHandoff()
	h.Phase = HandoffTargetBooting
	h.Target.StateDir = dir
	h.JournalSequence = 2
	if err := SaveHandoff(handoffPath, h); err != nil {
		t.Fatal(err)
	}
	j := Journal{Task: Task{ID: h.TaskID, InstanceID: h.InstanceID, Version: h.ToVersion, Sequence: h.JournalSequence}}
	raw, err := json.Marshal(j)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "active.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}

	adopted, err := AdoptHandoffFile(handoffPath, dir, "executor-2", h.TaskID, h.InstanceID)
	if err != nil {
		t.Fatalf("adopt handoff file: %v", err)
	}
	if adopted.Phase != HandoffTargetAdopted || adopted.Lease.Owner != "executor-2" {
		t.Fatalf("unexpected adopted record: %#v", adopted)
	}
	if _, err := AdoptHandoffFile(handoffPath, dir, "executor-2", h.TaskID, h.InstanceID); err != nil {
		t.Fatalf("repeated adoption should be idempotent: %v", err)
	}
	if _, err := AdoptHandoffFile(handoffPath, dir, "executor-3", h.TaskID, h.InstanceID); err == nil {
		t.Fatal("expected a different lease owner to be rejected")
	}
}
