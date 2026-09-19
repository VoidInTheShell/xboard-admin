package updater

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func architecture() string { return runtime.GOARCH }
func dockerRequest(ctx context.Context, method, path string, body any) ([]byte, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", "/var/run/docker.sock")
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 2 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, method, "http://docker"+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if response.StatusCode >= 300 {
		return nil, fmt.Errorf("Docker operation returned HTTP %d", response.StatusCode)
	}
	return raw, nil
}
func (a *Agent) replaceDocker(ctx context.Context, j *Journal, rollback bool) error {
	name := j.Target.Container
	if rollback {
		// Identify the original by its immutable local container ID, never by a guessed name.
		output, err := a.exec(ctx, "docker", "inspect", "--format", "{{.Id}}", name)
		if err == nil && output != j.OldContainer {
			if _, err = a.exec(ctx, "docker", "stop", name); err != nil {
				return err
			}
			if _, err = a.exec(ctx, "docker", "rm", name); err != nil {
				return err
			}
		}
		// Starting an originally auto-published container allocates fresh ports.
		// Restore its saved image/configuration with the frozen bindings instead.
		raw, readErr := os.ReadFile(filepath.Join(a.taskDir(j), "container.json"))
		if readErr != nil {
			return readErr
		}
		var original struct {
			Config     struct{ Image string }
			HostConfig struct {
				PublishAllPorts bool
				PortBindings    map[string][]struct{ HostPort string }
			}
		}
		if err = json.Unmarshal(raw, &original); err != nil {
			return err
		}
		dynamic := original.HostConfig.PublishAllPorts
		for _, bindings := range original.HostConfig.PortBindings {
			for _, binding := range bindings {
				if binding.HostPort == "" || binding.HostPort == "0" {
					dynamic = true
				}
			}
		}
		if dynamic {
			return a.createDocker(ctx, j, original.Config.Image, output == j.OldContainer)
		}
		if output != j.OldContainer {
			if _, err = a.exec(ctx, "docker", "rename", j.OldContainer, name); err != nil {
				return err
			}
		}
		_, err = a.exec(ctx, "docker", "start", j.OldContainer)
		return err
	}
	return a.createDocker(ctx, j, j.Task.Manifest.TargetImage(), true)
}
func (a *Agent) createDocker(ctx context.Context, j *Journal, image string, retire bool) error {
	name := j.Target.Container
	raw, err := os.ReadFile(filepath.Join(a.taskDir(j), "container.json"))
	if err != nil {
		return err
	}
	var snapshot struct {
		Config     map[string]any
		HostConfig map[string]any
		Mounts     []struct {
			Type, Name, Source, Destination string
			RW                              bool
		}
		NetworkSettings struct {
			Networks map[string]map[string]any
			Ports    map[string]any
		}
	}
	if err = json.Unmarshal(raw, &snapshot); err != nil {
		return err
	}
	if snapshot.Config == nil || snapshot.HostConfig == nil {
		return errors.New("container backup is incomplete")
	}
	body := snapshot.Config
	body["Image"] = image
	// Preserve the allocated host ports, including ports originally requested as random.
	if len(snapshot.NetworkSettings.Ports) != 0 {
		bindings := map[string]any{}
		for port, value := range snapshot.NetworkSettings.Ports {
			if value != nil {
				bindings[port] = value
			}
		}
		snapshot.HostConfig["PortBindings"] = bindings
	}
	// Explicitly retain anonymous volumes as well as named volumes.
	binds, _ := snapshot.HostConfig["Binds"].([]any)
	for _, mount := range snapshot.Mounts {
		if mount.Type != "volume" {
			continue
		}
		found := false
		if mounts, ok := snapshot.HostConfig["Mounts"].([]any); ok {
			for _, entry := range mounts {
				if mountConfig, ok := entry.(map[string]any); ok && mountConfig["Target"] == mount.Destination {
					found = true
				}
			}
		}
		for _, bind := range binds {
			if strings.Contains(fmt.Sprint(bind), ":"+mount.Destination+":") || strings.HasSuffix(fmt.Sprint(bind), ":"+mount.Destination) {
				found = true
			}
		}
		if !found {
			mode := "rw"
			if !mount.RW {
				mode = "ro"
			}
			binds = append(binds, mount.Name+":"+mount.Destination+":"+mode)
		}
	}
	snapshot.HostConfig["Binds"] = binds
	body["HostConfig"] = snapshot.HostConfig
	endpoints := map[string]any{}
	for network, endpoint := range snapshot.NetworkSettings.Networks {
		clean := map[string]any{}
		for _, key := range []string{"IPAMConfig", "Aliases", "Links", "DriverOpts"} {
			if endpoint[key] != nil {
				clean[key] = endpoint[key]
			}
		}
		endpoints[network] = clean
	}
	body["NetworkingConfig"] = map[string]any{"EndpointsConfig": endpoints}
	if retire {
		if _, err = a.exec(ctx, "docker", "stop", j.OldContainer); err != nil {
			return err
		}
		if _, err = a.exec(ctx, "docker", "rename", j.OldContainer, name+"-before-"+j.Task.ID); err != nil {
			return err
		}
	}
	created, err := dockerRequest(ctx, "POST", "/containers/create?name="+url.QueryEscape(name), body)
	if err != nil {
		return err
	}
	var result struct {
		ID string `json:"Id"`
	}
	if err = json.Unmarshal(created, &result); err != nil || result.ID == "" {
		return errors.New("Docker did not return a new container ID")
	}
	_, err = a.exec(ctx, "docker", "start", result.ID)
	return err
}
