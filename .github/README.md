# Versioned releases

This repository publishes xboard-admin from its own source. Release configuration is in
release-config.json; next_version is currently 0.2.0 and must be advanced for
the next development cycle after a formal release.

## Publish

- A dev push publishes the final commit as vNEXT-dev.RUN_ID.RUN_ATTEMPT.
  A push containing multiple commits produces one version from that event's tip,
  not one version per commit. Later branch changes do not change its source.
- Run the existing workflow on main with release_version=v0.2.0 to publish a formal
  version. The input must match next_version. No merge or deployment is performed
  by this formal publishing operation.
- A tag alone does not trigger publishing. The workflow prepares the tag and draft,
  builds from that exact tag, then publishes only after all required artifacts pass.
- A public version cannot be overwritten. Failed-job reruns reuse their prepared
  plan; a new development run attempt creates a new development version.

## Transitional deployment behavior

Remote deployment jobs are paused with an unconditional false guard. Tests,
image builds and versioned publishing remain enabled. Updating a server requires
an explicit updater operation; publishing a release does not install it.
The legacy deployment implementation is retained for recovery reference only.
Non-dev builds keep run-specific build tags and do not become installable Releases.
No floating branch/latest image tags are published.

## Artifact contract (schema version 2)

Every public release contains release-manifest.json:

- component, repository, version, channel (stable/dev), source_commit;
- artifacts.admin_image: ghcr.io/voidintheshell/xboard-admin:VERSION;
- artifacts.updater_image: ghcr.io/voidintheshell/xboard-admin-updater:VERSION;
- artifacts.updater_binaries for linux/amd64 and linux/arm64, pointing to the
  matching xboard-updater assets in this same Release;
- platforms: linux/amd64 and linux/arm64;
- compatibility.panel_contract=1, compatibility.update_protocol=2 and
  compatibility.updater_state_schema=1.

The updater must reject drafts, missing/incompatible manifests, wrong repository
namespaces and incomplete platforms. The Git tag, both image tags, updater binary
URLs and runtime versions must agree. Releases are visible only after both image
publications, updater binary checks and runtime checks on both architectures. No
artifact hash comparison is required.

Published image versions and updater artifacts are never overwritten on retries. Authentication or
registry failures stop publication instead of assuming a version does not exist.
A failed release stays draft and must not be listed as an available update.

## Discover a new development version

Wait for the workflow to publish a non-draft Pre-release with its complete
release-manifest.json and matching updater artifacts. In Admin, select the
component's Dev channel and refresh the version list. A newly pushed commit or a
draft tag is not installable.
The selected full version remains fixed when the update task is created.
