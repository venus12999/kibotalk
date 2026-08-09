# Using Kimi Code (Kimi CLI) on KiboTalk

This project is ready for the Moonshot **Kimi CLI** coding agent. Everything the
agent needs to understand the codebase lives in `AGENTS.md` (Kimi CLI reads it
automatically from the repo root).

## 1. Install

```bash
# macOS / Linux
curl -fsSL https://cli.kimi.com/install.sh | bash
# or, if you prefer a package manager
uv tool install --python 3.13 kimi-cli
```

## 2. Authenticate

Get an API key from https://platform.moonshot.ai (or https://platform.moonshot.cn
for the China endpoint), then:

```bash
export MOONSHOT_API_KEY="sk-..."      # add to ~/.zshrc / ~/.bashrc
# China endpoint users also set:
# export MOONSHOT_BASE_URL="https://api.moonshot.cn/v1"
```

Or run `kimi` once and complete the interactive login.

## 3. Clone and run it against this repo

The Lovable project is connected to GitHub — work on the connected branch and
push; commits sync back into the Lovable editor.

```bash
git clone <your-repo-url> kibotalk && cd kibotalk
bun install
cp .env.example .env       # then fill in the values (see below)
kimi                       # starts the agent in this directory
```

Useful commands inside the session:

- `/init` — let Kimi index the project
- `/mcp` — list MCP servers loaded from `.kimi/mcp.json`
- `kimi --print "fix the mobile dock spacing"` — one-shot, non-interactive

## 4. Environment variables

Local dev needs the values Lovable injects in the cloud. Copy them from the
Lovable project settings into `.env`:

| Variable                        | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `VITE_SUPABASE_URL`             | Backend URL (public)                 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Backend publishable key (public)     |
| `VITE_SUPABASE_PROJECT_ID`      | Backend project ref (public)         |
| `DEEPSEEK_API_KEY`              | Server-side AI calls (secret)        |
| `VOLC_*`                        | Volcengine ASR credentials (secret)  |

Never commit `.env`, and never paste secret values into a chat with any agent.

## 5. KiboTalk's own MCP server

The app publishes an MCP server at `/mcp` (tools: `list_sessions`,
`get_session`, `delete_session`, `search_emotions`). `.kimi/mcp.json` wires it
up so Kimi can read your saved conversation data while it works. It uses OAuth —
Kimi opens a browser window for sign-in and consent the first time.

To point it at local dev instead of production, change the URL in
`.kimi/mcp.json` to `http://localhost:8080/mcp`.

## 6. Verify before pushing

```bash
bun run lint
bunx tsgo --noEmit      # or: bunx tsc --noEmit
bunx vitest run
bun run build
```
