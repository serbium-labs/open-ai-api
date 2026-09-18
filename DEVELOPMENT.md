# Development Style

## Architecture

- Keep the repository split into `client/` and `server/`.
- Put each React component in its own folder with `index.tsx`.
- Put each server module in its own folder with `index.ts`.
- Keep modules focused on one responsibility.
- Use classes when a module has state, invariants, or injected dependencies.
- Prefer functions for stateless transformations and small handlers.

## TypeScript

- Use TypeScript in both applications.
- Write explicit public types for DTOs, component props, service dependencies, and API responses.
- Avoid `any`. If a value is unknown, use `unknown` and narrow it.
- Keep shared contracts close to the code that owns them.

## Configuration

- Do not hardcode magic numbers or reusable strings in business logic.
- Put runtime configuration in `config/`.
- Put reusable constants in `constants/`.
- Keep ports, route paths, directory names, and UI copy named.

## Server

- Express app creation lives in `server/src/app/index.ts`.
- Route modules only translate HTTP input and output.
- Service modules own filesystem, Codex SDK, and persistence behavior.
- Inject dependencies into services and app creation when tests need control.
- Return API errors in a consistent `{ "error": "message" }` shape.

## Client

- `App` owns page-level state and orchestration.
- Components receive typed props and avoid direct API calls.
- API calls live in `client/src/api/index.ts`.
- UI constants live in `client/src/constants/index.ts`.

## Verification

- Add focused tests for server behavior when changing services or route contracts.
- Run `npm run test` before reporting server behavior as working.
- Run `npm run build` before reporting the full project as buildable.
