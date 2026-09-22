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

## License

This project is licensed under the Apache License, Version 2.0.

See the [LICENSE](LICENSE) file for the full text of the license.
