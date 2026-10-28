# Codex Web Client

Codex Web Client is a local, browser-based interface for working with OpenAI Codex. It provides persistent conversations, file and image attachments, locally transcribed voice messages, syntax-highlighted code responses, and a resource panel for files generated in Codex replies.

The application is intended for local development and experimentation. The server runs Codex against this repository with `workspace-write` sandbox permissions, while the application itself instructs Codex to return proposed files as fenced code blocks instead of applying changes directly. Conversation data and attachments remain in the local `chats/` directory; prompts and attachments sent to Codex are still processed according to the authentication method and OpenAI account policies in use.

## Features

- Create, resume, rename, and delete persistent chats.
- Continue conversations through Codex thread IDs.
- Send text prompts and up to five attachments per message.
- Pass images directly to Codex and expose other uploaded files through a safe local path.
- Record voice messages in the browser and transcribe them locally with FFmpeg and `whisper.cpp`.
- Extract fenced code blocks from assistant responses and display them as navigable, syntax-highlighted resources.
- Preserve messages, generated resources, and attachments as human-readable local files.
- Run with Docker Compose or directly with Node.js.

## Technology stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 6, Highlight.js, Lucide React |
| Backend | Node.js 22, TypeScript, Express 4, Multer |
| Codex integration | `@openai/codex-sdk` |
| Audio processing | Browser MediaRecorder API, FFmpeg, `whisper.cpp`, GGML Whisper Base model |
| Persistence | Local filesystem Markdown files and attachment files |
| Testing | Node.js test runner with `tsx` |
| Containerization | Docker, Docker Compose |

## Architecture

The repository is an npm workspace with separate frontend and backend packages:

```text
.
├── client/
│   ├── src/api/             # Typed HTTP client for the backend
│   ├── src/components/      # React UI and page-level orchestration
│   ├── src/constants/       # UI text and client constants
│   ├── src/types/           # Client domain types
│   └── vite.config.ts       # Dev server, ports, aliases, and /api proxy
├── server/
│   └── src/
│       ├── app/             # Express composition root
│       ├── config/          # .env loading, validation, and path resolution
│       ├── constants/       # Model, routes, defaults, and shared constants
│       ├── routes/chats/    # Chat, message, attachment, and resource HTTP API
│       ├── services/        # Codex, archive, audio, and workspace logic
│       └── types/           # Server DTOs and domain types
├── scripts/
│   ├── dev.mjs              # Starts the client and server together
│   ├── stop-dev.mjs         # Stops processes recorded by the dev launcher
│   ├── setup-whisper.sh     # Builds pinned whisper.cpp on macOS/Linux
│   └── setup-whisper.ps1    # Builds pinned whisper.cpp on Windows
├── chats/                   # Runtime chat archive; created automatically
├── models/                  # Local Whisper model files
├── compose.yaml             # Local container configuration
└── Dockerfile               # Node, FFmpeg, whisper.cpp, and model image
```

At runtime, the browser calls `/api/chats`. Vite proxies `/api` requests to the Express server during development. Express validates uploads and delegates work to focused services. The Codex service starts or resumes an SDK thread using the repository root as its working directory. The chat archive service writes metadata, messages, attachments, and extracted response resources beneath `chats/`.

```text
Browser / React
      │
      │  /api/chats
      ▼
Vite development server
      │
      │  proxy
      ▼
Express routes
      ├── Codex SDK ──────► OpenAI Codex
      ├── chat archive ───► chats/
      └── audio service ──► FFmpeg ──► whisper.cpp ──► local transcript
```

Assistant responses are stored with their chat. Fenced code blocks are also extracted into the chat's `resources/` directory. Paths supplied in fence metadata are validated as relative paths, and symbolic links are not followed when workspace files are read.

## Prerequisites

Choose one runtime:

- Docker Desktop with Docker Compose. This is the simplest option because the image includes Node.js, FFmpeg, `whisper.cpp`, and the Whisper model.
- Node.js 22 and npm for native development. Voice transcription additionally requires FFmpeg, CMake, a C/C++ build toolchain, `whisper.cpp`, and a compatible GGML model.

In both cases, Codex must be installed and authenticated on the host before the application starts.

## Prepare Codex authentication

Install the Codex CLI if it is not already available:

```bash
npm install --global @openai/codex
```

Start the sign-in flow:

```bash
codex login
```

