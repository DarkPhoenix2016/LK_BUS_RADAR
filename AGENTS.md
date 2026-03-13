# Repository Guidelines

## Project Structure & Module Organization
This workspace contains three active code areas:
- `project/`: Next.js 16 + TypeScript frontend/API app (`app/`, `components/`, `lib/`, `hooks/`, `public/`, `styles/`).
- `project/server/`: standalone Node/Express sync server (`server.js`, `services/`, `utils/`, `Resources/`).
- `firebase/functions/`: Firebase Cloud Functions entrypoint and sync jobs (`index.js`, `sync/`, `utils/`, `Resources/`).

Reference data and exports live in `Resources/` and `Temp/`. Avoid committing generated output from `.next/` or `node_modules/`.

## Build, Test, and Development Commands
Run commands from the relevant folder:
- `cd project && npm run dev`: start Next.js local dev server.
- `cd project && npm run build && npm run start`: production build and serve.
- `cd project && npm run lint`: lint the Next.js app.
- `cd project/server && npm run dev`: run the sync server (same as `npm start`).
- `cd firebase/functions && npm run serve`: run Firebase Functions emulator.
- `cd firebase/functions && npm run lint`: lint Cloud Functions before deploy.
- `cd firebase/functions && npm run deploy`: deploy functions only.

## Coding Style & Naming Conventions
- TypeScript/React files use 2-space indentation, single quotes, and mostly no semicolons.
- Keep route files in Next App Router format: `app/<segment>/page.tsx` and `app/api/**/route.ts`.
- Use `PascalCase` for React components, `camelCase` for functions/variables, and descriptive file names (`syncLiveLocations.js`, `route-details.tsx`).
- Use the existing alias `@/*` from `project/tsconfig.json` for internal imports.

## Testing Guidelines
There is currently no dedicated test script in `project/` or `project/server/`. Treat linting as the minimum gate and perform targeted manual checks for UI pages and API endpoints. If you add tests, colocate them as `*.test.ts`/`*.test.tsx` near the feature and document the run command in `package.json`.

## Commit & Pull Request Guidelines
Git history is not included in this snapshot, so follow a consistent convention:
- Commit format: `<type>: <short summary>` (example: `feat: add public timetable route cache`).
- Keep commits focused and include config/schema changes with related code.
- PRs should include: purpose, scope, test/lint evidence, environment variable changes, and screenshots for UI updates.

## Security & Configuration Tips
- Never commit `.env` secrets or service account JSON keys.
- Validate Firebase/DB credentials locally before deploy.
- For new endpoints, document required env vars in the relevant README or this guide.