# Xboard Admin staging image

This repository builds the administrator frontend as an independent nginx image: `ghcr.io/voidintheshell/xboard-admin`. It is not copied into the Xboard PHP image and it does not contain DK Theme.

The runtime contract is:

- Xboard Admin serves only `/unitedearthgov` and `/unitedearthgov/**`.
- DK Theme is the public gateway and proxies that path to `xboard-admin:80`.
- API requests remain same-origin in the browser and are routed by DK Theme to `xboard-app:7001`.
- The image exposes `/healthz` for container health checks.

Every push and pull request runs npm install, lint, TypeScript checks, a production build, and an nginx image smoke test. Non-PR pushes publish immutable `sha-*` and branch tags. Pushes to integration branches and `staging/**` deploy automatically; other branches require `workflow_dispatch`.

The deploy job uses the shared `/home/beihai/docker/xboard/.deploy.lock` and updates only the `admin` Compose service. If the backend stack has not been installed, it only caches the exact image; the next Xboard `master` deployment creates the full three-container stack.

Required `staging` Environment values:

- Variables: `STAGING_SSH_HOST`, `STAGING_SSH_PORT`, `STAGING_SSH_USER`, `STAGING_PANEL_URL`, `STAGING_ADMIN_PATH`
- Secrets: `STAGING_SSH_PRIVATE_KEY`, `STAGING_SSH_KNOWN_HOSTS`

`STAGING_ADMIN_PATH` must remain `unitedearthgov`.
