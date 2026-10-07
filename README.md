# Game API Mail

Frontend-only webmail interface for `game-api.online`.

## Structure

- `index.html` — public animated landing page
- `app.html` — mail workspace
- `css/` — landing and app styles
- `js/` — Supabase client and frontend logic
- `manifest.json` — PWA manifest
- `sw.js` — service worker foundation

## Render Static Site

Deploy this repository as a **Render Static Site**.

Use the repository root as the publish directory. Do not use `/frontend`.

The Render deployment URL will open the landing page directly:

`https://your-render-site.onrender.com/`

That URL serves `index.html` automatically. There is no `/frontend/index.html` in the deployment path.

## Separate backend

The mail backend remains a separate Render Web Service. The frontend will call the backend through `API_BASE_URL` after the backend domain is ready.

Planned domains:

- Webmail: `mail.game-api.online`
- API: `api.game-api.online`

## Security

Only the Supabase publishable key belongs in the browser. Never put the Supabase service-role key, Hostinger SMTP/IMAP password, VAPID private key, or other server credentials in this repository.