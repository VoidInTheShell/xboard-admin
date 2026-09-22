package updater

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var errHandoffTransferred = errors.New("updater handoff transferred to target process")

const (
	defaultUpdaterContainer = "xboard-updater"
	defaultUpdaterService   = "xboard-updater"
	defaultHandoffOwner     = "xboard-updater-handoff"
	updaterImageRepository  = "ghcr.io/voidintheshell/xboard-admin-updater"
)

func command(ctx context.Context, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()
	if name == "docker" {
		args = append([]string{"--host", "unix:///var/run/docker.sock"}, args...)
	}
	output, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		return nil, fmt.Errorf("%s command failed", filepath.Base(name))
	}
	return output, nil
}
func (a *Agent) exec(ctx context.Context, name string, args ...string) (string, error) {
	out, err := a.Execute(ctx, name, args...)
	return strings.TrimSpace(string(out)), err
}
func (a *Agent) hook(ctx context.Context, j *Journal, args []string) error {
	if len(args) == 0 {
		return nil
	}
	expanded := make([]string, len(args))
	for i, arg := range args {
		expanded[i] = strings.ReplaceAll(arg, "{task_dir}", a.taskDir(j))
	}
	_, err := a.exec(ctx, expanded[0], expanded[1:]...)
	return err
}
func (a *Agent) taskDir(j *Journal) string { return filepath.Join(a.Config.StateDir, j.Task.ID) }

func (a *Agent) updaterContainer() string {
	if a.Config.UpdaterContainer != "" {
		return a.Config.UpdaterContainer
	}
	return defaultUpdaterContainer
}

func (a *Agent) updaterService() string {
	if a.Config.UpdaterService != "" {
		return a.Config.UpdaterService
	}
	return defaultUpdaterService
}

func (a *Agent) updaterDeploymentDir(t Target) string {
	if a.Config.DeploymentDir != "" {
		return filepath.Clean(a.Config.DeploymentDir)
	}
	if t.ComposeFile != "" {
		return filepath.Clean(filepath.Dir(t.ComposeFile))
	}
	return ""
}

func imageVersion(image string) string {
	index := strings.LastIndex(image, ":")
	if index < 0 || index+1 >= len(image) {
		return ""
	}
	version := image[index+1:]
	if !versionPattern.MatchString(version) {
		return ""
	}
	return version
}

func (a *Agent) currentUpdaterVersion(j *Journal) string {
	if versionPattern.MatchString(BuildVersion()) {
		return BuildVersion()
	}
	if a.Config.UpdaterImage != "" {
		if version := imageVersion(a.Config.UpdaterImage); version != "" {
			return version
		}
	}
	// Release binaries are ldflagged. This fallback keeps an unversioned
	// development binary from writing an invalid handoff record in offline
	// tooling; it is never used by a published updater.
	if j != nil && versionPattern.MatchString(j.Previous) {
		return j.Previous
	}
	return ""
}

func (a *Agent) updaterImage(j *Journal) string {
	// The running binary is the source of truth. The bootstrap writes
	// updater_image once at deployment time; the config value goes stale after
	// every later deploy or self-update and must never override the build
	// version when rolling back.
	version := ""
	if versionPattern.MatchString(BuildVersion()) {
		version = BuildVersion()
	} else {
		// Unversioned development builds fall back to the config image and
		// finally the task's previous version; published updaters never do.
		version = a.currentUpdaterVersion(j)
	}
	if version != "" {
		return updaterImageRepository + ":" + version
	}
	return a.Config.UpdaterImage
}

// rollbackUpdaterImage resolves the image a rollback must switch back to.
// Handoff records written by older updaters may pin a stale bootstrap image;
// the from version is authoritative whenever it is usable.
func rollbackUpdaterImage(handoff Handoff) string {
	if versionPattern.MatchString(handoff.FromUpdaterVersion) {
		return updaterImageRepository + ":" + handoff.FromUpdaterVersion
	}
	return handoff.Previous.UpdaterImage
}

func (a *Agent) handoffOwner() string { return defaultHandoffOwner }

func handoffTerminal(phase string) bool {
	return phase == HandoffSucceeded || phase == HandoffRolledBack || phase == HandoffRollbackFailed
}

func (a *Agent) compose(ctx context.Context, t Target, extra []string, args ...string) (string, error) {
	base := []string{"compose", "--project-name", t.ComposeProject, "--file", t.ComposeFile}
	if t.ComposeEnvFile != "" {
		base = append(base, "--env-file", t.ComposeEnvFile)
	}
	for _, file := range t.ComposeExtraFiles {
		base = append(base, "--file", file)
	}
	persistent := filepath.Join(a.Config.StateDir, "compose-"+t.ComposeProject+".json")
	if _, err := os.Stat(persistent); err == nil {
		base = append(base, "--file", persistent)
	}
	for _, file := range extra {
		base = append(base, "--file", file)
	}
	return a.exec(ctx, "docker", append(base, args...)...)
}

