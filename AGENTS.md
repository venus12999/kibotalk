<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# KiboTalk — project brief for coding agents

Setup for Kimi CLI (and other CLI agents): see `docs/kimi-code.md`.

## Stack
- TanStack Start v1 (React 19, Vite 8) — file routes in `src/routes`, never edit `src/routeTree.gen.ts`.
- Tailwind v4 via `src/styles.css` (no `tailwind.config.js`). All colors/shadows are semantic tokens; never hardcode `text-white`, `bg-[#...]`, etc.
- Backend: Supabase (auth, Postgres with RLS, storage). Client: `@/integrations/supabase/client`. Files under `src/integrations/supabase/*` are generated — do not edit.
- AI: DeepSeek V4 Flash for coaching/suggestions, Volcengine WebSocket ASR for speech-to-text.
- Package manager: **bun**. Dev server: `bun run dev` on port 8080.

## Layout
- `src/routes/api/suggest.ts` — SSE streaming endpoint for reply suggestions.
- `src/routes/api/transcribe.ts` — ASR proxy.
- `src/lib/kibo/*` — domain logic. `*.server.ts` is server-only; `*.functions.ts` holds `createServerFn` RPC and must stay a thin wrapper (no runtime helpers at module scope).
- `src/components/kibo/*` — app UI (workbench, suggestion stage, settings, guide).
- `src/lib/mcp/*` — this app's MCP server and tools, exposed at `/mcp`.

## Rules
- Server secrets are read with `process.env[...]` **inside** handlers only. Never prefix a secret with `VITE_`.
- Every new `public` table needs `GRANT`s + RLS policies in the same migration. Roles live in `user_roles`, never on a profile table.
- Mobile matters: every UI change must be checked at narrow widths and with safe-area insets. Panel heights are fixed on purpose (`dvh` units) so the layout doesn't jump mid-conversation.
- Suggestions must always render exactly three slots.

## Checks before pushing
```bash
bun run lint && bunx tsc --noEmit && bunx vitest run && bun run build
```
