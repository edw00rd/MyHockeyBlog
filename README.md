# MyHockeyBlog

A free Cloudflare Workers starter app for a public-facing hockey progress blog.

## What this first version includes

- Static frontend served by Cloudflare Workers Static Assets
- Tiny Worker API shell at `/api/health` and `/api/version`
- Local browser storage for prototype posts, events, and demo profile data
- MVP UI for public/private posts, comments toggle, video view counters, calendar events, and basic game stats

## Deploy on Cloudflare

Use these settings in the Cloudflare Workers / Pages Git setup screen:

| Field | Value |
| --- | --- |
| Build command | Leave blank |
| Deploy command | `npx wrangler deploy` |

Upload these files to the root of your GitHub repo, then deploy.

## Local development

```bash
npm install
npm run dev
```

Then open the local URL that Wrangler prints in your terminal.
