# Xboard Admin staging image

This repository builds the administrator frontend as an independent nginx image: `ghcr.io/voidintheshell/xboard-admin`. It is not copied into the Xboard PHP image and it does not contain DK Theme.

The runtime contract is:

- Xboard Admin serves any validated administrator path as a relative-asset SPA; it never owns the public route selection itself.
- DK Theme is the public gateway. It reads the current secure path from Xboard through a Docker-only secret, proxies that path to `xboard-admin:80`, and exposes the built-in Xboard panel only at `/<current-path>/original`.
- API requests remain same-origin in the browser and are routed by DK Theme to `xboard-app:7001`.
- The image exposes `/healthz` for container health checks.

Every push and pull request runs npm install, lint, TypeScript checks, a production build, and an nginx image smoke test. The smoke test validates both the normal and a second arbitrary administrator-path HTML marker plus referenced JavaScript and stylesheet MIME types, rather than treating an HTTP 200 fallback as a successful admin page. Non-PR pushes publish a `build-<run_id>-<run_attempt>` version tag alongside branch tags. **CI deployment is suspended (since 2026-09-15):** the staging and production deploy jobs are hard-disabled with `false &&` guards, so pushes and dispatches only build, test, and publish releases; GJHK/JPGREEN update their Admin component through the panel's Admin version-update UI (or MCP update tasks). The deploy assets in this directory are retained as the documented manual emergency/recovery path.

The suspended staging deploy job used the shared `/home/beihai/docker/xboard/.deploy.lock` and updated only the `admin` Compose service; if the backend stack was not installed, it only cached the exact image and the next Xboard deployment created the full three-container stack. `dev` dispatches targeted staging, and `main` pushes or dispatches targeted JPGREEN production through the restricted `deploy-admin` host command, followed by the complete production entrypoint verifier.

Production requires a GitHub `production` Environment with `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_PORT`, `PRODUCTION_SSH_USER=xboard-ci`, `PRODUCTION_PANEL_URL`, `PRODUCTION_ADMIN_PATH`, and secrets `PRODUCTION_DEPLOY_SSH_KEY` / `PRODUCTION_SSH_KNOWN_HOSTS`. Provision it before the first mainline deployment; staging credentials must not be reused as a general-purpose production SSH account.

Required `staging` Environment values:

- Variables: `STAGING_SSH_HOST`, `STAGING_SSH_PORT`, `STAGING_SSH_USER`, `STAGING_PANEL_URL`
- Secrets: `STAGING_SSH_PRIVATE_KEY`, `STAGING_SSH_KNOWN_HOSTS`

The suspended full-stack bootstrap path required the Xboard repository's `staging` Environment Variable `STAGING_XBOARD_ADMIN_IMAGE` to be set to this workflow's published version-tagged image reference, for example `ghcr.io/voidintheshell/xboard-admin:build-123456789-1` (found in the successful run's `Report staging image tag` step or job summary). After the stack existed, this workflow's deploy job updated only the `admin` service with its own build version tag. Deployment did not resolve or compare image SHA256 values.
