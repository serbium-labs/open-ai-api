#!/usr/bin/env sh

set -eu

WHISPER_VERSION="v1.9.4"
WHISPER_REVISION="927cfce34f31707e17f2bff35c349632fb9e2c3a"
WHISPER_REPOSITORY="https://github.com/ggml-org/whisper.cpp.git"
PROJECT_ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
WHISPER_SOURCE="$PROJECT_ROOT/.local/whisper.cpp"
WHISPER_BUILD="$WHISPER_SOURCE/build"
INSTALL_LOCK="$PROJECT_ROOT/.local/whisper.cpp.install-lock"
TEMP_SOURCE=""
INSTALL_LOCK_HELD=0

cleanup() {
  if [ -n "$TEMP_SOURCE" ] && [ -d "$TEMP_SOURCE" ]; then
    rm -rf "$TEMP_SOURCE"
  fi
  if [ "$INSTALL_LOCK_HELD" -eq 1 ]; then
    rmdir "$INSTALL_LOCK" 2>/dev/null || true
  fi
}

trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command git
require_command cmake

mkdir -p "$PROJECT_ROOT/.local"
if ! mkdir "$INSTALL_LOCK" 2>/dev/null; then
  echo "Another whisper.cpp setup may be running: $INSTALL_LOCK" >&2
  echo "If no setup is running, remove this empty lock directory and retry." >&2
  exit 1
fi
INSTALL_LOCK_HELD=1

if [ -e "$WHISPER_SOURCE" ]; then
  if [ ! -d "$WHISPER_SOURCE/.git" ]; then
    echo "Refusing to overwrite existing path: $WHISPER_SOURCE" >&2
    echo "It may be an incomplete installation. Inspect it, then move or remove it manually before retrying." >&2
    exit 1
  fi

  current_version=$(git -C "$WHISPER_SOURCE" describe --tags --exact-match 2>/dev/null || true)
  current_revision=$(git -C "$WHISPER_SOURCE" rev-parse HEAD 2>/dev/null || true)

  if [ "$current_version" != "$WHISPER_VERSION" ] || [ "$current_revision" != "$WHISPER_REVISION" ]; then
    echo "Existing whisper.cpp checkout is not the expected $WHISPER_VERSION revision." >&2
    echo "It was left unchanged. Move it aside or set WHISPER_CPP_PATH to another installation." >&2
    exit 1
  fi

  if ! local_changes=$(git -C "$WHISPER_SOURCE" status --porcelain --untracked-files=all); then
    echo "Could not inspect the existing whisper.cpp checkout at $WHISPER_SOURCE. It was left unchanged." >&2
    exit 1
  fi

  if [ -n "$local_changes" ]; then
    echo "Existing whisper.cpp checkout contains local modifications: $WHISPER_SOURCE" >&2
    echo "They were left unchanged. Commit or move the checkout, or set WHISPER_CPP_PATH to another installation." >&2
    exit 1
  fi

  echo "Using existing whisper.cpp $WHISPER_VERSION checkout at $WHISPER_SOURCE"
else
  TEMP_SOURCE=$(mktemp -d "$PROJECT_ROOT/.local/whisper.cpp.tmp.XXXXXX")
  git clone --branch "$WHISPER_VERSION" --depth 1 "$WHISPER_REPOSITORY" "$TEMP_SOURCE"

  cloned_version=$(git -C "$TEMP_SOURCE" describe --tags --exact-match 2>/dev/null || true)
  cloned_revision=$(git -C "$TEMP_SOURCE" rev-parse HEAD)
  expected_revision=$(git -C "$TEMP_SOURCE" rev-list -n 1 "$WHISPER_VERSION")

  if [ "$cloned_version" != "$WHISPER_VERSION" ] || [ "$cloned_revision" != "$expected_revision" ] || [ "$cloned_revision" != "$WHISPER_REVISION" ]; then
    echo "Cloned whisper.cpp revision did not match $WHISPER_VERSION. The final installation was left unchanged." >&2
    exit 1
  fi

  if [ -e "$WHISPER_SOURCE" ]; then
    echo "Refusing to overwrite path created during installation: $WHISPER_SOURCE" >&2
    exit 1
  fi

  mv "$TEMP_SOURCE" "$WHISPER_SOURCE"
  TEMP_SOURCE=""
fi

cmake -S "$WHISPER_SOURCE" -B "$WHISPER_BUILD" -DCMAKE_BUILD_TYPE=Release
cmake --build "$WHISPER_BUILD" --config Release --parallel

WHISPER_EXECUTABLE="$WHISPER_BUILD/bin/whisper-cli"

if [ ! -x "$WHISPER_EXECUTABLE" ]; then
  echo "Build completed but whisper-cli was not found at $WHISPER_EXECUTABLE" >&2
  exit 1
fi

echo "whisper.cpp $WHISPER_VERSION is ready."
echo "Run this in the terminal that starts the application:"
echo "export WHISPER_CPP_PATH=\"$WHISPER_EXECUTABLE\""