Choose **Sign in with ChatGPT** or another authentication method offered for your account. For a headless machine, use `codex login --device-auth`. Verify the result with:

```bash
codex login status
```

Codex stores its configuration under `CODEX_HOME`, which defaults to `~/.codex`. The application reuses that directory. See the official [Codex CLI guide](https://learn.chatgpt.com/docs/cli) and [authentication documentation](https://learn.chatgpt.com/docs/auth) for current installation and sign-in options.

### Docker credential storage

Docker Compose mounts the host Codex directory read-only at `/codex-auth`. On startup, `auth.json` and `config.toml` are copied into a writable Docker-managed `CODEX_HOME` volume. This avoids permission failures caused by Windows bind mounts while keeping Codex sessions and runtime files writable. Credentials stored only in the operating system keychain are not available inside the container. If the Docker application reports an authentication error, configure file-backed credentials in `~/.codex/config.toml`:

```toml
cli_auth_credentials_store = "file"
```

Then run `codex login` again and confirm that `~/.codex/auth.json` exists. Treat this file as a secret: never commit, copy into the image, or share it. The repository's ignore rules exclude `.env`, but credentials live outside the repository and must be protected separately.

## Environment configuration

The server requires a root-level `.env` file even when all values would otherwise use defaults. Create it from the supplied template.

On macOS or Linux:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Review every value before starting the application:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SERVER_PORT` | No | `3001` | Express server port. It takes precedence over the legacy `PORT` variable. |
| `PORT` | No | — | Legacy server-port fallback used only when `SERVER_PORT` is absent. |
| `CLIENT_PORT` | No | `5173` | Vite port and Docker host/container port. |
| `WHISPER_LANGUAGE` | No | `auto` | Language passed to local transcription. Use a language supported by the installed Whisper model. |
| `WHISPER_MODEL_PATH` | Yes | `models/ggml-base.bin` | Whisper GGML model path. Relative paths are resolved from the repository root. The value must be present in `.env`. |
| `FFMPEG_PATH` | No | `ffmpeg` | FFmpeg command name or executable path. Relative paths containing directory separators are resolved from the repository root. |
| `WHISPER_CPP_PATH` | No | auto-detected | `whisper-cli` command or executable path. Leave it unset when using the provided setup script. |
| `AUDIO_TRANSCRIPTION_TIMEOUT_MS` | No | `120000` | Positive transcription timeout in milliseconds. Invalid or non-positive values fall back to the default. |
| `CODEX_AUTH_DIR` | Docker only | `${HOME}/.codex` on macOS/Linux; `${USERPROFILE}/.codex` when `HOME` is unset on Windows | Host directory from which `auth.json` and `config.toml` are imported into the writable container `CODEX_HOME`. This is consumed by Compose rather than the server. |

Important configuration rules:

- Port values must be integers from `1` to `65535`.
- Do not add quotes unless they are part of the intended value.
- Use absolute paths when a dependency is outside the repository.
- On Windows, use a normal Windows path such as `C:\Tools\ffmpeg\bin\ffmpeg.exe`.
- Never commit `.env` or Codex credentials.
- Docker overrides `FFMPEG_PATH`, `WHISPER_CPP_PATH`, and `WHISPER_MODEL_PATH` with paths inside the image. Their `.env` values primarily control native development.
- `CODEX_AUTH_DIR` must point to the directory that contains the authenticated Codex configuration, not directly to `auth.json`.

For a non-default Codex directory, add an absolute host path to `.env`:

```dotenv
CODEX_AUTH_DIR=/absolute/path/to/.codex
```

On Windows with Docker Desktop, use a path that Docker can bind-mount and ensure the drive or directory is shared with Docker.

## Run with Docker Compose

Docker is the recommended first-run path.

1. Start Docker Desktop and wait until the engine is ready.

2. Prepare Codex authentication as described above.

3. Create and review `.env`.

4. Build and start the application:

   ```bash
   docker compose up --build
   ```

   The initial build compiles a pinned `whisper.cpp` revision and downloads the verified GGML Base model, so it can take several minutes.

5. Open <http://localhost:5173>, or use the port configured by `CLIENT_PORT`.

6. Stop the foreground process with `Ctrl+C`.

7. For later starts, reuse the image:

   ```bash
   docker compose up
   ```

Source files and `chats/` are bind-mounted from the host. Dependencies remain in a named Docker volume. Changes to dependency manifests or the Dockerfile require another build.

## Run natively

Native development gives the fastest frontend and backend edit cycle, but local audio dependencies must be prepared separately.

1. Install workspace dependencies from the repository root:

   ```bash
   npm install
   ```

2. Install FFmpeg and confirm that `ffmpeg -version` succeeds, or set `FFMPEG_PATH` in `.env` to its executable.

3. Build the pinned `whisper.cpp` version on macOS or Linux:

   ```bash
   ./scripts/setup-whisper.sh
   ```

   On Windows PowerShell, run:

   ```powershell
   .\scripts\setup-whisper.ps1
   ```

   The scripts require CMake and a platform C/C++ toolchain. They install under `.local/`, where the server discovers `whisper-cli` automatically.

4. Place a compatible GGML Whisper model at `models/ggml-base.bin`, or set `WHISPER_MODEL_PATH` to another model file. The setup scripts compile `whisper.cpp`; they do not download the model.

5. Start both development servers:

   ```bash
   npm run dev
   ```

6. Open <http://localhost:5173>.

7. Stop the foreground process with `Ctrl+C`. If the launcher was detached or interrupted and recorded processes remain, run:

   ```bash
   npm run stop
   ```

Text chat remains available if an audio dependency is missing. The server reports audio diagnostics at startup, and voice requests fail with a focused error until the dependency is corrected.

## Development commands

Run these commands from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the client and server in watch mode. |
| `npm run dev:client` | Start only Vite. |
| `npm run dev:server` | Start only the Express server with TypeScript watch mode. |
| `npm run stop` | Stop process trees recorded by the combined development launcher. |
| `npm test` | Run server tests followed by client tests. |
| `npm run build` | Type-check and build both packages. |
| `npm --prefix client run preview` | Preview the built frontend. |

## Using the application

1. Open the web interface and enter a prompt.
2. Press `Enter` to send or `Shift+Enter` to insert a new line.
3. Use the attachment button to add up to five files. Images are passed to Codex as image input; other files are archived and made available to Codex through their local path.
4. Use the microphone button to record a voice message. The browser recording is normalized by FFmpeg and transcribed locally before the transcript is sent to Codex.
5. Open the chat-history panel to revisit, rename, or delete conversations.
6. Open the resources panel to inspect and copy files extracted from assistant code blocks.

Uploads are limited to 20 MiB. Supported audio containers are WebM, Ogg, M4A/MP4, WAV, MP3, and FLAC. Browser microphone permission is required for recording.

## Local data and security

- Each chat has a dedicated directory under `chats/` with metadata, message Markdown files, attachments, and generated resources.
- Deleting a chat removes its local archive directory.
- The Codex SDK receives the repository root as its working directory and uses `workspace-write` sandbox mode.
- Uploaded non-image files are made available to Codex by local path. Only attach files that are appropriate to process with the active OpenAI account.
- Voice transcription is local, but the resulting transcript becomes part of the prompt sent to Codex.
- The application has no user authentication layer of its own and is designed for local access. Do not expose it directly to an untrusted network.

## Troubleshooting

### The server says that `.env` is missing

Create the root `.env` file from `.env.example`. The backend intentionally refuses to start without it.

### Codex authentication fails in Docker

Run `codex login status` on the host, confirm that `CODEX_AUTH_DIR` points to the correct directory, and use file-backed credential storage as described in the Docker authentication section. Also confirm that Docker Desktop can mount the directory.

### Codex reports `Permission denied` in Docker Desktop

Rebuild and recreate the service so Compose uses the `codex_home` named volume. Codex writes sessions, cache, temporary files, and PATH aliases there instead of writing through the Windows bind mount. The host credential directory remains read-only and is used only as an import source.

### The client reports that the server is starting

The Vite proxy returns HTTP 503 while Express is unavailable. Inspect the server output for invalid ports, a missing `.env`, or authentication errors.

### Voice transcription fails

Check the startup diagnostics. Confirm that the configured FFmpeg executable and `whisper-cli` run successfully, that `WHISPER_MODEL_PATH` points to a readable file, and that the uploaded audio is no larger than 20 MiB.

### A configured port is already in use

Choose unused `SERVER_PORT` and `CLIENT_PORT` values in `.env`, then restart both processes. Vite uses strict port binding and will not silently select another port.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
