package updater

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Agent struct {
	Config  Config
	Client  *http.Client
	Execute func(context.Context, string, ...string) ([]byte, error)
}

func New(c Config) *Agent {
	return &Agent{Config: c, Client: &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, Execute: command}
}

// executorLockWait bounds how long a starting updater waits for a concurrent
// holder of executor.lock. The one-off handoff executor routinely starts
// while the delegating process is still exiting; failing fast here would
// abort the handoff and wedge the deployment.
const executorLockWait = 90 * time.Second

// handoffRecoveryGrace extends the handoff lease before the surviving old
// executor treats the target as lost and converts the handoff into a rollback.
const handoffRecoveryGrace = 5 * time.Minute

// permanentAPIError marks a panel rejection that can never succeed on retry
// (for example a report for a task the administrator already ended). Outbox
// consumers drop these instead of retrying forever.
type permanentAPIError struct{ err error }

func (e permanentAPIError) Error() string { return e.err.Error() }
func (e permanentAPIError) Unwrap() error { return e.err }

func isPermanentAPIError(err error) bool {
	var permanent permanentAPIError
	return errors.As(err, &permanent)
}

func (a *Agent) api(ctx context.Context, action string, input any, output any) error {
	token, err := os.ReadFile(a.Config.TokenFile)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(a.Config.PanelURL, "/")+"/api/v2/update-executor/"+action, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(token)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := a.Client.Do(req)
	if err != nil {
		return fmt.Errorf("update API unavailable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		wrapped := fmt.Errorf("update API %s returned HTTP %d", action, resp.StatusCode)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
			return permanentAPIError{err: wrapped}
		}
		return wrapped
	}
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&envelope); err != nil {
		return err
	}
	if output != nil {
		return json.Unmarshal(envelope.Data, output)
	}
	return nil
}
func atomicJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".update-")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(raw)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(name, path); err != nil {
		return err
	}
	return syncParent(path)
}
func (a *Agent) journalPath() string   { return filepath.Join(a.Config.StateDir, "active.json") }
func (a *Agent) save(j *Journal) error { return atomicJSON(a.journalPath(), j) }
func (a *Agent) event(ctx context.Context, j *Journal, status, message string, result map[string]any) error {
	j.Task.Sequence++
	j.Task.Status = status
	j.Events = append(j.Events, Event{TaskID: j.Task.ID, Token: j.Task.Token, Sequence: j.Task.Sequence, Status: status, Message: message, Result: result})
	if err := a.save(j); err != nil {
		return err
	}
	// Durable outbox allows self-update to continue while the panel is stopped.
	_ = a.flush(ctx, j)
	return nil
}