type composeContainer struct {
	ID    string `json:"ID"`
	Name  string `json:"Name"`
	Image string `json:"Image"`
	State string `json:"State"`
}

func (a *Agent) composeContainers(ctx context.Context, t Target, service string) ([]composeContainer, error) {
	raw, err := a.compose(ctx, t, nil, "ps", "--all", "--format", "json", service)
	if err != nil {
		return nil, err
	}
	var containers []composeContainer
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var container composeContainer
		if err := json.Unmarshal([]byte(line), &container); err != nil {
			return nil, fmt.Errorf("invalid Compose container listing: %w", err)
		}
		if container.ID == "" || container.Name == "" || container.Image == "" {
			return nil, errors.New("Compose container listing is incomplete")
		}
		containers = append(containers, container)
	}
	return containers, nil
}

func (a *Agent) persistHandoffContainer(name string) error {
	if name == "" || !namePattern.MatchString(name) {
		return errors.New("invalid handoff container name")
	}
	handoff, err := LoadHandoff(a.Config.HandoffFile())
	if err != nil {
		return err
	}
	handoff.Target.HandoffContainer = name
	handoff.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return SaveHandoff(a.Config.HandoffFile(), handoff)
}

func (a *Agent) nextHandoffContainer(j *Journal) string {
	// A rollback can start another target while the first one is still the
	// running executor. Include a per-switch timestamp so the second one-off
	// container never collides with the first handoff container.
	taskPrefix := j.Task.ID
	if len(taskPrefix) > 8 {
		taskPrefix = taskPrefix[:8]
	}
	return fmt.Sprintf("%s-%s-%d", a.handoffOwner(), taskPrefix, time.Now().UTC().UnixNano())
}

// cleanupPreviousUpdater removes the stopped pre-handoff service container and
// promotes the running one-off target into the declared Compose service. A
// Compose `run --detach --rm` target deliberately has oneoff labels and no
// restart policy; leaving it under the stable service name would make future
// `compose up` calls conflict with that container. Create the real service
// after the old container is gone, start it, and let the one-off target exit
// and remove itself.
func (a *Agent) cleanupPreviousUpdater(ctx context.Context, t Target, handoff Handoff) error {
	previous := handoff.Target.Container
	target := handoff.Target.HandoffContainer
	if previous == "" {
		return nil
	}
	if target == "" {
		return errors.New("handoff target updater container is missing")
	}
	if previous == target {
		return nil
	}
	previousGone := false
	for i := 0; i < 60; i++ {
		status, err := a.exec(ctx, "docker", "inspect", "--format", "{{.State.Status}}", previous)
		if err != nil {
			previousGone = true
			break
		}
		if strings.TrimSpace(status) != "running" {
			if _, rmErr := a.exec(ctx, "docker", "rm", previous); rmErr != nil {
				if _, inspectErr := a.exec(ctx, "docker", "inspect", previous); inspectErr == nil {
					// The restart policy keeps the superseded service container in a
					// restarting state where a plain rm is refused. Force-remove it:
					// journal ownership already moved to the target updater, so the
					// old process has nothing durable left to write.
					if _, forceErr := a.exec(ctx, "docker", "rm", "-f", previous); forceErr != nil {
						return fmt.Errorf("remove stopped previous updater: %w", rmErr)
					}
				}
			}
			previousGone = true
			break
		}
		// The old service exits with code 0 while superseded and is restarted
		// by its restart policy with growing backoff; a one-minute window is
		// enough to catch a non-running moment for removal.
		time.Sleep(time.Second)
	}
	if !previousGone {
		return errors.New("previous updater container did not stop")
	}
	if _, err := a.compose(ctx, t, nil, "up", "--detach", "--no-deps", "--no-build", "--pull", "never", a.updaterService()); err != nil {
		return fmt.Errorf("promote updater service: %w", err)
	}
	status, err := a.exec(ctx, "docker", "inspect", "--format", "{{.State.Status}}", previous)
	if err != nil {
		return fmt.Errorf("promoted updater service is missing: %w", err)
	}
	if err := a.persistHandoffContainer(previous); err != nil {
		return err
	}
	if strings.TrimSpace(status) != "running" {
		if _, err := a.exec(ctx, "docker", "start", previous); err != nil {
			return fmt.Errorf("start promoted updater service: %w", err)
		}
	}
	return nil
}
func (a *Agent) container(ctx context.Context, t Target) (string, error) {
	if t.Method == "docker" {
		return t.Container, nil
	}
	id, err := a.compose(ctx, t, nil, "ps", "--all", "--quiet", t.ComposeService)
	if err != nil {
		return "", err
	}
	if id == "" || strings.ContainsAny(id, "\r\n") {
		return "", errors.New("expected exactly one compose service container")
	}
	return id, nil
}

