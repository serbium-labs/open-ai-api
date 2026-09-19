# Open AI API

A small local web application for talking to a Codex agent from a browser.
The app shows a chat between the user and the model, renders Markdown and code
blocks in the transcript, and saves generated output code blocks as files.

The project is split into:

- `client/` - React + Vite + TypeScript frontend
- `server/` - Express + TypeScript backend
- `code-block-responses/` - generated files extracted from model code blocks
- `responses/` - saved Markdown transcripts of successful Codex runs

## Overview

This app is designed for local Codex experiments:

- the browser provides a chat-style prompt UI,
- the server sends the prompt to a local Codex session,
- Codex returns a final Markdown response,
- fenced code blocks from the response are extracted into
  `code-block-responses/`,
- the UI refreshes the resources sidebar after each successful request.

The resources sidebar is hidden by default and can be opened from the chat UI.
It shows the current generated code block files with language labels, syntax
highlighting, and copy buttons. Code blocks in chat responses have the same
language labels, syntax highlighting, and copy support.

An OpenAI API key is not required for the default local setup. The SDK reuses
the existing Codex authentication session on the machine running the server, so
it works with the same ChatGPT account already signed in to Codex.

## Prerequisites

- Node.js 18 or later
- Codex CLI authenticated with your ChatGPT account

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

   On macOS/Linux/Git Bash:

   ```bash
   ./dev.sh
   ```

   On Windows:

   ```bat
   dev.bat
   ```

4. Open <http://localhost:5173>.

The server creates `code-block-responses/` automatically when output code
blocks are saved.

## Usage

Enter a prompt in the chat composer and send it. The prompt is submitted to
Codex, then the model response appears in the chat transcript. The composer is
disabled while a request is running, and the pending model message shows a
thinking indicator.

The transcript supports:

- Markdown paragraphs, quotes, lists, headings, links, inline code, and bold
  text,
- fenced code blocks rendered inline with language labels,
- syntax highlighting for common languages such as JavaScript, TypeScript,
  JSON, CSS, HTML, Markdown, Python, and shell scripts,
- copy buttons on code blocks.

When Codex returns fenced code blocks, the server extracts each block and writes
it to `code-block-responses/`. If a code block includes a safe relative path in
the fence info, that path is used. For example:

````markdown
```js src/example.js
export function example() {
  return "hello";
}
```
````

If no path is provided, the server generates a filename such as
`output-001.js`. Supported language-derived extensions include `js`, `jsx`,
`ts`, `tsx`, `json`, `css`, `html`, `md`, and `sh`. Unknown languages fall back
to `.txt`.

The `code-block-responses/` directory is refreshed from the latest successful
response. It is ignored by Git.

## Resources

Open the resources panel from the chat UI to inspect generated files. Each file
shows:

- a language label inferred from the filename or detected shell-like `.txt`
  content,
- the relative output path,
- syntax-highlighted content,
- a copy button for the whole file.

The resources panel is separate from the chat transcript; it is not loaded into
the prompt automatically.

## Saved responses

Every successful Codex answer is saved as a separate UTF-8 Markdown file in
the `responses/` directory at the project root. The directory is created
automatically when the first answer is saved. Filenames start with a UTC
timestamp and include a UUID, for example:

```text
responses/2026-09-18T10-11-12-345Z_123e4567-e89b-12d3-a456-426614174000.md
```

The server writes the response file before returning a successful API response.
If the file cannot be written, the request returns HTTP 500 instead of
reporting a false success. Failed Codex requests do not create response files.

The `responses/` directory is ignored by Git. Files are retained until they
are removed manually; the application does not apply automatic cleanup or a
retention limit.

## Development

The client runs on <http://localhost:5173>. The server runs on
<http://localhost:3001>. Vite proxies `/api/*` requests to the Express server,
so browser code can call `/api/code` and `/api/codex` without hardcoding the
server origin.

Run one side at a time if needed:

```bash
npm run dev:client
npm run dev:server
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

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Express server port. Defaults to `3001`. |
| `OPENAI_API_KEY` | No | Optional API-key authentication instead of the stored Codex session. |

## License

This project is licensed under the Apache License, Version 2.0.

See the [LICENSE](LICENSE) file for the full text of the license.
