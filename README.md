# SICK TRIVIA — Web Edition

This is the original SICK TRIVIA React game converted to a normal website architecture.

## What changed
- `window.storage` was replaced with a backend API so different phones share the same room.
- The Anthropic API call now runs on the server, so the API key is not exposed to players.
- The original game logic and UI remain in `src/App.tsx`.

## Run locally
1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add `ANTHROPIC_API_KEY` if AI features are wanted.
4. Run `npm run dev` for development, or `npm run build && npm start` for production.

## Deploy
Deploy this whole folder as one Node/Express service. It serves both the website and the shared room API. Use one running instance because the room store is in memory.

Set these environment variables on the host:
- `ANTHROPIC_API_KEY` — optional; without it, the built-in question bank still works, while AI question generation falls back when unavailable.
- `ANTHROPIC_MODEL` — optional.

For a persistent production database later, the `/api/kv` layer can be replaced with Redis/Supabase without changing the game logic.
