# Xboard Admin Updater

The updater is released as part of the Xboard-Admin version unit. A single
Admin release produces the following artifacts from one source commit:

- ghcr.io/voidintheshell/xboard-admin:VERSION
- ghcr.io/voidintheshell/xboard-admin-updater:VERSION
- xboard-updater-linux-amd64
- xboard-updater-linux-arm64
- release-manifest.json with schema version 2

The Admin image and updater image use the same VERSION. The release manifest
also records the source commit, update protocol, updater state schema, and
both image platforms. A release is not installable until the image and binary
contract has been verified.

## Container runtime

The updater image is deliberately a small Docker CLI image. It does not
publish a port. A host installation supplies:

- a private token file with mode 0600;
- a private state directory containing the journal and handoff record;
- a dedicated configuration file with absolute target paths;
- the Docker socket for Docker/Compose replacement;
- the exact deployment directory used by the host Compose file.

The Docker socket grants host-level container control. The updater therefore
runs read-only, with a tmpfs /tmp, no-new-privileges, and all capabilities
dropped in the default Compose template. The socket and updater volumes must
not be exposed to untrusted users or workloads.

For a Compose target, configuration must use an absolute Compose file, an
optional absolute env file, a fixed project name, a fixed service name, and
an administrator-owned health URL. If the updater service is supplied by a
local Compose overlay, bootstrap records its absolute path in
`compose_extra_files`; every updater Compose operation loads those files before
the persistent image-selection override. The overlay path must be readable
from the updater container, while environment and secret files remain private.
Hooks are local argv arrays installed by the administrator; the panel cannot
provide shell commands or arbitrary host paths.

Admin self-update uses a two-phase Compose handoff. The current updater starts
the target with `docker compose run --detach --rm --name …`, so a fixed
`container_name` on the declared service cannot make Compose remove the old
executor before the target is ready. After the old service exits, the target
creates and starts the declared Compose service, records that stable name in the
handoff journal, and exits after the terminal handoff state is durable; the
temporary one-off container removes itself.
This preserves restart policy and keeps later `compose up` operations free of
one-off-name conflicts.

## Architecture policy

GitHub Actions builds and verifies linux/amd64 and linux/arm64 images and
binaries. Local Windows acceptance for this workspace is intentionally
linux/amd64 only. Do not locally build or run an ARM64 image; the ARM64
contract is verified by the GitHub workflow.

The updater source is shared with the native Node updater through the release
artifacts. Xboard-Node's compatibility command is only a shim and does not
maintain a second active updater implementation.

## Panel entry and panel certificates

When the deployment uses the Caddy HTTPS entry (`compose.entry.sample.yaml`
from the Xboard repository), the bootstrap records a `panel_entry` object in
the updater configuration:

```json
"panel_entry": {
  "enabled": true,
  "caddy_container": "xboard-entry",
  "caddyfile_path": "/deploy/entry/Caddyfile",
  "caddy_config_path": "/etc/caddy/Caddyfile",
  "caddy_data_path": "/entry-caddy-data",
  "caddy_internal_data_path": "/data",
  "cert_material_dir": "/entry-certs",
  "seed_domains": ["panel.example.com"],
  "theme_upstream": "http://xboard-theme:80"
}
```

While enabled, the updater reconciles panel-scope certificate resources every
minute: it renders the entry Caddyfile from the desired certificate list,
materializes `content` sources into the shared `entry-certs` volume, reloads
Caddy via `docker exec`, clears cached ACME certificates when a resource
revision increases (domain change / manual re-issue), verifies the resulting
certificates and reports status through the executor API. Seed domains keep
the panel reachable while no certificate resource covers them. All fields
are container-visible paths of the updater; unknown fields stay tolerated for
rollback compatibility.
