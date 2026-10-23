# Monotree dashboard starter

A template for your own dashboard over your Monotree data. You host it on Cloudflare, under your own account, and employees open it from a link in the Monotree app, already signed in.

- **Signed in with Monotree.** Only employees who pass your access rule can see it, for example admins, managers or one department. People who leave the company lose access the day they leave.
- **Your API key stays on the server.** The page only receives the numbers it shows.
- **Built to be changed by an AI coding agent.** Point Claude Code, Cursor or similar at this folder and describe the dashboard you want. [AGENTS.md](AGENTS.md) tells the agent what it may change and the rules it must keep.

The example shows how many employees use Monotree, weekly activity, adoption by department, and this week's activity against last week's.

## What you need

- A Cloudflare account. The free plan is enough.
- An admin in your Monotree CMS, to create an API key.
- Monotree's help to register the dashboard for sign-in (step 2).
- Node.js 20 or newer, if you deploy from your own machine.

## Set it up

### 1. Deploy it

From your machine:

```
npm install
npx wrangler deploy
```

Wrangler prints the dashboard's address, for example `https://monotree-dashboard.<your-account>.workers.dev`. A custom domain such as `dashboard.example.com` works too: add it in the Cloudflare dashboard. Decide on the address now, because sign-in is registered for exactly that address. With a custom domain, turn off the `workers.dev` address in Cloudflare (or set `"workers_dev": false` in `wrangler.jsonc`), since sign-in fails there. Until step 4, the dashboard shows an error.

### 2. Ask Monotree to register it

Send your Monotree contact:

| | Value |
|---|---|
| Client type | confidential |
| Name | e.g. "Engagement dashboard" |
| Redirect URI | `https://<your address>/auth/callback` |
| Login initiation URI | `https://<your address>/auth/initiate` |
| Target link prefix | `https://<your address>/` |

You get back a `client_id` and a `client_secret`.

### 3. Create an API key

In the Monotree CMS, go to **Open API → API Tokens** and create a token with only the scopes the dashboard needs. The example needs `read:stats` only. The token is shown once.

### 4. Configure

In `wrangler.jsonc`, set:

- `MONOTREE_ISSUER`: your Monotree address, e.g. `https://acme.monotree.com`
- `OIDC_CLIENT_ID`: from step 2
- `ACCESS`: who may open the dashboard. It starts as `admins`. Options: `anyone`, `admins`, `editors`, `managers`, `group:<id>`, `manager:<id>`, comma-separated. Group ids are in the CMS address bar when you open a group.

Then store the secrets with Cloudflare and deploy again:

```
npx wrangler secret put OIDC_CLIENT_SECRET     # from step 2
npx wrangler secret put MONOTREE_API_KEY       # from step 3
npx wrangler secret put SESSION_SECRET         # any long random string: openssl rand -base64 32
npx wrangler deploy
```

### 5. Add it to the Monotree app

In the CMS, add a menu link of type **External app** with the URL `https://<your address>/`. Employees who tap it land on the dashboard, signed in. Target the link at the same groups as your `ACCESS` rule, so people don't see a link they can't open.

## Change the dashboard

- **The data** is defined in `src/data.ts`. Each entry is one call to the [Monotree Open API](https://docs.monotree.com/open-api/), shaped down to what the page shows.
- **The page** is `public/`: plain HTML, CSS and JavaScript, with [Chart.js](https://www.chartjs.org/) for charts.

With an AI coding agent, describe what you want, e.g. *"add a chart of onboarding completion per month"*. The agent reads [AGENTS.md](AGENTS.md) first.

Things to know:

- **Everyone who can open the dashboard sees the same data.**
- **Access is checked at sign-in.** A sign-in lasts up to 8 hours. Opening the dashboard from the Monotree app signs in again silently.
- **Your Cloudflare account holds a copy of Monotree data.** You choose the host and you're responsible for that copy, so check it fits your data-protection agreements.

## Snapshot mode

If you can't register the dashboard for sign-in, `scripts/snapshot.ts` can publish a static copy with the data baked in, at a hard-to-guess link. **Anyone with the link can see it, including people who have left.** Read "Snapshot mode" in [AGENTS.md](AGENTS.md) before you use it, and keep it to company-wide numbers.

## Help

- Open API reference: <https://docs.monotree.com/open-api/> (plain text for AI agents: <https://docs.monotree.com/llms.txt>)
- Sign in with Monotree: <https://docs.monotree.com/sign-in-with-monotree/>
