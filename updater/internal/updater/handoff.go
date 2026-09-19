package updater

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	HandoffSchemaVersion   = 1
	HandoffPrepared        = "prepared"
	HandoffTargetBooting   = "target_booting"
	HandoffTargetAdopted   = "target_adopted"
	HandoffAdminInstalling = "admin_installing"
	HandoffVerifying       = "verifying"
	HandoffSucceeded       = "succeeded"
	HandoffRollingBack     = "rolling_back"
	HandoffRolledBack      = "rolled_back"
	HandoffRollbackFailed  = "rollback_failed"
)

var handoffIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Handoff struct {
	SchemaVersion      int             `json:"schema_version"`
	TaskID             string          `json:"task_id"`
	ExecutorID         string          `json:"executor_id"`
	Scope              string          `json:"scope"`
	InstanceID         string          `json:"instance_id"`
	FromVersion        string          `json:"from_version"`
	ToVersion          string          `json:"to_version"`
	FromUpdaterVersion string          `json:"from_updater_version"`
	ToUpdaterVersion   string          `json:"to_updater_version"`
	Phase              string          `json:"phase"`
	Target             HandoffTarget   `json:"target"`
	Previous           HandoffPrevious `json:"previous"`
	Lease              HandoffLease    `json:"lease"`
	JournalSequence    int             `json:"journal_sequence"`
	CreatedAt          string          `json:"created_at"`
	UpdatedAt          string          `json:"updated_at"`
}

type HandoffTarget struct {
	Container        string `json:"container,omitempty"`
	HandoffContainer string `json:"handoff_container,omitempty"`
	DeploymentDir    string `json:"deployment_dir,omitempty"`
	StateDir         string `json:"state_dir,omitempty"`
	Socket           string `json:"socket,omitempty"`
}

type HandoffPrevious struct {
	UpdaterImage string `json:"updater_image,omitempty"`
	AdminImage   string `json:"admin_image,omitempty"`
	BinaryPath   string `json:"binary_path,omitempty"`
	BackupRef    string `json:"backup_ref,omitempty"`
}

type HandoffLease struct {
	Owner     string `json:"owner"`
	ExpiresAt string `json:"expires_at"`
}

func (h Handoff) Validate() error {
	if h.SchemaVersion != HandoffSchemaVersion {
		return fmt.Errorf("unsupported handoff schema: %d", h.SchemaVersion)
	}
	if !handoffIDPattern.MatchString(h.TaskID) || !namePattern.MatchString(h.ExecutorID) || !namePattern.MatchString(h.InstanceID) {
		return errors.New("invalid handoff identity")
	}
	if strings.TrimSpace(h.Scope) == "" || !versionPattern.MatchString(h.FromVersion) || !versionPattern.MatchString(h.ToVersion) || !versionPattern.MatchString(h.FromUpdaterVersion) || !versionPattern.MatchString(h.ToUpdaterVersion) {
		return errors.New("invalid handoff release identity")
	}
	if !validHandoffPhase(h.Phase) {
		return errors.New("invalid handoff phase")
	}
	if h.JournalSequence < 0 || !namePattern.MatchString(h.Lease.Owner) {
		return errors.New("invalid handoff lease or journal sequence")
	}
	if _, err := time.Parse(time.RFC3339, h.CreatedAt); err != nil {
		return errors.New("invalid handoff created_at")
	}
	if _, err := time.Parse(time.RFC3339, h.UpdatedAt); err != nil {
		return errors.New("invalid handoff updated_at")
	}
	if _, err := time.Parse(time.RFC3339, h.Lease.ExpiresAt); err != nil {
		return errors.New("invalid handoff lease expiry")
	}
	for _, path := range []string{h.Target.DeploymentDir, h.Target.StateDir, h.Target.Socket, h.Previous.BinaryPath} {
		if path != "" && (!isContractAbsolutePath(path) || isContractRoot(path)) {
			return errors.New("handoff paths must be absolute and must not refer to the filesystem root")
		}
	}
	for _, name := range []string{h.Target.Container, h.Target.HandoffContainer} {
		if name != "" && !namePattern.MatchString(name) {
			return errors.New("invalid handoff container name")
		}
	}
	return nil
}

func isContractAbsolutePath(value string) bool {
	return filepath.IsAbs(value) || strings.HasPrefix(value, "/")
}

func isContractRoot(value string) bool {
	return value == "/" || value == "\\" || filepath.Clean(value) == string(filepath.Separator)
}

func validHandoffPhase(phase string) bool {
	switch phase {
	case HandoffPrepared, HandoffTargetBooting, HandoffTargetAdopted, HandoffAdminInstalling,
		HandoffVerifying, HandoffSucceeded, HandoffRollingBack,
		HandoffRolledBack, HandoffRollbackFailed:
		return true
	default:
		return false
	}
}

func canTransitionHandoff(from, to string) bool {
	switch from {
	case HandoffPrepared:
		return to == HandoffTargetBooting || to == HandoffRollingBack
	case HandoffTargetBooting:
		return to == HandoffTargetAdopted || to == HandoffRollingBack
	case HandoffTargetAdopted:
		return to == HandoffAdminInstalling || to == HandoffRollingBack
	case HandoffAdminInstalling:
		return to == HandoffVerifying || to == HandoffRollingBack
	case HandoffVerifying:
		return to == HandoffSucceeded || to == HandoffRollingBack
	case HandoffRollingBack:
		return to == HandoffRolledBack || to == HandoffRollbackFailed
	default:
		return false
	}
}

