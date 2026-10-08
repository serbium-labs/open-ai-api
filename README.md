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
- `ffmpeg` for safe audio decoding and normalization
- `whisper.cpp` plus a local GGML Whisper model for voice messages

## Local voice transcription on macOS Apple Silicon

Voice messages are transcribed entirely on the machine running the server. No
speech API, paid service, API key, or audio upload to a transcription provider
is used. The server accepts WebM, Ogg, M4A/MP4, WAV, MP3, and FLAC audio up to
20 MB, converts it to 16 kHz mono WAV with `ffmpeg`, and runs `whisper-cli`.

From this project's root, install the build and conversion tools with
[Homebrew](https://brew.sh/):

```bash
brew install cmake ffmpeg
```

Build the official [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
source in a sibling directory. Its default macOS build uses Apple Silicon
acceleration:

```bash
git clone https://github.com/ggml-org/whisper.cpp.git ../whisper.cpp
cmake -S ../whisper.cpp -B ../whisper.cpp/build -DCMAKE_BUILD_TYPE=Release
cmake --build ../whisper.cpp/build --config Release -j
```

Download the multilingual `base` model to the path used by this app:

```bash
mkdir -p models
curl --fail --location \
  --output models/ggml-base.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

Set the locally built executable path in the terminal that starts the app:

```bash
export WHISPER_CPP_PATH="$(cd ../whisper.cpp && pwd)/build/bin/whisper-cli"
```

Verify all three local requirements before starting the server:

```bash
ffmpeg -version | head -n 1
"$WHISPER_CPP_PATH" --help
shasum -a 1 models/ggml-base.bin
```

The expected SHA-1 for `ggml-base.bin` is
`465707469ff3a37a2b9b8d8f89f2f99de7299dac`. The model is ignored by Git.
If you store it elsewhere, set an absolute or project-relative path:

```bash
export WHISPER_MODEL_PATH=/absolute/path/to/ggml-base.bin
```

`FFMPEG_PATH` can override the `ffmpeg` executable, and
`AUDIO_TRANSCRIPTION_TIMEOUT_MS` can override the 120-second timeout. Missing
tools, an unreadable model, unsupported audio bytes, empty speech, command
failures, and timeouts are returned as errors; the app does not send a fake or
empty transcript to Codex.

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

3. Start the application in development mode:

   ```bash
   npm start
   ```

   or:

   ```bash
   npm run dev
   ```

4. Open <http://localhost:5173>.

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

The client runs on <http://localhost:5173>. The server runs on
<http://localhost:3001>. Vite proxies `/api/*` requests to the Express server,
so browser code can call `/api/chats` without hardcoding the server origin.

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
There is no need to create a `.env` file or set `OPENAI_API_KEY` for this setup.

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

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Express server port. Defaults to `3001`. |
| `OPENAI_API_KEY` | No | Optional API-key authentication instead of the stored Codex session. |
| `WHISPER_CPP_PATH` | For voice | Path to `whisper-cli`. Defaults to `whisper-cli` on `PATH`. |
| `WHISPER_MODEL_PATH` | For voice | GGML model path. Defaults to `models/ggml-base.bin`. |
| `FFMPEG_PATH` | For voice | Path to `ffmpeg`. Defaults to `ffmpeg` on `PATH`. |
| `AUDIO_TRANSCRIPTION_TIMEOUT_MS` | No | Per-command audio timeout. Defaults to `120000`. |

## License

This project is licensed under the Apache License, Version 2.0.

See the [LICENSE](LICENSE) file for the full text of the license.
