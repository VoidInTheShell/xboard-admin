# Xboard Admin staging image

This repository builds the administrator frontend as an independent nginx image: `ghcr.io/voidintheshell/xboard-admin`. It is not copied into the Xboard PHP image and it does not contain DK Theme.

The runtime contract is:

- Xboard Admin serves any validated administrator path as a relative-asset SPA; it never owns the public route selection itself.
- DK Theme is the public gateway. It reads the current secure path from Xboard through a Docker-only secret, proxies that path to `xboard-admin:80`, and exposes the built-in Xboard panel only at `/<current-path>/original`.
- API requests remain same-origin in the browser and are routed by DK Theme to `xboard-app:7001`.
- The image exposes `/healthz` for container health checks.

Every push and pull request runs npm install, lint, TypeScript checks, a production build, and an nginx image smoke test. The smoke test validates both the normal and a second arbitrary administrator-path HTML marker plus referenced JavaScript and stylesheet MIME types, rather than treating an HTTP 200 fallback as a successful admin page. Non-PR pushes publish a `build-<run_id>-<run_attempt>` version tag alongside existing `sha-*` and branch tags. Staging deploys the build version tag directly. `dev` pushes deploy to GJHK automatically; other branches require `workflow_dispatch`.

The staging deploy job uses the shared `/home/beihai/docker/xboard/.deploy.lock` and updates only the `admin` Compose service. If the backend stack has not been installed, it only caches the exact image; the next Xboard deployment creates the full three-container stack. JPGREEN production is deliberately promoted through an explicit Xboard `master` workflow dispatch with this image's version tag, so the Xboard, Theme, and Admin compatibility gate runs together before the standalone Admin becomes live.

Required `staging` Environment values:

- Variables: `STAGING_SSH_HOST`, `STAGING_SSH_PORT`, `STAGING_SSH_USER`, `STAGING_PANEL_URL`
- Secrets: `STAGING_SSH_PRIVATE_KEY`, `STAGING_SSH_KNOWN_HOSTS`

The first three-container GJHK bootstrap also requires the Xboard repository's `staging` Environment Variable `STAGING_XBOARD_ADMIN_IMAGE` to be set to this workflow's published version-tagged image reference, for example `ghcr.io/voidintheshell/xboard-admin:build-123456789-1`. Find it in the successful run's `Report staging image tag` step or job summary. After the stack exists, this workflow updates only the `admin` service with its own build version tag. Deployment does not resolve or compare image SHA256 values.
