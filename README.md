# Signal Bloom (Starter Workspace)

Original social-community concept app built with Next.js App Router, React, Tailwind CSS, and TypeScript.

This project intentionally uses fictional names, content, and data.

## Stack

- Next.js (App Router)
- React
- Tailwind CSS
- TypeScript
- @xyflow/react (relationship map)
- next-themes (dark mode)

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Useful Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Workspace Setup (VS Code)

This repo includes:

- `.vscode/extensions.json` for recommended extensions
- `.vscode/settings.json` for format/lint defaults
- `.vscode/tasks.json` for dev, lint, typecheck, build tasks
- `.vscode/launch.json` for debugging Next.js

## Project Structure

```text
src/
	app/
		page.tsx
		feed/page.tsx
		members/page.tsx
		map/page.tsx
		articles/page.tsx
		events/page.tsx
		inbox/page.tsx
	components/
		cards/
		layout/
		map/
		members/
		theme/
		ui/
	data/
		users.json
		posts.json
		events.json
		articles.json
		relationships.json
	lib/
		data.ts
	types/
		models.ts
```

## Customization Notes

- Update hero/site identity in `src/app/page.tsx` and `src/components/layout/site-nav.tsx`.
- Replace JSON seed data in `src/data/` when connecting to an API or CMS.
- Relationship filters and edge styles live in `src/components/map/relationship-map.tsx`.