var versionToken = regexp.MustCompile(`\bv[0-9][a-zA-Z0-9.+-]*`)

func readVersion(output string, legacy bool) string {
	for _, token := range versionToken.FindAllString(output, -1) {
		if versionPattern.MatchString(token) || (legacy && regexp.MustCompile(`^v[0-9]+\.[0-9]+$`).MatchString(token)) {
			return token
		}
	}
	return ""
}

func (a *Agent) current(ctx context.Context, t Target) (string, error) {
	var output string
	var err error
	if t.Method == "systemd" {
		output, err = a.exec(ctx, t.Binary, "-v")
	} else {
		var id string
		id, err = a.container(ctx, t)
		if err != nil {
			return "", err
		}
		if t.Component == "xboard-node" {
			output, err = a.exec(ctx, "docker", "exec", id, "xboard-node", "-v")
		} else {
			output, err = a.exec(ctx, "docker", "exec", id, "cat", "/etc/xboard-version")
		}
	}
	if err != nil {
		return "", err
	}
	v := readVersion(output, t.Component == "xboard-node")
	if v == "" {
		return "", errors.New("running instance has no identifiable release version")
	}
	return v, nil
}
func (a *Agent) healthy(ctx context.Context, t Target, version string) error {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	for attempt := 0; attempt < 30; attempt++ {
		current, err := a.current(ctx, t)
		if err == nil && current == version {
			request, e := http.NewRequestWithContext(ctx, "GET", t.HealthURL, nil)
			if e == nil {
				response, e := a.Client.Do(request)
				if e == nil {
					io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
					response.Body.Close()
					if response.StatusCode >= 200 && response.StatusCode < 300 {
						return nil
					}
				}
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return errors.New("instance health or exact version verification failed")
}
func copyFile(source, destination string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	file, err := os.CreateTemp(filepath.Dir(destination), ".replacement-")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, err = io.Copy(file, input)
	if err == nil {
		err = file.Chmod(mode)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(file.Name(), destination); err != nil {
		return err
	}
	return syncParent(destination)
}

func (a *Agent) previousAdminImage(j *Journal) (string, error) {
	raw, err := os.ReadFile(filepath.Join(a.taskDir(j), "container.json"))
	if err != nil {
		return "", err
	}
	var snapshot struct {
		Config struct {
			Image string
		}
	}
	if err = json.Unmarshal(raw, &snapshot); err != nil {
		return "", err
	}
	if strings.TrimSpace(snapshot.Config.Image) == "" {
		return "", errors.New("Admin container snapshot has no image")
	}
	return snapshot.Config.Image, nil
}

func (a *Agent) adminHandoff(j *Journal) (Handoff, error) {
	if j.Target.Component != "xboard-admin" {
		return Handoff{}, errors.New("handoff is only supported for the Admin component")
	}
	if j.Target.Method != "compose" {
		return Handoff{}, errors.New("Admin self-update requires a Compose-managed updater")
	}
	fromUpdater := a.currentUpdaterVersion(j)
	if !versionPattern.MatchString(fromUpdater) {
		return Handoff{}, errors.New("running updater has no identifiable release version")
	}
	deploymentDir := a.updaterDeploymentDir(j.Target)
	if deploymentDir == "" || !filepath.IsAbs(deploymentDir) || filepath.Clean(deploymentDir) == string(filepath.Separator) {
		return Handoff{}, errors.New("Admin handoff requires an explicit deployment directory")
	}
	previousAdmin, err := a.previousAdminImage(j)
	if err != nil {
		return Handoff{}, err
	}
	executorID := a.Config.ExecutorID
	if executorID == "" {
		executorID = "panel-executor"
	}
	if len(j.Task.ID) < 8 {
		return Handoff{}, errors.New("handoff task identity is too short")
	}
	now := time.Now().UTC()
	handoff := Handoff{
		SchemaVersion:      HandoffSchemaVersion,
		TaskID:             j.Task.ID,
		ExecutorID:         executorID,
		Scope:              "panel",
		InstanceID:         j.Task.InstanceID,
		FromVersion:        j.Previous,
		ToVersion:          j.Task.Version,
		FromUpdaterVersion: fromUpdater,
		ToUpdaterVersion:   j.Task.Version,
		Phase:              HandoffPrepared,
		Target: HandoffTarget{
			Container:        a.updaterContainer(),
			HandoffContainer: fmt.Sprintf("%s-%s", defaultHandoffOwner, j.Task.ID[:8]),
			DeploymentDir:    deploymentDir,
			StateDir:         filepath.Clean(a.Config.StateDir),
			Socket:           "/var/run/docker.sock",
		},
		Previous: HandoffPrevious{
			UpdaterImage: a.updaterImage(j),
			AdminImage:   previousAdmin,
			BackupRef:    a.taskDir(j),
		},
		Lease: HandoffLease{
			Owner:     executorID,
			ExpiresAt: now.Add(30 * time.Minute).Format(time.RFC3339),
		},
		JournalSequence: j.Task.Sequence,
		CreatedAt:       now.Format(time.RFC3339),
		UpdatedAt:       now.Format(time.RFC3339),
	}
	if handoff.Previous.UpdaterImage == "" {
		return Handoff{}, errors.New("running updater image is not identifiable")
	}
	if err = handoff.Validate(); err != nil {
		return Handoff{}, err
	}
	return handoff, nil
}

func (a *Agent) writePreparedHandoff(j *Journal) error {
	path := a.Config.HandoffFile()
	if existing, err := LoadHandoff(path); err == nil {
		if !handoffTerminal(existing.Phase) {
			return errors.New("an unfinished updater handoff already exists")
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("invalid existing updater handoff: %w", err)
	}
	handoff, err := a.adminHandoff(j)
	if err != nil {
		return err
	}
	return SaveHandoff(path, handoff)
}

func (a *Agent) transitionHandoff(j *Journal, phase string) error {
	handoff, err := LoadHandoff(a.Config.HandoffFile())
	if err != nil {
		return err
	}
	if handoff.Phase == phase {
		return nil
	}
	if err = TransitionHandoff(&handoff, phase); err != nil {
		return err
	}
	handoff.JournalSequence = j.Task.Sequence
	return SaveHandoff(a.Config.HandoffFile(), handoff)
}

func (a *Agent) composeOverridePath(t Target) string {
	return filepath.Join(a.Config.StateDir, "compose-"+t.ComposeProject+".json")
}

func (a *Agent) setComposeServiceImage(t Target, service, image string) error {
	if service == "" || !namePattern.MatchString(service) || strings.TrimSpace(image) == "" || strings.ContainsAny(image, "\r\n\t \"") {
		return errors.New("invalid Compose service image override")
	}
	override := a.composeOverridePath(t)
	definition := map[string]map[string]any{"services": {}}
	if raw, readErr := os.ReadFile(override); readErr == nil {
		if err := json.Unmarshal(raw, &definition); err != nil {
			return err
		}
	} else if !os.IsNotExist(readErr) {
		return readErr
	}
	if definition["services"] == nil {
		definition["services"] = map[string]any{}
	}
	definition["services"][service] = map[string]any{"image": image, "pull_policy": "never"}
	return atomicJSON(override, definition)
}

func (a *Agent) switchUpdater(ctx context.Context, j *Journal, image string) error {
	if j.Target.Method != "compose" {
		return errors.New("updater self-switch requires a Compose-managed executor")
	}
	if err := a.setComposeServiceImage(j.Target, a.updaterService(), image); err != nil {
		return err
	}
	// `compose up`/`create` reconciles the service and can remove a fixed
	// `container_name` before the replacement process is ready. Start the new
	// updater as a named one-off container instead; the old service remains
	// alive until the target has adopted the durable handoff. Once the old
	// service exits, cleanupPreviousUpdater creates the real Compose service.
	handoffName := a.nextHandoffContainer(j)
	if _, err := a.compose(ctx, j.Target, nil, "run", "--no-deps", "--rm", "--detach", "--pull", "never", "--env", "XBOARD_UPDATER_HANDOFF_ONESHOT=1", "--name", handoffName, a.updaterService()); err != nil {
		return err
	}
	containers, err := a.composeContainers(ctx, j.Target, a.updaterService())
	if err != nil {
		return err
	}
	var target *composeContainer
	for i := range containers {
		candidate := &containers[i]
		if candidate.Name == handoffName && candidate.Image == image {
			target = candidate
			break
		}
	}
	if target == nil {
		for i := range containers {
			candidate := &containers[i]
			if candidate.Image == image && candidate.State == "running" {
				target = candidate
				break
			}
		}
	}
	if target == nil {
		return errors.New("Compose did not create the target updater container")
	}
	if err := a.persistHandoffContainer(target.Name); err != nil {
		return err
	}
	if target.State != "running" {
		return errors.New("Compose did not keep the target updater running")
	}
	return nil
}
func (a *Agent) prepare(ctx context.Context, j *Journal) error {
	var err error
	j.Previous, err = a.current(ctx, j.Target)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(a.taskDir(j), 0700); err != nil {
		return err
	}
	if j.Target.Method == "systemd" {
		if err = copyFile(j.Target.Binary, filepath.Join(a.taskDir(j), "previous-binary"), 0700); err != nil {
			return err
		}
		download := "https://github.com/" + repositories[j.Task.Component] + "/releases/download/" + j.Task.Version + "/xboard-node-linux-" + architecture()
		// Downloads may redirect to GitHub's HTTPS release asset host, without executor credentials.
		client := &http.Client{Timeout: 10 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 3 || req.URL.Scheme != "https" || !(req.URL.Hostname() == "github.com" || strings.HasSuffix(req.URL.Hostname(), ".githubusercontent.com")) {
				return errors.New("untrusted release asset redirect")
			}
			return nil
		}}
		req, e := http.NewRequestWithContext(ctx, "GET", download, nil)
		if e != nil {
			return e
		}
		res, e := client.Do(req)
		if e != nil {
			return e
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			return errors.New("release binary unavailable")
		}
		f, e := os.OpenFile(filepath.Join(a.taskDir(j), "next-binary"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0700)
		if e != nil {
			return e
		}
		size, e := io.Copy(f, io.LimitReader(res.Body, (512<<20)+1))
		syncErr := f.Sync()
		closeErr := f.Close()
		if e != nil {
			return e
		}
		if syncErr != nil {
			return syncErr
		}
		if closeErr != nil {
			return closeErr
		}
		if size == 0 || size > 512<<20 {
			return errors.New("invalid binary size")
		}
		output, e := a.exec(ctx, filepath.Join(a.taskDir(j), "next-binary"), "-v")
		if e != nil || readVersion(output, false) != j.Task.Version {
			return errors.New("downloaded binary version mismatch")
		}
	} else {
		id, e := a.container(ctx, j.Target)
		if e != nil {
			return e
		}
		raw, e := a.exec(ctx, "docker", "inspect", id)
		if e != nil {
			return e
		}
		var inspected []map[string]any
		if e = json.Unmarshal([]byte(raw), &inspected); e != nil || len(inspected) != 1 {
			return errors.New("invalid container inspection")
		}
		// Persist the complete configuration locally only; it may contain secrets.
		if e = atomicJSON(filepath.Join(a.taskDir(j), "container.json"), inspected[0]); e != nil {
			return e
		}
		j.OldContainer, _ = inspected[0]["Id"].(string)
		if j.Target.Component == "xboard" {
			var snapshot []struct {
				Mounts []struct {
					Destination string
					RW          bool
				}
			}
			if e = json.Unmarshal([]byte(raw), &snapshot); e != nil {
				return e
			}
			shared := false
			for _, mount := range snapshot[0].Mounts {
				if mount.Destination == "/www/.docker/.data" && mount.RW {
					shared = true
				}
			}
			if !shared {
				return errors.New("backend requires a writable persistent /www/.docker/.data mount")
			}
			if _, e = a.exec(ctx, "docker", "exec", id, "test", "-f", "/www/.docker/update-control.sh"); e != nil {
				return errors.New("install the update-control bootstrap release before enrolling this backend")
			}
		}
		if host, ok := inspected[0]["HostConfig"].(map[string]any); ok && host["AutoRemove"] == true {
			return errors.New("auto-remove containers must be recreated without --rm before enrolling")
		}
		if j.Target.Method == "docker" {
			var snapshot []struct {
				NetworkSettings struct {
					Networks map[string]struct{ IPAMConfig map[string]any }
				}
			}
			if e = json.Unmarshal([]byte(raw), &snapshot); e != nil {
				return e
			}
			for _, network := range snapshot[0].NetworkSettings.Networks {
				if len(network.IPAMConfig) != 0 {
					return errors.New("static-address containers require a Compose-managed target")
				}
			}
		}
		if _, e = a.exec(ctx, "docker", "pull", j.Task.Manifest.TargetImage()); e != nil {
			return e
		}
		if j.Target.Component == "xboard" {
			// Older manifests described an external executor without implementing
			// the maintenance-aware entrypoint. Inspect the target without running it.
			if output, e := a.exec(ctx, "docker", "run", "--rm", "--network", "none", "--read-only", "--entrypoint", "cat", j.Task.Manifest.TargetImage(), "/etc/xboard-update-protocol"); e != nil || output != "1" {
				return errors.New("target backend image does not support maintenance-controlled self-update")
			}
		}
		if j.Target.Component == "xboard-admin" {
			// The Admin release is a version unit: the target updater must be
			// present before the handoff can replace the Admin service. Its
			// version is verified by the target process' heartbeat before success.
			if strings.TrimSpace(j.Task.Manifest.Artifacts.UpdaterImage) == "" {
				return errors.New("Admin release has no trusted updater image")
			}
			if _, e = a.exec(ctx, "docker", "pull", j.Task.Manifest.Artifacts.UpdaterImage); e != nil {
				return e
			}
		}
	}
	return a.save(j)
}
func (a *Agent) perform(ctx context.Context, j *Journal) error {
	if err := a.save(j); err != nil {
		return err
	}
	if err := a.prepare(ctx, j); err != nil {
		return a.finish(ctx, j, "failed", "准备更新失败；原实例未替换", nil)
	}
	if j.Target.Component == "xboard-admin" {
		return a.performAdminHandoff(ctx, j)
	}
	if j.Target.Component == "xboard" {
		if err := a.event(ctx, j, "backing_up", "正在暂停写入并备份数据库", nil); err != nil {
			return err
		}
		j.Quiesced = true
		if err := a.save(j); err != nil {
			return err
		}
		if err := a.hook(ctx, j, j.Target.Quiesce); err != nil {
			return a.recover(ctx, j)
		}
		if err := a.hook(ctx, j, j.Target.Backup); err != nil {
			return a.recover(ctx, j)
		}
		j.BackedUp = true
		if err := a.save(j); err != nil {
			return err
		}
	}
	j.Mutating = true
	if err := a.save(j); err != nil {
		return err
	}
	if err := a.event(ctx, j, "installing", "正在替换指定安装实例", nil); err != nil {
		return err
	}
	if err := a.replace(ctx, j, false); err != nil {
		return a.recover(ctx, j)
	}
	if err := a.hook(ctx, j, j.Target.Migrate); err != nil {
		return a.recover(ctx, j)
	}
	if err := a.event(ctx, j, "verifying", "正在验证版本与健康", nil); err != nil {
		return err
	}
	if err := a.hook(ctx, j, j.Target.Verify); err != nil {
		return a.recover(ctx, j)
	}
	if j.Target.Component == "xboard" {
		// Once writes resume, restoring a database backup is no longer automatically safe.
		j.Resumed = true
		if err := a.save(j); err != nil {
			return err
		}
		if err := a.hook(ctx, j, j.Target.Resume); err != nil {
			return a.recover(ctx, j)
		}
	}
	if err := a.healthy(ctx, j.Target, j.Task.Version); err != nil {
		return a.recover(ctx, j)
	}
	return a.finish(ctx, j, "succeeded", "升级完成，版本与健康检查通过", map[string]any{"version": j.Task.Version})
}

// performAdminHandoff is deliberately split from the ordinary component
// replacement path. The running updater must first persist a handoff and
// switch the independent updater service; the target updater then resumes the
// same journal and is the only process allowed to replace Admin.
func (a *Agent) performAdminHandoff(ctx context.Context, j *Journal) error {
	if err := a.writePreparedHandoff(j); err != nil {
		return a.finish(ctx, j, "failed", "无法建立 Admin 更新交接；原实例未替换", nil)
	}
	if err := a.transitionHandoff(j, HandoffTargetBooting); err != nil {
		return a.recoverHandoff(ctx, j, "无法启动 Admin 更新交接")
	}
	targetUpdater := j.Task.Manifest.Artifacts.UpdaterImage
	if targetUpdater == "" {
		return a.recoverHandoff(ctx, j, "目标 Updater 版本未发布")
	}
	j.UpdaterSwitchAttempted = true
	if err := a.save(j); err != nil {
		return err
	}
	if err := a.switchUpdater(ctx, j, targetUpdater); err != nil {
		return a.recoverHandoff(ctx, j, "目标 Updater 未能启动")
	}
	j.UpdaterReplaced = true
	// The Compose operation above intentionally replaces this process. Keep a
	// durable handoff marker already written before the switch. Do not write
	// the in-memory journal after Compose starts the target: the target process
	// may be waiting on executor.lock and must own every subsequent journal
	// write. Returning nil lets Cycle/Run release the old lock immediately.
	j.HandoffDelegated = true
	return nil
}

func (a *Agent) rollbackFailedHandoff(ctx context.Context, j *Journal, handoff Handoff, reason string) error {
	if handoff.Phase != HandoffRollingBack {
		if err := a.handoffEvent(ctx, j, "rolling_back", HandoffRollingBack, "正在恢复 Admin 与 Updater", nil, reason); err != nil {
			return err
		}
		handoff, _ = LoadHandoff(a.Config.HandoffFile())
	}
	result := map[string]any{"version": j.Previous, "updater_version": handoff.FromUpdaterVersion}
	if err := a.handoffEvent(ctx, j, "rollback_failed", HandoffRollbackFailed, "共同恢复失败，需要人工恢复", result, reason); err != nil {
		return err
	}
	j.Done = true
	return a.save(j)
}

// recoverHandoff is conservative: once either side of the Admin release may
// have changed, it restores both sides or reports rollback_failed. It never
// reports rolled_back merely because an image tag was written to the
// Compose override; the old Admin must be healthy and the old updater service
// must have been started successfully first.
func (a *Agent) recoverHandoff(ctx context.Context, j *Journal, reason string) error {
	handoff, err := LoadHandoff(a.Config.HandoffFile())
	if err != nil {
		return err
	}
	if handoffTerminal(handoff.Phase) {
		j.Done = true
		return a.save(j)
	}
	if handoff.Phase != HandoffRollingBack {
		if err = a.handoffEvent(ctx, j, "rolling_back", HandoffRollingBack, "正在恢复 Admin 与 Updater", nil, reason); err != nil {
			return err
		}
		handoff, err = LoadHandoff(a.Config.HandoffFile())
		if err != nil {
			return err
		}
	}

	if !j.AdminRestored {
		if err = a.replace(ctx, j, true); err != nil {
			return a.rollbackFailedHandoff(ctx, j, handoff, "恢复 Admin 容器失败")
		}
		if err = a.healthy(ctx, j.Target, j.Previous); err != nil {
			return a.rollbackFailedHandoff(ctx, j, handoff, "恢复后的 Admin 健康检查失败")
		}
		j.AdminRestored = true
		if err = a.save(j); err != nil {
			return err
		}
	}

	// If this process is already the old updater, the Compose service switch
	// has completed and only the durable terminal event remains. Otherwise the
	// target process must start the old updater before it can report success.
	if a.currentUpdaterVersion(j) != handoff.FromUpdaterVersion {
		if !j.UpdaterSwitchAttempted {
			j.UpdaterSwitchAttempted = true
		}
		// Persist all rollback intent before starting the old service. The
		// target process may be stopped by Compose as soon as this call returns.
		j.UpdaterReplaced = false
		if err = a.save(j); err != nil {
			return err
		}
		if err = a.switchUpdater(ctx, j, rollbackUpdaterImage(handoff)); err != nil {
			return a.rollbackFailedHandoff(ctx, j, handoff, "恢复旧 Updater 失败")
		}
	} else if err = a.setComposeServiceImage(j.Target, a.updaterService(), rollbackUpdaterImage(handoff)); err != nil {
		// Already on the from version: keep the Compose override consistent so
		// a later `compose up` cannot silently resurrect the target image.
		return a.rollbackFailedHandoff(ctx, j, handoff, "无法固定回退后的 Updater 镜像")
	}
	result := map[string]any{"version": j.Previous, "updater_version": handoff.FromUpdaterVersion}
	if err = a.handoffEvent(ctx, j, "rolled_back", HandoffRolledBack, "更新未完成，Admin 与 Updater 已恢复并验证", result, ""); err != nil {
		return err
	}
	j.Done = true
	return a.save(j)
}

func (a *Agent) continueHandoffRollback(ctx context.Context, j *Journal, handoff Handoff) error {
	if a.currentUpdaterVersion(j) != handoff.FromUpdaterVersion {
		return errors.New("rollback handoff is running on the wrong updater version")
	}
	if !j.AdminRestored {
		if err := a.replace(ctx, j, true); err != nil {
			return a.rollbackFailedHandoff(ctx, j, handoff, "恢复 Admin 容器失败")
		}
		if err := a.healthy(ctx, j.Target, j.Previous); err != nil {
			return a.rollbackFailedHandoff(ctx, j, handoff, "恢复后的 Admin 健康检查失败")
		}
		j.AdminRestored = true
		if err := a.save(j); err != nil {
			return err
		}
	}
	result := map[string]any{"version": j.Previous, "updater_version": handoff.FromUpdaterVersion}
	if err := a.cleanupPreviousUpdater(ctx, j.Target, handoff); err != nil {
		return a.rollbackFailedHandoff(ctx, j, handoff, "恢复 Updater 服务失败")
	}
	if j.Task.Status != "rolled_back" {
		if err := a.handoffEvent(ctx, j, "rolled_back", HandoffRolledBack, "更新未完成，Admin 与 Updater 已恢复并验证", result, ""); err != nil {
			return err
		}
	}
	j.Done = true
	return a.save(j)
}

func (a *Agent) continueAdminHandoff(ctx context.Context, j *Journal, handoff Handoff) error {
	if a.currentUpdaterVersion(j) != handoff.ToUpdaterVersion {
		return errors.New("Admin handoff is running on the wrong updater version")
	}
	if handoff.Phase == HandoffTargetBooting {
		// Run already holds executor.lock; adopting through the locking helper
		// from the same process would always fail on the held flock.
		adopted, err := adoptHandoffFileLocked(a.Config.HandoffFile(), a.Config.StateDir, a.handoffOwner(), handoff.TaskID, handoff.InstanceID)
		if err != nil {
			return err
		}
		handoff = adopted
	}
	if handoff.Phase == HandoffTargetAdopted {
		// The handoff phase is the durable source of truth at this point. The
		// local task status may still be empty or may reflect the last report
		// flushed before the target updater adopted the lease, so do not require
		// it to be exactly "preparing" before advancing the handoff.
		if err := a.handoffEvent(ctx, j, "installing", HandoffAdminInstalling, "正在由目标 Updater 替换 Admin", nil, ""); err != nil {
			return err
		}
		handoff, _ = LoadHandoff(a.Config.HandoffFile())
	}
	if handoff.Phase != HandoffAdminInstalling && handoff.Phase != HandoffVerifying {
		return fmt.Errorf("unexpected Admin handoff phase: %s", handoff.Phase)
	}
	if !j.AdminReplaced {
		j.Mutating = true
		if err := a.save(j); err != nil {
			return err
		}
		if err := a.replace(ctx, j, false); err != nil {
			return a.recoverHandoff(ctx, j, "目标 Admin 容器启动失败")
		}
		j.AdminReplaced = true
		if err := a.save(j); err != nil {
			return err
		}
	}
	if handoff.Phase == HandoffAdminInstalling {
		if err := a.handoffEvent(ctx, j, "verifying", HandoffVerifying, "正在验证目标 Admin 与 Updater", nil, ""); err != nil {
			return err
		}
		handoff, _ = LoadHandoff(a.Config.HandoffFile())
	}
	if err := a.healthy(ctx, j.Target, j.Task.Version); err != nil {
		return a.recoverHandoff(ctx, j, "目标 Admin 健康检查或版本校验失败")
	}
	// Heartbeat is an independent success gate. A temporary panel outage is
	// retried from the verifying journal rather than being reported as success.
	if err := a.heartbeat(ctx); err != nil {
		return err
	}
	completed, loadErr := LoadHandoff(a.Config.HandoffFile())
	if loadErr != nil {
		return loadErr
	}
	if err := a.cleanupPreviousUpdater(ctx, j.Target, completed); err != nil {
		fmt.Fprintf(os.Stderr, "xboard-updater: pin updater service failed: %v\n", err)
		return a.recoverHandoff(ctx, j, fmt.Sprintf("无法固定目标 Updater 服务：%v", err))
	}
	result := map[string]any{"version": j.Task.Version, "updater_version": handoff.ToUpdaterVersion}
	if err := a.handoffEvent(ctx, j, "succeeded", HandoffSucceeded, "升级完成，Admin 与 Updater 版本及健康检查通过", result, ""); err != nil {
		return err
	}
	j.Done = true
	return a.save(j)
}
func (a *Agent) finish(ctx context.Context, j *Journal, status, message string, result map[string]any) error {
	if err := a.event(ctx, j, status, message, result); err != nil {
		return err
	}
	j.Done = true
	return a.save(j)
}
func (a *Agent) recover(ctx context.Context, j *Journal) error {
	if j.Target.Component == "xboard" && j.Resumed {
		return a.finish(ctx, j, "rollback_failed", "后端已恢复写入，禁止自动恢复旧数据库；请使用保留的备份人工恢复", nil)
	}
	if !j.Mutating {
		if j.Quiesced {
			if err := a.hook(ctx, j, j.Target.Resume); err != nil {
				return a.finish(ctx, j, "rollback_failed", "无法退出维护状态，需要人工恢复", nil)
			}
		}
		return a.finish(ctx, j, "failed", "更新在替换前中止，原实例保留", nil)
	}
	if j.Task.Status != "rolling_back" {
		if err := a.event(ctx, j, "rolling_back", "正在恢复原安装实例", nil); err != nil {
			return err
		}
	}
	if err := a.replace(ctx, j, true); err != nil {
		return a.finish(ctx, j, "rollback_failed", "恢复原实例失败；备份保留，需要人工恢复", nil)
	}
	if j.BackedUp {
		if err := a.hook(ctx, j, j.Target.Restore); err != nil {
			return a.finish(ctx, j, "rollback_failed", "数据库恢复失败；备份保留，需要人工恢复", nil)
		}
	}
	if j.Quiesced {
		if err := a.hook(ctx, j, j.Target.Resume); err != nil {
			return a.finish(ctx, j, "rollback_failed", "退出维护状态失败，需要人工恢复", nil)
		}
	}
	if err := a.healthy(ctx, j.Target, j.Previous); err != nil {
		return a.finish(ctx, j, "rollback_failed", "原版本健康检查失败，需要人工恢复", nil)
	}
	return a.finish(ctx, j, "rolled_back", "更新未完成，已恢复并验证原版本", map[string]any{"version": j.Previous})
}
func (a *Agent) replace(ctx context.Context, j *Journal, rollback bool) error {
	t := j.Target
	if t.Method == "systemd" {
		if _, err := a.exec(ctx, "systemctl", "stop", t.Service); err != nil {
			return err
		}
		source := "next-binary"
		if rollback {
			source = "previous-binary"
		}
		if err := copyFile(filepath.Join(a.taskDir(j), source), t.Binary, 0755); err != nil {
			return err
		}
		_, err := a.exec(ctx, "systemctl", "start", t.Service)
		return err
	}
	if t.Method == "docker" {
		return a.replaceDocker(ctx, j, rollback)
	}
	image := j.Task.Manifest.TargetImage()
	if rollback {
		raw, err := os.ReadFile(filepath.Join(a.taskDir(j), "container.json"))
		if err != nil {
			return err
		}
		var old struct{ Config struct{ Image string } }
		if err = json.Unmarshal(raw, &old); err != nil {
			return err
		}
		image = old.Config.Image
	}
	if err := a.setComposeServiceImage(t, t.ComposeService, image); err != nil {
		return err
	}
	_, err := a.compose(ctx, t, nil, "up", "--detach", "--no-deps", "--no-build", "--pull", "never", t.ComposeService)
	return err
}
