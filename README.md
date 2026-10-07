# Game API Mail

Frontend for **Game API Mail**, the webmail experience for `game-api.online`.

## Frontend-only architecture

This repository contains only the browser application.

- `frontend/index.html` — public animated landing page
- `frontend/app.html` — authenticated mail workspace
- `frontend/css/` — application and landing-page styles
- `frontend/js/` — Supabase client and frontend logic
- `frontend/sw.js` — service worker / notification foundation
- `frontend/manifest.json` — PWA manifest

The mail backend is intentionally kept separate and will be deployed as its own Render Web Service.

## Render deployment

Create a **Static Site** for this repository and set the publish directory to:

`frontend`

There is no Node.js build step for this repository.

## Security

Only the Supabase publishable key belongs in the frontend. Never place the Supabase service-role key, Hostinger SMTP/IMAP password, VAPID private key, or other server credentials in this repository.

## Planned domains

- Frontend: `mail.game-api.online`
- Backend API: `api.game-api.online`