#!/bin/sh
set -eu

# Docker Desktop bind mounts do not preserve Linux ownership reliably. Keep
# Codex's mutable state on a named volume and copy only the host credentials
# and configuration into it.
mkdir -p \
  "${CODEX_HOME}/cache" \
  "${CODEX_HOME}/config" \
  "${CODEX_HOME}/tmp"

for codex_file in auth.json config.toml; do
  if [ -f "/codex-auth/${codex_file}" ]; then
    cp "/codex-auth/${codex_file}" "${CODEX_HOME}/${codex_file}"
    chmod 0600 "${CODEX_HOME}/${codex_file}"
  fi
done

exec "$@"
