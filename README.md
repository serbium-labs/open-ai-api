# Open AI API

A small local web application for talking to a Codex agent from a browser.
The app shows a GPT-style chat between the user and the model, renders
Markdown and code blocks in the transcript, and persists chat history on disk.

The project is split into:

- `client/` - React + Vite + TypeScript frontend
- `server/` - Express + TypeScript backend
- `chats/` - local runtime chat archive, ignored by Git

## Overview

This app is designed for local Codex experiments:

- the browser provides a chat-style prompt UI,
- the server sends the prompt to a local Codex session,
- Codex returns a final Markdown response,
- each conversation is saved under `chats/`,
- fenced code blocks from assistant messages are saved as resources for the
  same chat,
- opening a saved chat loads its transcript and resource sidebar.

The resources sidebar is hidden by default and can be opened from the chat UI.
It shows generated code block files with language labels, syntax highlighting,
and copy buttons. Code blocks in chat responses have the same rendering and
copy support.

An OpenAI API key is not required for the default local setup. The SDK reuses
the existing Codex authentication session on the machine running the server, so
it works with the same ChatGPT account already signed in to Codex.

## Prerequisites

- Node.js 18 or later
- Codex CLI authenticated with your ChatGPT account
- Git
- For voice messages: FFmpeg, CMake, a C/C++ compiler, and a local GGML
  Whisper model

## Local voice transcription

Voice messages are transcribed entirely on the machine running the server. No
speech API, paid service, API key, or audio upload to a transcription provider
is used. The server accepts WebM, Ogg, M4A/MP4, WAV, MP3, and FLAC audio up to
20 MB, converts it to 16 kHz mono WAV with `ffmpeg`, and runs `whisper-cli`.

The provided setup scripts clone the official
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) release `v1.9.4` into
`.local/whisper.cpp/` and build it there. The entire `.local/` directory is
ignored by Git, so downloaded source and native build artifacts are never
committed. Both scripts verify that the release resolves to commit
`927cfce34f31707e17f2bff35c349632fb9e2c3a`. Re-running a script reuses a clean
checkout at that revision. It refuses to replace an existing directory, a
modified checkout, or a checkout at another revision. New clones use a
temporary sibling directory and are moved into place only after verification.
The macOS/Linux script also prevents concurrent setup runs from installing into
the same directory. If `.local/whisper.cpp/` already contains an incomplete
installation from an older attempt, inspect it and move or remove it manually
before running the setup script again.

An existing installation such as `../whisper.cpp` is not read, changed, or
deleted by these scripts. You may continue using it by setting
`WHISPER_CPP_PATH` to its `whisper-cli` executable instead of running the
project-local setup.

### macOS Apple Silicon and Intel

