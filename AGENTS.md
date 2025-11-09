# Repository Guidelines

## Project Structure & Module Organization
Astro-driven pages live under `src/pages`, while shared layouts and React components sit in `src/layouts` and `src/components`. Persistent data such as episode metadata is kept in `src/data`, and cross-cutting utilities (date helpers, parsers) live in `src/utils`. Visual state (e.g., theme toggles) is centralized in `src/store`. Publicly served assets, fonts, and generated JSON end up in `public/` and `fonts/`. Automation scripts reside in `scripts/`: `fetch-episodes.js` refreshes RSS data, and `generate-og.jsx` keeps OGP images current. Tailwind and Astro configs (`tailwind.config.mjs`, `astro.config.mjs`) define the design system and integration boundaries.

## Build, Test, and Development Commands
- `bun install` installs dependencies using the locked versions in `bun.lock` / `pnpm-lock.yaml`.
- `bun dev` (alias `bun start`) runs `astro dev` with hot reload at `http://localhost:4321`.
- `bun build` produces the static site in `dist/` and should succeed before every PR.
- `bun preview` serves the latest build for smoke-testing production bundles.
- `bun scripts/fetch-episodes.js` updates `src/data/episodes.json`; run it before committing content changes.
- `bun scripts/generate-og.jsx --latest 5 --force` regenerates OGP assets; adjust flags based on scope.

## Coding Style & Naming Conventions
Biome (`biome.json`) enforces tab indentation, double quotes for JavaScript/TypeScript, and auto-organized imports—run `bun x biome check .` prior to pushing. Keep Astro/React components in PascalCase (e.g., `EpisodeCard.tsx`), hooks or stores in camelCase, and data files in kebab-case JSON (`episode-list.json`). Favor TypeScript (`.ts/.tsx`) and colocate component styles in `src/styles` or Tailwind layers. Document non-obvious logic with concise comments; avoid duplicating what the code already states.

## Testing Guidelines
No automated test suite ships yet; when adding one, prefer Astro component tests with `happy-dom` and colocate specs as `ComponentName.spec.ts` beside the source or in `src/tests`. Snapshot OGP output if you touch `generate-og.jsx`. At minimum, run `bun x biome lint .` and `bun preview` to catch regressions. Aim for meaningful coverage on data parsers and RSS fetching, since they guard deployment automation.

## Commit & Pull Request Guidelines
Existing commits are short, imperative statements (e.g., “Update content”); keep that tone while describing the scope (“Add episode timeline”). Reference issues in the body (`Refs #123`) and avoid bundling unrelated work. Every PR should include a summary of changes, screenshots for UI updates, and instructions for verifying scripts (`bun scripts/fetch-episodes.js`). Confirm that `bun build` succeeds and that generated assets or data files are included in the diff before requesting review.
