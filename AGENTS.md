# Guide for coding agents

This repository is a dashboard over a company's Monotree data. It runs as a Cloudflare Worker, and employees open it from the Monotree app, already signed in. Read this whole file before you change anything. The rules under "Rules" are not style preferences: breaking one leaks employee data.

## How it works

```
Monotree app ──tap──▶ /auth/initiate ──▶ Monotree sign-in ──▶ /auth/callback ──▶ the page (public/)
                                                                                        │
                                                                         fetch /data/<name>
                                                                                        ▼
                                                          Worker: src/data.ts ──Open API key──▶ Monotree
```

- **Sign-in** is "Sign in with Monotree" (OpenID Connect). An employee who opens the dashboard from the Monotree app arrives signed in, with no prompt. Anyone else is sent to the Monotree login page.
- **Who may see it** is the `ACCESS` setting in `wrangler.jsonc`, checked once at sign-in against the employee's roles and groups. See `src/access.ts`.
- **The data** comes from the [Monotree Open API](https://docs.monotree.com/open-api/) with a key that stays on the server. The browser only ever sees what `src/data.ts` returns.
- **Every viewer sees the same data.** There is no per-viewer data yet, such as a manager seeing only their own department. Don't try to build it by sending group ids from the browser.

## Files

| File | Change it? | What it is |
|---|---|---|
| `src/data.ts` | **Yes** | The datasets: which API calls are made and what is returned |
| `public/index.html`, `public/app.js`, `public/style.css` | **Yes** | The page. `load("<name>")` in `app.js` fetches a dataset |
| `wrangler.jsonc` | Settings only | Issuer, client id, `ACCESS` |
| `src/access.ts` | Rarely | The `ACCESS` words. Add a word here if you need a new kind of rule |
| `src/worker.ts`, `src/oidc.ts`, `src/session.ts`, `src/monotree.ts` | **No**, unless asked | Sign-in, sessions, security headers, the API client |
| `scripts/snapshot.ts`, `wrangler.snapshot.jsonc` | No | Snapshot mode, see below |

## Rules

1. **Never put a secret in the browser.** The API key, client secret and session secret live only in Worker secrets (`wrangler secret put`) or `.dev.vars`. Nothing under `public/` may contain them. Never commit `.dev.vars`.
2. **Never forward requests to the API.** Don't add a route that takes a path, endpoint, filter or group id from the browser and passes it to Monotree. Every signed-in viewer would then hold the full power of the key. Add a named dataset to `src/data.ts` instead, with its parameters fixed in code.
3. **Return the least data the page needs.** Shape each dataset in `load()`: counts, rates and totals, not raw rows. Never return names, emails, birth dates or anything else about individual employees unless the user explicitly asks, and `ACCESS` is narrowed to people allowed to see it (for example admins).
4. **Use a key with the fewest scopes.** Note the scope each dataset needs in a comment next to it, and tell the user the full list. The example needs only `read:stats`. A key with `read:users` can read every employee's profile, so ask before you depend on it.
5. **Mind the rate limit.** The API allows 60 requests a minute per key. Set `cacheSeconds` to 300 or more, and match the endpoint's own cache where its docs give one (the `/stats` endpoints cache for an hour). Avoid `api.all()` over large lists on every load.
6. **Keep the security headers.** If the page needs a script or style from another host, add that one host to `content-security-policy` in `src/worker.ts`. Don't remove the policy or add `*`. Load libraries from a pinned version with an `integrity` hash, as `index.html` does with Chart.js. Every CDN request also tells that CDN the viewer's IP address.
7. **Don't touch sign-in.** In particular, never add `prompt=login` (it breaks opening from the app), never log `login_hint`, and never weaken the checks in `src/oidc.ts`.
8. **`ACCESS` is the customer's decision.** It ships as `admins`. Don't widen it unless the user asks for it in so many words.

## Adding a chart

1. Find the endpoint in the API reference: <https://docs.monotree.com/llms.txt> is the whole reference as plain text. Useful for dashboards: `/stats/users`, `/stats/engagement`, `/stats/adoption`, `/stats/content` (`read:stats`), `/stats/academy/*` (`read:stats`), surveys and their answers (`read:surveys`), forms and responses (`read:forms`, `read:formresponses`).
2. Add a dataset to `src/data.ts` that calls it and returns only what the chart shows.
3. In `public/app.js`, `await load("<name>")` and draw it. Chart.js 4 is already on the page.
4. Tell the user which scope the key now needs.

## Running it locally

`npm run dev` serves the dashboard at `http://localhost:8787`. Sign-in needs a client registered for that address, so ask Monotree for a test client with these addresses (plain `http` is allowed on localhost):

- redirect URI `http://localhost:8787/auth/callback`
- login initiation URI `http://localhost:8787/auth/initiate`
- target link prefix `http://localhost:8787/`

Put the settings in `.dev.vars` (copy `.dev.vars.example`). Values there override `wrangler.jsonc`, so you can also set `MONOTREE_ISSUER`, `OIDC_CLIENT_ID` and `ACCESS` there.

`npm test` runs the unit tests (they need [Bun](https://bun.sh)) and `npm run check` the type check. Run both before you deploy.

## Snapshot mode (no sign-in)

`scripts/snapshot.ts` bakes the data into a static copy of the page, served from a long random path, with no sign-in at all. Some customers choose this because it needs no client registration. **Anyone who has the link sees the data.** Before you set it up, tell the user, in plain words:

- The link leaks in ways people don't expect: link previews in Slack and Teams, browser history and sync, forwarded messages, screenshots, shared screens.
- **People who leave the company keep the link.** The signed-in dashboard locks them out on the day they leave; a snapshot never does. This can't be fixed afterwards, only by rotating the link.
- So: **company-wide numbers only**, never anything about named people. If in doubt, use the signed-in dashboard.

What the snapshot does to limit the damage: `noindex` and `robots.txt` to keep it out of search engines, `Referrer-Policy: no-referrer` so the link isn't passed on to other sites, and a new random path on every run. Running the script again and deploying rotates the link.

```
bun scripts/snapshot.ts            # or: node scripts/snapshot.ts (Node 23.6+)
npx wrangler deploy --config wrangler.snapshot.jsonc
```

For data that changes, run both commands on a schedule (for example a GitHub Actions cron job). Each run prints the new link, which then has to be updated wherever it was shared, for example in the Monotree menu link.