func TransitionHandoff(h *Handoff, phase string) error {
	if h == nil || !canTransitionHandoff(h.Phase, phase) {
		if h == nil {
			return errors.New("invalid handoff transition: nil handoff")
		}
		return fmt.Errorf("invalid handoff transition: %s -> %s", h.Phase, phase)
	}
	candidate := *h
	candidate.Phase = phase
	candidate.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := candidate.Validate(); err != nil {
		return err
	}
	*h = candidate
	return nil
}

// AdoptHandoff transfers the recovery lease to the target updater. A repeated
// adoption by the same owner is intentionally idempotent so a retried
// one-shot handoff process cannot execute the task twice.
func AdoptHandoff(h *Handoff, owner string) error {
	if h == nil || !namePattern.MatchString(owner) {
		return errors.New("invalid handoff adoption owner")
	}
	if expiry, err := time.Parse(time.RFC3339, h.Lease.ExpiresAt); err != nil || !time.Now().UTC().Before(expiry) {
		return errors.New("handoff lease is expired")
	}
	switch h.Phase {
	case HandoffTargetAdopted:
		if h.Lease.Owner != owner {
			return errors.New("handoff is already adopted by another owner")
		}
		return h.Validate()
	case HandoffTargetBooting:
		candidate := *h
		candidate.Lease.Owner = owner
		if err := TransitionHandoff(&candidate, HandoffTargetAdopted); err != nil {
			return err
		}
		*h = candidate
		return nil
	default:
		return fmt.Errorf("handoff cannot be adopted from phase %s", h.Phase)
	}
}

func validateHandoffJournal(stateDir string, h Handoff) error {
	if !filepath.IsAbs(stateDir) || filepath.Clean(stateDir) == string(filepath.Separator) {
		return errors.New("handoff state directory must be absolute and dedicated")
	}
	if h.Target.StateDir == "" || filepath.Clean(h.Target.StateDir) != filepath.Clean(stateDir) {
		return errors.New("handoff state directory does not match the executor state directory")
	}
	raw, err := os.ReadFile(filepath.Join(stateDir, "active.json"))
	if err != nil {
		return errors.New("handoff adoption requires the active updater journal")
	}
	var journal Journal
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&journal); err != nil {
		return errors.New("handoff adoption found an invalid updater journal")
	}
	if journal.Task.ID != h.TaskID || journal.Task.InstanceID != h.InstanceID || journal.Task.Version != h.ToVersion || journal.Task.Sequence < h.JournalSequence {
		return errors.New("handoff does not match the active updater journal")
	}
	return nil
}

// AdoptHandoffFile validates the handoff and active journal while holding the
// executor lock, then atomically records target_adopted. It is intended for
// the short-lived handoff process before the target updater starts.
func AdoptHandoffFile(path, stateDir, owner, taskID, instanceID string) (Handoff, error) {
	var handoff Handoff
	if !filepath.IsAbs(path) || filepath.Clean(path) == string(filepath.Separator) {
		return handoff, errors.New("handoff path must be absolute and dedicated")
	}
	if stateDir == "" {
		stateDir = filepath.Dir(path)
	}
	if !filepath.IsAbs(stateDir) || filepath.Clean(stateDir) == string(filepath.Separator) {
		return handoff, errors.New("handoff state directory must be absolute and dedicated")
	}
	if !handoffIDPattern.MatchString(taskID) || !namePattern.MatchString(instanceID) {
		return handoff, errors.New("invalid handoff task or instance identity")
	}
	unlock, err := lock(filepath.Join(stateDir, "executor.lock"))
	if err != nil {
		return handoff, err
	}
	defer unlock()
	return adoptHandoffFileLocked(path, stateDir, owner, taskID, instanceID)
}

// adoptHandoffFileLocked is used by the long-running updater after it already
// owns executor.lock. The short-lived CLI uses AdoptHandoffFile above, which
// acquires the same lock around this function.
func adoptHandoffFileLocked(path, stateDir, owner, taskID, instanceID string) (Handoff, error) {
	var handoff Handoff
	handoff, err := LoadHandoff(path)
	if err != nil {
		return handoff, err
	}
	if handoff.TaskID != taskID || handoff.InstanceID != instanceID {
		return handoff, errors.New("handoff identity does not match the requested task")
	}
	if err = validateHandoffJournal(stateDir, handoff); err != nil {
		return handoff, err
	}
	if err = AdoptHandoff(&handoff, owner); err != nil {
		return handoff, err
	}
	if err = SaveHandoff(path, handoff); err != nil {
		return handoff, err
	}
	return handoff, nil
}

func LoadHandoff(path string) (Handoff, error) {
	var handoff Handoff
	raw, err := os.ReadFile(path)
	if err != nil {
		return handoff, err
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&handoff); err != nil {
		return handoff, err
	}
	if err = handoff.Validate(); err != nil {
		return handoff, err
	}
	return handoff, nil
}

func SaveHandoff(path string, handoff Handoff) error {
	if err := handoff.Validate(); err != nil {
		return err
	}
	return atomicJSON(path, handoff)
}