// handoffEvent advances the task and the local handoff record as one durable
// journal step. The report contains both status fields because the backend
// deliberately validates the task state machine and handoff state machine
// independently.
func (a *Agent) handoffEvent(ctx context.Context, j *Journal, status, phase, message string, result map[string]any, recoveryStep string) error {
	handoff, err := LoadHandoff(a.Config.HandoffFile())
	if err != nil {
		return err
	}
	if handoff.Phase != phase {
		if err = TransitionHandoff(&handoff, phase); err != nil {
			return err
		}
	}
	j.Task.Sequence++
	j.Task.Status = status
	j.Events = append(j.Events, Event{TaskID: j.Task.ID, Token: j.Task.Token, Sequence: j.Task.Sequence, Status: status,
		HandoffPhase: phase, RecoveryStep: recoveryStep, Message: message, Result: result})
	handoff.JournalSequence = j.Task.Sequence
	handoff.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err = handoff.Validate(); err != nil {
		return err
	}
	if err = a.save(j); err != nil {
		return err
	}
	if err = SaveHandoff(a.Config.HandoffFile(), handoff); err != nil {
		return err
	}
	// A stopped panel is expected during a handoff. Keep the event in the
	// private outbox when the API is unavailable; the next updater flushes it.
	_ = a.flush(ctx, j)
	return nil
}
func (a *Agent) flush(ctx context.Context, j *Journal) error {
	for j.Ack < len(j.Events) {
		if err := a.api(ctx, "report", j.Events[j.Ack], nil); err != nil {
			if isPermanentAPIError(err) {
				// The panel permanently rejected this receipt (typically the task
				// was aborted or re-claimed elsewhere). The database is
				// authoritative; drop the event instead of wedging the outbox.
				fmt.Fprintln(os.Stderr, "dropping rejected update event:", err)
				j.Ack++
				if err := a.save(j); err != nil {
					return err
				}
				continue
			}
			return err
		}
		j.Ack++
		if err := a.save(j); err != nil {
			return err
		}
	}
	return nil
}
func (a *Agent) heartbeat(ctx context.Context) error {
	rows := []map[string]any{}
	for _, target := range a.Config.Targets {
		current, err := a.current(ctx, target)
		ready := err == nil
		reason := ""
		if err != nil {
			reason = "无法读取本地实例版本，请检查更新器配置"
		}
		var version any = current
		if !versionPattern.MatchString(current) {
			version = nil
		}
		rows = append(rows, map[string]any{"id": target.ID, "name": target.Name, "component": target.Component, "version": version, "installation_method": target.Method, "ready": ready, "reason": reason,
			"capabilities": map[string]any{"panel_contract": 1, "database_recovery": target.DatabaseRecovery()}})
	}
	return a.api(ctx, "heartbeat", map[string]any{
		"updater_version":      BuildVersion(),
		"update_protocol":      UpdateProtocol,
		"updater_state_schema": UpdaterStateSchema,
		"architecture":         "linux/" + runtime.GOARCH,
		"installation_method":  a.Config.HeartbeatInstallationMethod(),
		"instances":            rows,
	}, nil)
}
func (a *Agent) Cycle(ctx context.Context) error {
	raw, err := os.ReadFile(a.journalPath())
	if err == nil {
		var j Journal
		if err = json.Unmarshal(raw, &j); err != nil {
			return errors.New("invalid update journal: manual recovery required")
		}
		if j.Task.Status == "succeeded" || j.Task.Status == "failed" || j.Task.Status == "rolled_back" || j.Task.Status == "rollback_failed" {
			j.Done = true
		}
		if !j.Done {
			// An Admin handoff has a separate continuation path. Never treat a
			// target-adopted journal as an ordinary interrupted replacement.
			if j.Task.Component == "xboard-admin" {
				handoff, handoffErr := LoadHandoff(a.Config.HandoffFile())
				if handoffErr == nil {
					switch handoff.Phase {
					case HandoffPrepared:
						if err = a.recoverHandoff(ctx, &j, "未完成的 Admin 交接需要回退"); err != nil {
							return err
						}
					case HandoffTargetBooting:
						if a.currentUpdaterVersion(&j) == handoff.ToUpdaterVersion {
							// Run normally adopts while holding executor.lock. This
							// branch is retained for a direct Cycle caller.
							handoff, err = adoptHandoffFileLocked(a.Config.HandoffFile(), a.Config.StateDir, a.handoffOwner(), handoff.TaskID, handoff.InstanceID)
							if err != nil {
								return err
							}
							return a.continueAdminHandoff(ctx, &j, handoff)
						}
						if j.HandoffDelegated {
							return errHandoffTransferred
						}
						if err = a.recoverHandoff(ctx, &j, "目标 Updater 未接管交接"); err != nil {
							return err
						}
					case HandoffTargetAdopted, HandoffAdminInstalling, HandoffVerifying:
						if a.currentUpdaterVersion(&j) != handoff.ToUpdaterVersion {
							if !handoffLeaseExpired(handoff) {
								return errHandoffTransferred
							}
							// The target adopted but died mid-flight and can no longer
							// resume. The surviving old executor restores both sides.
							if err = a.recoverHandoff(ctx, &j, "目标 Updater 中断且租约已过期，正在恢复原版本"); err != nil {
								return err
							}
						} else {
							return a.continueAdminHandoff(ctx, &j, handoff)
						}
					case HandoffRollingBack:
						if a.currentUpdaterVersion(&j) == handoff.FromUpdaterVersion {
							return a.continueHandoffRollback(ctx, &j, handoff)
						}
						if a.currentUpdaterVersion(&j) == handoff.ToUpdaterVersion {
							return a.recoverHandoff(ctx, &j, "目标 Updater 正在完成共同回退")
						}
						return errors.New("Admin rollback is running on an unknown updater version")
					default:
						// Terminal handoff records are handled by the journal
						// rename below. Unknown non-terminal records are unsafe.
						if !handoffTerminal(handoff.Phase) {
							return fmt.Errorf("invalid unfinished Admin handoff phase: %s", handoff.Phase)
						}
						j.Done = true
					}
				} else if !os.IsNotExist(handoffErr) {
					return fmt.Errorf("invalid Admin updater handoff: %w", handoffErr)
				} else if err = a.recover(ctx, &j); err != nil {
					// Never blindly re-execute an interrupted installation.
					return err
				}
			} else if err = a.recover(ctx, &j); err != nil {
				// Never blindly re-execute an interrupted installation.
				return err
			}
		}
		if err = a.flush(ctx, &j); err != nil {
			return err
		}
		if err = os.Rename(a.journalPath(), filepath.Join(a.Config.StateDir, j.Task.ID+".json")); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err = a.heartbeat(ctx); err != nil {
		return err
	}
	var task *Task
	if err = a.api(ctx, "claim", map[string]any{}, &task); err != nil {
		return err
	}
	if task == nil {
		return nil
	}
	for _, target := range a.Config.Targets {
		if target.ID != task.InstanceID {
			continue
		}
		if task.Reclaimed || task.Status != "preparing" || task.Sequence != 0 {
			return errors.New("active task has no local journal; restore the executor state directory before continuing")
		}
		if err = task.Validate(target); err != nil {
			return err
		}
		journal := &Journal{Task: *task, Target: target}
		if err = a.perform(ctx, journal); err != nil {
			return err
		}
		if journal.HandoffDelegated {
			return errHandoffTransferred
		}
		return nil
	}
	return errors.New("claimed task does not match a locally configured instance")
}

func (a *Agent) validateRunHandoff(handoff Handoff) error {
	if a.Config.ExecutorID != "" && handoff.ExecutorID != a.Config.ExecutorID {
		return errors.New("handoff belongs to another executor")
	}
	if err := validateHandoffJournal(a.Config.StateDir, handoff); err != nil {
		return err
	}
	for _, target := range a.Config.Targets {
		if target.ID == handoff.InstanceID {
			return nil
		}
	}
	return errors.New("handoff target is not configured on this executor")
}

func (a *Agent) oneShot() bool {
	return os.Getenv("XBOARD_UPDATER_HANDOFF_ONESHOT") == "1"
}

func (a *Agent) oneShotHandoffComplete() bool {
	if !a.oneShot() {
		return false
	}
	if raw, err := os.ReadFile(a.journalPath()); err == nil {
		var journal Journal
		if json.Unmarshal(raw, &journal) == nil {
			switch journal.Task.Status {
			case "succeeded", "failed", "rolled_back", "rollback_failed":
				return true
			default:
				if journal.Done {
					return true
				}
			}
		}
	}
	// A one-off executor exists only for its handoff. Once the record is
	// terminal there is nothing left for it to claim; a second executor must
	// never keep running under a --rm container name.
	handoff, err := LoadHandoff(a.Config.HandoffFile())
	if err == nil && handoffTerminal(handoff.Phase) {
		return true
	}
	return false
}

// lockExecutor acquires the executor lock, waiting out a concurrent holder.
// The one-off handoff executor routinely starts while the delegating process
// is still exiting, so an immediate failure would abort the handoff.
func (a *Agent) lockExecutor() (func(), error) {
	path := filepath.Join(a.Config.StateDir, "executor.lock")
	deadline := time.Now().Add(executorLockWait)
	for {
		unlock, err := lock(path)
		if err == nil {
			return unlock, nil
		}
		if time.Now().After(deadline) {
			return nil, err
		}
		time.Sleep(250 * time.Millisecond)
	}
}

// handoffLeaseExpired reports whether the handoff lease has been dead long
// enough that the target updater can no longer legitimately adopt it.
func handoffLeaseExpired(h Handoff) bool {
	expiry, err := time.Parse(time.RFC3339, h.Lease.ExpiresAt)
	if err != nil {
		return true
	}
	return time.Now().UTC().After(expiry.Add(handoffRecoveryGrace))
}

// retireSupersededHandoff runs before the executor lock is taken. While a
// non-terminal handoff assigns the active work to another updater version,
// this process must retire quietly: exiting fast keeps the old container
// stoppable so the Compose promotion can replace it, and avoids fighting the
// target for the lock. When the handoff lease has expired without progress,
// the surviving old executor converts the handoff into a rollback instead of
// crash-looping forever.
func (a *Agent) retireSupersededHandoff(ctx context.Context) (bool, error) {
	handoff, err := LoadHandoff(a.Config.HandoffFile())
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if handoffTerminal(handoff.Phase) {
		return false, nil
	}
	self := BuildVersion()
	switch handoff.Phase {
	case HandoffTargetBooting, HandoffTargetAdopted, HandoffAdminInstalling, HandoffVerifying:
		if self == handoff.ToUpdaterVersion {
			return false, nil
		}
		if !handoffLeaseExpired(handoff) {
			// The target updater owns the task. Exit quietly; the restart
			// policy brings this process back as a watchdog until the
			// promotion removes the old container or the lease expires.
			return true, nil
		}
		return true, a.recoverExpiredHandoff(ctx)
	case HandoffRollingBack:
		switch {
		case self == handoff.FromUpdaterVersion && a.oneShot():
			return false, nil
		case self == handoff.FromUpdaterVersion:
			if _, statErr := os.Stat(a.journalPath()); os.IsNotExist(statErr) {
				return true, a.closeOrphanedRollback(handoff)
			}
			// The stable service must not run the rollback against its own
			// container; delegate to a one-off from-version executor.
			return true, a.delegateHandoffRollback(ctx, handoff)
		case self == handoff.ToUpdaterVersion:
			// The from-version one-off executor owns the rollback.
			return true, nil
		default:
			return false, errors.New("rollback updater handoff belongs to an unknown version")
		}
	case HandoffPrepared:
		if self != handoff.FromUpdaterVersion {
			return false, errors.New("prepared handoff belongs to another updater version")
		}
		return false, nil
	default:
		return false, errors.New("unfinished updater handoff requires explicit adoption or rollback")
	}
}

// recoverExpiredHandoff performs one locked Cycle so the existing recovery
// branches can convert a wedged handoff into a rollback. The process exits
// afterwards; the restart policy brings it back as the normal service.
func (a *Agent) recoverExpiredHandoff(ctx context.Context) error {
	unlock, err := a.lockExecutor()
	if err != nil {
		return err
	}
	defer unlock()
	current, err := LoadHandoff(a.Config.HandoffFile())
	if err != nil {
		return err
	}
	if handoffTerminal(current.Phase) || !handoffLeaseExpired(current) {
		// The handoff progressed while this process waited for the lock.
		return nil
	}
	if _, statErr := os.Stat(a.journalPath()); os.IsNotExist(statErr) {
		// The task journal is gone: there is nothing left to roll back through
		// Cycle. Close the record so restarts stop attempting recovery.
		if current.Phase == HandoffRollingBack {
			return closeHandoffRecord(&current)
		}
		return errors.New("expired updater handoff has no local journal; manual recovery required")
	}
	return a.Cycle(ctx)
}

// closeOrphanedRollback closes a rolling-back handoff whose task journal no
// longer exists. Nothing is left to restore, so the record must not keep the
// executor retiring forever.
func (a *Agent) closeOrphanedRollback(handoff Handoff) error {
	unlock, err := a.lockExecutor()
	if err != nil {
		return err
	}
	defer unlock()
	current, err := LoadHandoff(a.Config.HandoffFile())
	if err != nil {
		return err
	}
	if current.Phase != HandoffRollingBack {
		return nil
	}
	if _, statErr := os.Stat(a.journalPath()); !os.IsNotExist(statErr) {
		return nil
	}
	return closeHandoffRecord(&current)
}

// delegateHandoffRollback starts a one-off executor of the previous updater
// version to finish a rolling-back handoff. The stable process exits right
// after the delegation so the promotion can replace its container.
func (a *Agent) delegateHandoffRollback(ctx context.Context, handoff Handoff) error {
	raw, err := os.ReadFile(a.journalPath())
	if err != nil {
		return fmt.Errorf("rollback handoff has no local journal: %w", err)
	}
	var j Journal
	if err = json.Unmarshal(raw, &j); err != nil {
		return err
	}
	if j.Task.ID != handoff.TaskID {
		return errors.New("rollback handoff does not match the active journal")
	}
	return a.switchUpdater(ctx, &j, rollbackUpdaterImage(handoff))
}

func (a *Agent) Run(ctx context.Context) error {
	if err := os.MkdirAll(a.Config.StateDir, 0700); err != nil {
		return err
	}
	if err := secureOwner(a.Config.StateDir); err != nil {
		return err
	}
	if err := os.Chmod(a.Config.StateDir, 0700); err != nil {
		return err
	}
	retired, err := a.retireSupersededHandoff(ctx)
	if err != nil {
		return err
	}
	if retired {
		return nil
	}
	unlock, err := a.lockExecutor()
	if err != nil {
		return err
	}
	defer unlock()
	if handoff, err := LoadHandoff(a.Config.HandoffFile()); err == nil {
		switch handoff.Phase {
		case HandoffSucceeded, HandoffRolledBack, HandoffRollbackFailed:
			// Terminal records remain available for audit and do not block the next task.
		case HandoffTargetBooting:
			// The target image proves its identity through the build version,
			// then performs the adoption while this process owns executor.lock.
			if BuildVersion() != handoff.ToUpdaterVersion {
				// Another version superseded this process between the pre-lock
				// retirement check and the lock. Never fight the target.
				return nil
			}
			adopted, err := adoptHandoffFileLocked(a.Config.HandoffFile(), a.Config.StateDir, a.handoffOwner(), handoff.TaskID, handoff.InstanceID)
			if err != nil {
				return fmt.Errorf("target updater handoff adoption failed: %w", err)
			}
			if err := a.validateRunHandoff(adopted); err != nil {
				return fmt.Errorf("invalid adopted updater handoff: %w", err)
			}
		case HandoffTargetAdopted, HandoffAdminInstalling, HandoffVerifying:
			if BuildVersion() != handoff.ToUpdaterVersion {
				// The target updater owns the task; retire quietly instead of
				// crash-looping against a live handoff.
				return nil
			}
			if err := a.validateRunHandoff(handoff); err != nil {
				return fmt.Errorf("invalid adopted updater handoff: %w", err)
			}
		case HandoffRollingBack:
			if BuildVersion() == handoff.ToUpdaterVersion {
				// The from-version one-off executor owns the rollback.
				return nil
			}
			if BuildVersion() != handoff.FromUpdaterVersion {
				return errors.New("rollback updater handoff belongs to an unknown version")
			}
			if !a.oneShot() {
				// The stable service must not run the rollback against its own
				// container; delegate to a one-off from-version executor.
				return a.delegateHandoffRollback(ctx, handoff)
			}
			if err := a.validateRunHandoff(handoff); err != nil {
				return fmt.Errorf("invalid rollback updater handoff: %w", err)
			}
		case HandoffPrepared:
			// The previous executor died between preparing the handoff and
			// starting the target. Cycle's recovery branch rolls it back while
			// this process owns the lock.
			if BuildVersion() != handoff.FromUpdaterVersion {
				return errors.New("prepared handoff belongs to another updater version")
			}
		default:
			return errors.New("unfinished updater handoff requires explicit adoption or rollback")
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("invalid updater handoff: %w", err)
	}
	for {
		if a.oneShotHandoffComplete() {
			return nil
		}
		if err = a.Cycle(ctx); err != nil {
			if errors.Is(err, errHandoffTransferred) {
				// The Compose operation started the target updater. Exiting this
				// process prevents the old binary from reclaiming the task.
				return nil
			}
			fmt.Fprintln(os.Stderr, err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(15 * time.Second):
		}
	}
}
