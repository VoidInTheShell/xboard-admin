package updater

import "testing"

func validAdminTask() (Task, Target) {
	target := Target{
		ID:        "panel-admin",
		Name:      "Admin",
		Component: "xboard-admin",
		Method:    "docker",
		Container: "xboard-admin",
		HealthURL: "http://127.0.0.1:8080/healthz",
	}
	version := "v0.3.0-dev.123.1"
	return Task{
		ID:         "12345678-1234-1234-1234-123456789abc",
		InstanceID: target.ID,
		Component:  target.Component,
		Version:    version,
		Token:      "123456789012345678901234567890123456789012345678",
		Manifest: Manifest{
			Schema:       2,
			Component:    target.Component,
			Repository:   repositories[target.Component],
			Version:      version,
			Channel:      "dev",
			SourceCommit: "0123456789abcdef0123456789abcdef01234567",
			Platforms:    []string{"linux/amd64", "linux/arm64"},
			Artifacts: Artifacts{
				AdminImage:   "ghcr.io/voidintheshell/xboard-admin:" + version,
				UpdaterImage: "ghcr.io/voidintheshell/xboard-admin-updater:" + version,
				UpdaterBinaries: map[string]string{
					"linux/amd64": "https://github.com/VoidInTheShell/xboard-admin/releases/download/" + version + "/xboard-updater-linux-amd64",
					"linux/arm64": "https://github.com/VoidInTheShell/xboard-admin/releases/download/" + version + "/xboard-updater-linux-arm64",
				},
			},
		},
	}, target
}

func TestAdminTaskAcceptsSchema2Artifacts(t *testing.T) {
	task, target := validAdminTask()
	task.Manifest.Compatibility.Panel = 1
	task.Manifest.Compatibility.Update = UpdateProtocol
	task.Manifest.Compatibility.State = UpdaterStateSchema
	if err := task.Validate(target); err != nil {
		t.Fatal(err)
	}
	if task.Manifest.TargetImage() != task.Manifest.Artifacts.AdminImage {
		t.Fatal("Admin task did not select artifacts.admin_image")
	}
}

func TestAdminTaskRejectsProtocolDowngrade(t *testing.T) {
	task, target := validAdminTask()
	task.Manifest.Compatibility.Panel = 1
	task.Manifest.Compatibility.Update = 1
	task.Manifest.Compatibility.State = UpdaterStateSchema
	if err := task.Validate(target); err == nil {
		t.Fatal("expected schema 1 update protocol to be rejected")
	}
}
