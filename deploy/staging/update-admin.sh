#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_DIR="/home/beihai/docker/xboard"
EXPECTED_TARGET="/home/beihai/docker/xboard"
ADMIN_IMAGE="${1:-}"
REGISTRY_USER="${2:-}"

log() {
    printf '[admin-deploy] %s\n' "$*"
}

fail() {
    printf '[admin-deploy] ERROR: %s\n' "$*" >&2
    exit 1
}

set_env_value() {
    local file="$1"
    local key="$2"
    local value="$3"
    local temp_file
    temp_file=$(mktemp "${file}.XXXXXX")
    awk -v key="$key" -v value="$value" '
        BEGIN { found = 0 }
        index($0, key "=") == 1 { print key "=" value; found = 1; next }
        { print }
        END { if (!found) print key "=" value }
    ' "$file" > "$temp_file"
    install -m 600 "$temp_file" "$file"
    rm -f "$temp_file"
}

[ -n "$ADMIN_IMAGE" ] || fail "admin image argument is required"
[ -n "$REGISTRY_USER" ] || fail "registry user argument is required"
[ "$(realpath -m "$TARGET_DIR")" = "$EXPECTED_TARGET" ] || fail "unexpected target directory"
[[ "$ADMIN_IMAGE" =~ ^ghcr\.io/voidintheshell/xboard-admin:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fail "admin image must be an xboard-admin GHCR image with a version tag"

IFS= read -r REGISTRY_TOKEN || true
[ -n "${REGISTRY_TOKEN:-}" ] || fail "registry token was not provided on stdin"

install -d -m 750 "$TARGET_DIR"
exec 9>"$TARGET_DIR/.deploy.lock"
flock -x 9
log "acquired deployment lock"

AUTH_DIR=$(mktemp -d "/tmp/xboard-admin-docker-auth.XXXXXX")
deployment_complete=0
rollback_ready=0
cleanup() {
    local rc=$?
    trap - EXIT
    if [ "$rc" -ne 0 ] && [ "$rollback_ready" = 1 ] && [ "$deployment_complete" = 0 ]; then
        sudo -n cp -a "$AUTH_DIR/previous.env" "$TARGET_DIR/.deploy.env"
        sudo -n docker compose --env-file "$TARGET_DIR/.deploy.env" -f "$TARGET_DIR/compose.yaml" up -d --no-deps admin || true
        sudo -n docker exec xboard-theme nginx -s reload >/dev/null 2>&1 || true
    fi
    sudo -n rm -rf -- "$AUTH_DIR"
    unset REGISTRY_TOKEN
    exit "$rc"
}
trap cleanup EXIT

printf '%s\n' "$REGISTRY_TOKEN" | sudo -n docker --config "$AUTH_DIR" login ghcr.io --username "$REGISTRY_USER" --password-stdin >/dev/null
unset REGISTRY_TOKEN
sudo -n docker --config "$AUTH_DIR" pull "$ADMIN_IMAGE"

if [ ! -f "$TARGET_DIR/compose.yaml" ] || [ ! -f "$TARGET_DIR/.deploy.env" ]; then
    log "panel Compose is not installed yet; exact admin image is cached for the first backend deployment"
    exit 0
fi

sudo -n cp -a "$TARGET_DIR/.deploy.env" "$AUTH_DIR/previous.env"
rollback_ready=1
set_env_value "$TARGET_DIR/.deploy.env" "XBOARD_ADMIN_IMAGE" "$ADMIN_IMAGE"

compose() {
    sudo -n docker compose --env-file "$TARGET_DIR/.deploy.env" -f "$TARGET_DIR/compose.yaml" "$@"
}

compose up -d --no-deps admin

for _ in $(seq 1 45); do
    status=$(sudo -n docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' xboard-admin 2>/dev/null || true)
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
        sudo -n docker exec xboard-admin wget -q -O /dev/null http://127.0.0.1/healthz
        admin_page=$(sudo -n docker exec xboard-admin wget -q -O - http://127.0.0.1/standalone-admin-smoke/)
        printf '%s' "$admin_page" | grep -F '<title>XBoard Admin</title>' >/dev/null
        printf '%s' "$admin_page" | grep -F 'data-xboard-admin-shell="standalone"' >/dev/null
        deployment_complete=1
        if [ -f "$TARGET_DIR/release-maintenance.py" ]; then
            sudo -n python3 "$TARGET_DIR/release-maintenance.py" "$TARGET_DIR"
        fi
        log "admin deployment complete: $ADMIN_IMAGE"
        compose ps admin
        exit 0
    fi
    if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
        break
    fi
    sleep 2
done

compose ps admin || true
compose logs --tail 120 admin || true
fail "admin container did not become healthy"
