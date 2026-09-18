# Open AI API

A small web application that sends prompts to a local Codex agent through the
Codex SDK.

## Prerequisites

- Node.js 18 or later
- Codex CLI authenticated with your ChatGPT account

An OpenAI API key is **not required**. The SDK reuses the Codex session stored
on the machine where the server runs, so the application can work with the
same ChatGPT account that is already signed in to Codex.

## Setup

1. Sign in to Codex if there is no active local session yet:

   ```bash
   codex login
   ```

   You can check the current authentication status with:

   ```bash
   codex login status
   ```

2. Install the project dependencies:

   ```bash
   npm install
   ```

3. Start the application:

   ```bash
   npm start
   ```

4. Open <http://localhost:3001>.

The server creates `code-to-edit/` automatically on startup. Place the source
files you want Codex to modify in that directory, including nested folders if
needed.

## Authentication

`server.mjs` creates a Codex SDK client without passing an API key. The Codex
process therefore picks up the existing local Codex authentication session.
There is no need to create a `.env` file or set `OPENAI_API_KEY` for this setup.

The session belongs to the operating-system user running the server. If the
server is started under another user, in a container, or on another machine,
that environment must have its own Codex login.

Using an API key remains an optional alternative for non-interactive or CI
environments, but it is not required for local use with an authenticated Codex
session.

## Usage

Place code in `code-to-edit/`, then enter an editing instruction in the web
interface. Codex runs with that directory as its writable workspace, inspects
the relevant files, and applies changes directly on disk. The browser displays
the current files under **Code to edit** and refreshes them after every
successful request.

The workspace is live filesystem state, not a transactional copy. A failed
Codex run can leave partial edits, so keep important source code under version
control or maintain a backup. Symbolic links and non-UTF-8 files are not shown
in the browser. The entire `code-to-edit/` directory is ignored by Git in this
repository.

The server still saves Codex's final textual response and returns it to the
browser as before.

## Saved responses

Every successful Codex answer is saved as a separate UTF-8 Markdown file in
the `responses/` directory at the project root. The directory is created
automatically when the first answer is saved. Filenames start with a UTC
timestamp and include a UUID, for example:

```text
responses/2026-09-18T10-11-12-345Z_123e4567-e89b-12d3-a456-426614174000.md
```

The server writes the file before returning a successful API response. If the
file cannot be written, the request returns HTTP 500 instead of reporting a
false success. Failed Codex requests do not create response files.

The `responses/` directory is ignored by Git. Files are retained until they
are removed manually; the application does not apply automatic cleanup or a
retention limit.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `3001`. |
| `OPENAI_API_KEY` | No | Optional API-key authentication instead of the stored Codex session. |

## License

This project is available under the terms of the license included in this repository.
