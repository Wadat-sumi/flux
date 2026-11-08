#!/usr/bin/env bash
set -euo pipefail

# Run only on the manually dispatched Linux Actions runner. No Azure commands.
[[ "$(uname -s)" == "Linux" ]] || { echo 'Run the GHCR workflow on Linux; no local container tool is needed on macOS.' >&2; exit 1; }
[[ "${GITHUB_REPOSITORY:-}" == 'Wadat-sumi/flux' && "${GITHUB_REF:-}" == 'refs/heads/main' ]] || { echo 'Only the authorized main branch can publish this package.' >&2; exit 1; }
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'A full Git commit SHA is required.' >&2; exit 1; }
[[ "${FLUX_IMAGE_NAME:-}" == 'ghcr.io/wadat-sumi/flux' ]] || { echo 'Unexpected image destination.' >&2; exit 1; }
flux_image_ref="${FLUX_IMAGE_NAME}:sha-${GITHUB_SHA}"

case "${1:-}" in
  build)
    sudo buildah --storage-driver=vfs bud --isolation=chroot --format=oci \
      --arch=amd64 --os=linux --file=Containerfile --tag="$flux_image_ref" \
      --label="org.opencontainers.image.source=https://github.com/Wadat-sumi/flux" \
      --label="org.opencontainers.image.revision=${GITHUB_SHA}" .
    flux_container_name="flux-smoke-${GITHUB_RUN_ID}"
    trap 'sudo podman --storage-driver=vfs rm --force "$flux_container_name" >/dev/null 2>&1 || true' EXIT
    sudo podman --storage-driver=vfs run --detach --name="$flux_container_name" \
      --pull=never --read-only --cap-drop=all --security-opt=no-new-privileges \
      --memory=2g --pids-limit=256 --tmpfs=/tmp:rw,nosuid,nodev,size=512m \
      --publish=127.0.0.1:4181:3001 --env=NODE_ENV=development \
      --env=FLUX_DB_DIR=/tmp/flux-smoke --env=PUBLIC_ORIGIN=http://127.0.0.1:4181 \
      "$flux_image_ref" >/dev/null
    flux_healthy=false
    for flux_attempt in $(seq 1 45); do
      if curl --fail --silent http://127.0.0.1:4181/api/health >/dev/null; then flux_healthy=true; break; fi
      sleep 1
    done
    [[ "$flux_healthy" == true ]] || { echo 'Container health check failed; publication is blocked.' >&2; exit 1; }
    curl --fail --silent http://127.0.0.1:4181/ >/dev/null
    echo 'Non-root OCI image serves the frontend and API with a read-only root filesystem.'
    ;;
  publish)
    : "${GHCR_PUBLISH_TOKEN:?The ephemeral GitHub job token is required}"
    : "${GITHUB_ACTOR:?The GitHub job actor is required}"
    : "${RUNNER_TEMP:?A private runner temp directory is required}"
    flux_auth_file="${RUNNER_TEMP}/flux-ghcr-auth.json"
    flux_digest_file="${RUNNER_TEMP}/flux-image-digest.txt"
    trap 'sudo rm -f "$flux_auth_file"' EXIT
    # Credential travels via stdin, never a command argument, output or artifact.
    printf '%s' "$GHCR_PUBLISH_TOKEN" | sudo buildah login --authfile="$flux_auth_file" \
      --username="$GITHUB_ACTOR" --password-stdin ghcr.io >/dev/null
    sudo buildah --storage-driver=vfs push --authfile="$flux_auth_file" \
      --digestfile="$flux_digest_file" "$flux_image_ref" "$flux_image_ref"
    flux_digest="$(sudo cat "$flux_digest_file")"
    [[ "$flux_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Registry digest is invalid.' >&2; exit 1; }
    printf 'Verified image: `%s@%s`\n' "$FLUX_IMAGE_NAME" "$flux_digest" >> "$GITHUB_STEP_SUMMARY"
    ;;
  *) echo 'Usage: ghcr-image.sh build|publish' >&2; exit 1 ;;
esac