Install Git, CMake, and FFmpeg with [Homebrew](https://brew.sh/). Xcode Command
Line Tools provide the compiler; install them first with
`xcode-select --install` if `cc` is unavailable.

```bash
brew install cmake ffmpeg git
```

From the project root, run the setup script. CMake builds for the Mac's native
architecture: ARM64 on Apple Silicon or x86_64 on Intel. The default macOS
whisper.cpp build enables Metal support where supported.

```bash
sh scripts/setup-whisper.sh
ffmpeg -version | head -n 1
.local/whisper.cpp/build/bin/whisper-cli --help
```

### Linux (Debian or Ubuntu)

Install the compiler, CMake, Git, curl, and FFmpeg, then run the project-local
setup script:

```bash
sudo apt update
sudo apt install build-essential cmake curl ffmpeg git
sh scripts/setup-whisper.sh
ffmpeg -version | head -n 1
.local/whisper.cpp/build/bin/whisper-cli --help
```

Use the corresponding compiler, CMake, and FFmpeg packages on other Linux
distributions.

### Windows x64 and ARM64 (PowerShell)

Install these prerequisites:

- Git and Node.js, with both commands added to `PATH`.
- CMake, with **Add CMake to the system PATH** selected, or the CMake component
  installed by Visual Studio.
- Visual Studio 2022 or Visual Studio 2022 Build Tools with the **Desktop
  development with C++** workload.
- The MSVC x64/x86 build tools and a Windows 10 or Windows 11 SDK for an x64
  build.
- The MSVC ARM64/ARM64EC build tools in the Visual Studio Installer's
  **Individual components** tab for a native ARM64 build.
- A Windows FFmpeg build linked from the official
  [FFmpeg download page](https://ffmpeg.org/download.html).

Open a new PowerShell session after installation and confirm that `git`,
`cmake`, and `ffmpeg.exe` are available. From the project root, choose the build
that matches the machine on which the server will run:

```powershell
# Most Windows PCs
.\scripts\setup-whisper.ps1 -Architecture x64

# Native Windows on ARM64 (requires the ARM64 MSVC tools)
.\scripts\setup-whisper.ps1 -Architecture ARM64
```

The script explicitly selects the `Visual Studio 17 2022` CMake generator and
creates a separate `build-x64` or `build-arm64` directory. This avoids relying
on CMake's environment-dependent default generator. Verify the executables
after the build:

```powershell
ffmpeg.exe -version
& ".local\whisper.cpp\build-x64\bin\Release\whisper-cli.exe" --help
```

For ARM64, replace `build-x64` with `build-arm64`. Building x64 on Windows ARM64
is also possible when the x64 toolchain is installed, but it produces an x64
binary that runs through Windows emulation rather than a native ARM64 binary.

If script execution is disabled by local PowerShell policy, invoke it for the
current process with `powershell -ExecutionPolicy Bypass -File
.\scripts\setup-whisper.ps1 -Architecture x64`. If `ffmpeg.exe` is not on
`PATH`, assign its full path instead. PowerShell quotes paths containing spaces
when assigning them; the quote characters are not part of the value. Point
executable variables directly to `.exe` files rather than `.cmd` or `.bat`
wrappers.

### Download and verify the model

From the project root on macOS or Linux, download the multilingual `base` model
to a unique temporary file, verify its SHA-1 digest, and move it into place only
when no model already exists:

```bash
mkdir -p models
if [ -e models/ggml-base.bin ]; then
  echo "Refusing to overwrite existing model: models/ggml-base.bin" >&2
  exit 1
fi
model_tmp=$(mktemp models/ggml-base.bin.tmp.XXXXXX)
trap 'rm -f "$model_tmp"' EXIT HUP INT TERM
curl --fail --location \
  --output "$model_tmp" \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
if command -v shasum >/dev/null 2>&1; then
  model_sha1=$(shasum -a 1 "$model_tmp" | awk '{print $1}')
else
  model_sha1=$(sha1sum "$model_tmp" | awk '{print $1}')
fi
if [ "$model_sha1" != "465707469ff3a37a2b9b8d8f89f2f99de7299dac" ]; then
  echo "Model checksum verification failed." >&2
  exit 1
fi
if ! ln "$model_tmp" models/ggml-base.bin; then
  echo "Refusing to overwrite model created during download." >&2
  exit 1
fi
rm -f "$model_tmp"
trap - EXIT HUP INT TERM
export WHISPER_MODEL_PATH="$(pwd)/models/ggml-base.bin"
```

The temporary download and final model are on the same filesystem, so `ln`
creates the final name atomically and fails if another installer created it
first. It never replaces an existing model.

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force models | Out-Null
$modelPath = Join-Path (Resolve-Path models).Path "ggml-base.bin"
if (Test-Path -LiteralPath $modelPath) {
  throw "Refusing to overwrite existing model: $modelPath"
}
$modelTemp = Join-Path (Resolve-Path models).Path "ggml-base.bin.tmp.$([guid]::NewGuid().ToString('N'))"
try {
  Invoke-WebRequest `
    -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" `
    -OutFile $modelTemp
  $modelSha1 = (Get-FileHash -Algorithm SHA1 -LiteralPath $modelTemp).Hash
  if ($modelSha1 -ne "465707469ff3a37a2b9b8d8f89f2f99de7299dac") {
    throw "Model checksum verification failed."
  }
  [System.IO.File]::Move($modelTemp, $modelPath)
} finally {
  if (Test-Path -LiteralPath $modelTemp) {
    Remove-Item -LiteralPath $modelTemp -Force
  }
}
$env:WHISPER_MODEL_PATH = (Resolve-Path "models\ggml-base.bin").Path
```

The expected SHA-1 for `ggml-base.bin`, published in the official
[whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp), is
`465707469ff3a37a2b9b8d8f89f2f99de7299dac`. The model is ignored by Git. An
absolute model path is recommended; project-relative paths are resolved from
the repository root. `FFMPEG_PATH` and `WHISPER_CPP_PATH` may be either native
executable names on `PATH` or full paths. Full paths containing spaces work
without extra escaping because the server does not invoke a shell.

After the tools and model have been installed, start the application using the
commands in [Setup](#setup). The application automatically discovers the
project-local whisper.cpp executable created by these scripts. Set
`WHISPER_CPP_PATH` in `.env` only for a custom or external installation.
`AUDIO_TRANSCRIPTION_TIMEOUT_MS` can override the 120-second per-command
timeout. Missing tools, an unreadable model, unsupported audio bytes, empty
speech, command failures, and timeouts are returned as errors; the app does not
send a fake or empty transcript to Codex. If a timed-out native process does not
confirm that it has closed, the server retains that request's temporary audio
directory rather than risk deleting files that are still in use. Such uncommon
directories remain in the operating system's temporary-files location for
system or manual cleanup.

## Setup

1. Sign in to Codex if there is no active local session yet:

   ```bash
   codex login
   ```

   Check the current status with:

   ```bash
   codex login status
   ```

2. Install dependencies for the root workspace, client, and server:

   ```bash
   npm install
   ```

3. Create a local configuration file. The checked-in defaults work for most
   installations:

   ```bash
   cp .env.example .env
   ```

   In Windows PowerShell, use `Copy-Item .env.example .env`. Existing shell
   environment variables take precedence over values in `.env`.

4. Complete the platform-specific voice setup above if voice messages are
   needed. No `WHISPER_CPP_PATH` export is required for a project-local build.

5. Start the application in development mode:

   ```bash
   npm start
   ```

   or:

   ```bash
   npm run dev
   ```

6. Open <http://localhost:5173>, or the port configured by `CLIENT_PORT`.

## Docker Compose

Docker Compose builds one reproducible Linux image and runs the development
client and server together in one container. The image contains Node.js 22,
FFmpeg, the Codex CLI supplied by the locked npm dependencies, whisper.cpp at
commit `927cfce34f31707e17f2bff35c349632fb9e2c3a`, and the multilingual Whisper
`base` model after verifying its SHA-1 checksum. Docker-managed volumes retain
chats, Linux `node_modules`, and the container's separate Codex login.

### Prerequisites and repository setup

- Windows: complete the [Windows Docker Desktop setup](#windows-docker-desktop-setup)
  below. Run the remaining commands in PowerShell or a WSL shell from the
  repository directory; this image does not run as a native Windows container.
- macOS: install and start Docker Desktop.
- Linux: install and start Docker Engine with the Docker Compose plugin, and
  ensure your user can run `docker` commands.
- All platforms: install Git and verify `git --version` and
  `docker compose version` before continuing.

#### Windows Docker Desktop setup

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
   and start it from the Windows Start menu. Wait until Docker Desktop reports
   that its engine is running.
2. In Docker Desktop, open **Settings > General** and enable **Use the WSL 2
   based engine**, if that option is shown, then apply the change. Docker
   Desktop may enable it automatically or hide the option on some versions.
   See Docker's [WSL 2 backend guide](https://docs.docker.com/desktop/features/wsl/)
   for current requirements and setup details.
3. This project requires Linux containers. Open the Docker Desktop menu from
   its taskbar notification-area icon. If the menu offers **Switch to Linux
   containers**, select it and wait for Docker Desktop to restart. If it offers
   **Switch to Windows containers** instead, Docker Desktop is already running
   Linux containers. Menu wording and location can vary by Docker Desktop
   version.
4. Open a new PowerShell window and run:

   ```powershell
   docker info
   docker compose version
   ```

   A working setup makes `docker info` print both client and server information,
   including `OSType: linux` in its **Server** section. The second command
   prints a Docker Compose version without a connection error. Continue only
   after both commands succeed.

Obtain the repository and enter its root directory:

```bash
git clone https://github.com/serbium-labs/open-ai-api.git
cd open-ai-api
```

If you already have a checkout, open a terminal in that existing repository
root instead. Create the required local configuration from the safe example:

```bash
cp .env.example .env
```

In PowerShell, use `Copy-Item .env.example .env`. Do not put passwords, access
tokens, or other secrets in `.env`: the file is excluded from the image and
Git, but the development bind mount makes it readable inside the running
container. Compose fixes `CLIENT_PORT=5173`, `SERVER_PORT=3001`, and the Linux
paths for FFmpeg, whisper.cpp, and its model. The useful optional `.env` values
for Compose are `WHISPER_LANGUAGE` (default `auto`) and
`AUDIO_TRANSCRIPTION_TIMEOUT_MS` (default `120000`). The native paths in
`.env.example` are overridden inside the container.

### First start and Codex authentication

Build the image from the repository root:

```bash
docker compose build
```

Authenticate the container's dedicated Codex home before starting the app:

```bash
docker compose run --rm app codex login --device-auth
docker compose run --rm app codex login status
```

The first command displays a URL and a short-lived device code. Open the URL
yourself, confirm that it is an OpenAI/ChatGPT sign-in page, and enter the code
there. Never paste the code into chat, an issue, a log, or a message to another
person; anyone who obtains a live code may be able to complete the login.

If Codex reports that device-code login is disabled, open ChatGPT **Settings >
Security** and enable **Device code authorization**. In a managed workspace,
an owner or administrator may also need to enable **Enable device code
authentication for Codex CLI** in the workspace's Codex Local permissions.
OpenAI warns that device codes can be phished, so disable the setting again
after login if that is your workspace policy. Then rerun both commands above.

This login is intentionally separate from the host's `~/.codex`; its
credentials are stored in the `codex_home` Docker volume and are not copied
into the image or repository.

Start the app, wait for both development servers to report that they are
ready, and open <http://localhost:5173> in a browser:

```bash
docker compose up
```

Press Ctrl+C to stop an attached run. For subsequent use, start in the
background and inspect the logs if needed:

```bash
docker compose up -d
docker compose logs --follow app
```

Stop and remove the container and Compose network without deleting persisted
data:

```bash
docker compose down
```

### Persistence, security, and rebuilding

The repository is mounted read-write at `/app` so Vite can see development
changes. Processes in the container, including Codex operations initiated by
this app, can therefore read and modify the checkout and any local files in it.
Run only trusted prompts and code, keep secrets outside the repository, and
review source changes after use.

The `chats` volume persists `/app/chats`, and `codex_home` persists
`/home/node/.codex`. The `node_modules` volume preserves the Linux dependencies
from the image instead of exposing incompatible host dependencies.
`docker compose down` retains all three volumes. **Do not run
`docker compose down --volumes` unless you intend to delete the Compose-managed
chat archive, container-specific Codex login, and installed dependency volume.**
Back up any chats first. The host's native `chats/` directory is hidden by the
named volume while Compose is running and is not the Docker chat backup.

Rebuild after changing package manifests, the lockfile, Dockerfile, or Whisper
build inputs:

```bash
docker compose down
docker compose build --no-cache
docker compose up
```

### Troubleshooting

Inspect the resolved configuration, container state, logs, login, and bundled
voice tools with:

```bash
docker compose config
docker compose ps
docker compose logs --follow app
docker compose run --rm app codex login status
docker compose run --rm app ffmpeg -version
docker compose run --rm app /opt/whisper/bin/whisper-cli --help
docker compose exec app sh -lc 'id && printf "%s\n" "$CODEX_HOME"'
```

Common failures:

- Docker command or engine unavailable on Windows: if PowerShell reports that
  `docker` is not recognized, install or restart Docker Desktop, then open a new
  PowerShell window. If `docker info` reports that it cannot connect to the
  daemon or engine, start or restart Docker Desktop and wait until its engine
  is running before retrying. Follow Docker's
  [Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/)
  if the command remains unavailable.
- WSL 2 unavailable or outdated on Windows: open PowerShell as Administrator,
  run `wsl --install` if WSL is not installed, or run `wsl --update` to update
  it, then restart Windows if prompted. See Microsoft's
  [WSL installation guide](https://learn.microsoft.com/windows/wsl/install) and
  Docker's [WSL 2 requirements](https://docs.docker.com/desktop/features/wsl/)
  for supported Windows versions, virtualization requirements, and additional
  diagnostics.
- Docker Desktop using Windows containers: this image cannot run in that mode.
  Open the Docker Desktop taskbar menu, select **Switch to Linux containers**,
  wait for the engine to restart, and confirm that the **Server** section of
  `docker info` shows `OSType: linux` before running Compose again.
- Port 5173 already in use: stop the conflicting process, then run
  `docker compose up` again. The current Compose file does not provide a host
  port override.
- Authentication missing or expired: rerun the device-login and login-status
  commands above. Do not mount or copy the host's `~/.codex` directory.
- Voice unavailable: check the app logs, then run the FFmpeg and `whisper-cli`
  commands above. Both executables and the verified model are built into the
  image; `.env` must not replace their container paths.
- Stale dependencies after a lockfile change: use the no-cache rebuild above.
  If the existing `node_modules` volume still masks the rebuilt dependencies,
  run `docker volume ls`, identify this project's `node_modules` volume, stop
  the stack, and remove only that volume with `docker volume rm <volume-name>`.
  Rebuild and start again. Do not remove the `chats` or `codex_home` volumes.
- Permission errors in chats or credentials: use the `id`/`CODEX_HOME` command
  above and inspect volume ownership. The image runs as the unprivileged
  `node` user, not root.

The full Compose workflow—including image build, device authentication, text
chat, FFmpeg/Whisper voice transcription, model responses, persistence, and
shutdown—has been tested on macOS Apple Silicon with a Linux ARM64 container.
Linux AMD64 and Docker Desktop on Windows with WSL 2/Linux containers are
expected to work from the architecture-aware Node/Codex packages and portable
CMake build, but have not been runtime-tested. Native Windows containers are
not supported by this Dockerfile.

### Native development without Docker

Docker Compose is optional. For the existing native workflow, install the
platform prerequisites and voice components described above, authenticate the
host Codex CLI, copy `.env.example` to `.env`, install dependencies, and run:

```bash
npm install
npm start
```

Native development uses the host's Codex login, host tools, and the repository
`chats/` directory rather than the Docker volumes.

## Usage

Enter a prompt in the chat composer and send it with Enter or the send button.
Shift+Enter inserts a new line. The composer is disabled while a request is
running, and the pending model message shows a thinking indicator.

To use voice, select the microphone, speak a question, stop the recording, and
send it. The browser chooses a supported MediaRecorder format and the app
checks the recorded container bytes before naming the file. The saved user
message contains the local transcript and retains the original recording for
playback. If the browser labels Ogg bytes as WebM, the server stores those
unchanged bytes with the correct `.ogg` extension and `audio/ogg` MIME type.

The left sidebar lists saved chats. You can switch between chats, start a new
chat after the current chat has at least one message, and rename existing
chats. Empty draft chats are not created from the New chat button.

The transcript supports:

- Markdown paragraphs, quotes, lists, headings, links, inline code, and bold
  text,
- fenced code blocks rendered inline with language labels,
- syntax highlighting for common languages such as JavaScript, TypeScript,
  JSON, CSS, HTML, Markdown, Python, and shell scripts,
- copy buttons on code blocks.

## Persistent Chat Archive

Chats are stored under `chats/` at the project root and are retained across
server restarts. The archive is organized by request date:

```text
chats/
  2026-09-19/
    2026-09-19T19-43-29-435Z_b1145277/
      chat.md
      messages/
        001-user.md
        002-assistant.md
      resources/
        src/example.js
        src/example.js.meta.md
```

`chat.md` stores chat metadata such as id, title, creation date, and update
date. Each message is saved as its own Markdown file in `messages/`. Assistant
messages link to generated resources when a response contains fenced code
blocks.

The archive is also an Obsidian-compatible vault. `chat.md` links to every
message, messages link back to their chat and to the previous message, and
resource metadata links to the assistant message that produced it. Existing
archives are reindexed when the server starts, so their chat and message nodes
also appear as a connected graph in Obsidian.

Resources are saved in the selected chat's `resources/` folder. Each resource
keeps the generated code content, while its `.meta.md` sidecar stores the
language, producing message id, and backlink to the message file.

When Codex returns fenced code blocks, the server extracts each block. If a
code block includes a safe relative path in the fence info, that path is used.

For example:

````markdown
```js src/example.js
export function example() {
  return "hello";
}
```
````

If no path is provided, the server generates a filename such as
`002-assistant__001.js`. Supported language-derived extensions include `js`,
`jsx`, `ts`, `tsx`, `json`, `css`, `html`, `md`, `py`, and `sh`. Unknown
languages fall back to `.txt`.

The `chats/` directory is ignored by Git. Older `responses/` and
`code-block-responses/` folders are no longer used by the active app flow.

## Development

By default, the client runs on <http://localhost:5173> and the server runs on
<http://localhost:3001>. Vite reads the same root configuration and proxies
`/api/*` requests to `SERVER_PORT`. A port conflict is reported instead of
silently moving the client to another port.

Run one side at a time if needed:

```bash
npm run dev:client
npm run dev:server
```

Stop development servers started through `npm run dev` or `npm start` from
another terminal:

```bash
npm run stop
```

Build both projects:

```bash
npm run build
```

Run tests:

```bash
npm run test
```

Development conventions are documented in `DEVELOPMENT.md`.

## Authentication

The server creates a Codex SDK client without passing an API key. The Codex
process therefore picks up the existing local Codex authentication session.
An `OPENAI_API_KEY` is not required for this setup. The required `.env` file is
for local runtime settings and does not change the Codex authentication flow.

The session belongs to the operating-system user running the server. If the
server is started under another user, in a container, or on another machine,
that environment must have its own Codex login.

Using an API key remains an optional alternative for non-interactive or CI
environments, but it is not required for local use with an authenticated Codex
session.

## MCP Servers

This app can use MCP servers configured in the local Codex environment. The
server creates a Codex client without overriding MCP configuration, so Codex
inherits the MCP servers available to the operating-system user running the app.

MCP configuration can be stored globally in:

```text
~/.codex/config.toml
```

or at the project level in:

```text
.codex/config.toml
```

Project-level `.codex/config.toml` settings are loaded only for projects that
Codex trusts.

### Remote HTTP MCP Server

A remote MCP server can be added with the Codex CLI:

```bash
codex mcp add pet-care --url https://mcp.example.com
```

Or it can be configured directly in `config.toml`:

```toml
[mcp_servers.pet-care]
url = "https://mcp.example.com"
```

If the server uses bearer-token authentication, keep the token in an
environment variable instead of storing the secret directly in the config:

```toml
[mcp_servers.pet-care]
url = "https://mcp.example.com"
bearer_token_env_var = "PET_CARE_MCP_TOKEN"
```

Then export the token before starting Codex or this application:

```bash
export PET_CARE_MCP_TOKEN="replace-with-your-token"
npm run dev
```

### Local stdio MCP Server

A local stdio MCP server can be configured with a command and arguments:

```toml
[mcp_servers.pet-care-local]
command = "node"
args = ["/absolute/path/to/pet-care-mcp/server.js"]
```

Use an absolute path when possible so that the MCP server can be started
reliably regardless of the directory from which this application is launched.

### OAuth Authentication

Some remote MCP servers use OAuth instead of a static token. Complete the OAuth
authorization flow supported by the MCP server and Codex before using the
server through this application.

Do not store real credentials, access tokens, or secrets in this repository.

### Example Configuration

The following example uses placeholder values for a pet-care platform:

```toml
[mcp_servers.pet-care]
url = "https://mcp.example.com"
bearer_token_env_var = "PET_CARE_MCP_TOKEN"

[mcp_servers.pet-care-local]
command = "node"
args = ["/absolute/path/to/pet-care-mcp/server.js"]
```

Such an MCP server could expose tools for reading a pet profile, recording
weight, managing feeding schedules, or recording expenses.

### Verify MCP Tools

Check that Codex sees the configured MCP servers:

```bash
codex mcp list
```

Before testing through this application, verify the connection directly in
Codex by asking it to use one of the MCP server's tools.

Then start this application and send a browser chat request that requires the
external tool. Because the app uses the same local Codex configuration, the
configured MCP tools should also be available when requests are sent through
this app.

### Troubleshooting

If an MCP server cannot be used:

- run `codex mcp list` and confirm that the server is configured,
- verify the remote URL or local command and arguments,
- make sure required environment variables are exported in the shell that
  starts the application,
- complete or refresh OAuth authentication if required,
- make sure project-level `.codex/config.toml` is being loaded from a trusted
  project,
- test the MCP server directly in Codex to separate MCP configuration problems
  from application problems,
- restart the application after changing environment variables or MCP
  configuration.

The application also instructs Codex that available MCP tools may be used when
a workflow requires reading data or performing actions in connected services.

## Codex Model

The server pins the Codex SDK model through `CODEX_MODEL` in
`server/src/constants/index.ts`. The default is `gpt-5.6-terra`, which balances
coding capability and cost. Change that constant if Codex reports that the
current model is deprecated or if you want a different model for all browser
chat requests handled by this app.

## Environment Variables

The server requires a `.env` file in the repository root and exits with code 1
and an actionable error when the file is absent or unreadable. Individual
variables remain optional when the table below documents a safe default.

| Variable | Required | Description |
| --- | --- | --- |
| `SERVER_PORT` | No | Express port and Vite proxy target. Defaults to `3001` and takes precedence over `PORT`. |
| `CLIENT_PORT` | No | Vite client port. Defaults to `5173`. |
| `PORT` | No | Backward-compatible server-port alias, used only when `SERVER_PORT` is unset. |
| `OPENAI_API_KEY` | No | Optional API-key authentication instead of the stored Codex session. |
| `WHISPER_CPP_PATH` | No | Optional custom `whisper-cli` path. Project-local builds are discovered first, then `PATH` is used. |
| `WHISPER_MODEL_PATH` | For voice | GGML model path. Defaults to `models/ggml-base.bin`. |
| `FFMPEG_PATH` | For voice | Path to `ffmpeg`. Defaults to `ffmpeg` on `PATH`. |
| `WHISPER_LANGUAGE` | No | Language code. Defaults to `auto`; use `ru` for Russian or `en` for English. |
| `AUDIO_TRANSCRIPTION_TIMEOUT_MS` | No | Per-command audio timeout. Defaults to `120000`. |

Ports must be integers from 1 to 65535. Relative paths are resolved from the
repository root, while simple executable names are resolved through `PATH`.
At startup, bounded checks verify FFmpeg, whisper.cpp, and the model. Problems
are printed as actionable `[audio]` warnings, but the server, client, and text
chat continue to work. Voice requests check dependencies again and return a
clear error, so dependencies can be fixed and retried without restarting.

## License

This project is licensed under the Apache License, Version 2.0.

See the [LICENSE](LICENSE) file for the full text of the license.
