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

Enter a prompt in the web interface. The server sends it to a new local Codex
thread and returns the final response.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `3001`. |
| `OPENAI_API_KEY` | No | Optional API-key authentication instead of the stored Codex session. |

## License

This project is available under the terms of the license included in this repository.
