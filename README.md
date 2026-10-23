# Monotree dashboard starter

A template for your own dashboard over your Monotree data. You host it on Cloudflare, under your own account, and employees open it from a link in the Monotree app, already signed in.

- **Signed in with Monotree.** Only employees who pass your access rule can see it, for example admins, managers or one department. People who leave the company lose access the day they leave.
- **Your API key stays on the server.** The page only receives the numbers it shows.
- **Built to be changed by an AI coding agent.** Point Claude Code, Cursor or similar at this folder and describe the dashboard you want. [AGENTS.md](AGENTS.md) tells the agent what it may change and the rules it must keep.

The example, "Team pulse", shows a manager how the departments they manage are doing next to the whole company: course completion per course, and the share of people active each week. Others see the whole company. It also shows what Sign in with Monotree tells the dashboard about the viewer.

## Get started

You don't need to be a developer. You need:

- **An AI assistant that can work on your computer**, such as [Claude Code](https://claude.com/claude-code), Cursor or Codex. A chat window alone can't download and deploy things.
- **A Cloudflare account.** The free plan is enough, and the assistant helps you create one.
- **A Monotree admin**, to create an API key and add the dashboard to the app.
- **About half an hour**, plus a reply from Monotree, which registers the dashboard for sign-in.

Paste this into your assistant:

```
Set up a Monotree dashboard for me from https://github.com/monotreedk/dashboard-starter.
Follow its SETUP.md.
```

It downloads the template, asks what you want to see and who should see it, writes the email to send to Monotree, and does the rest. It never needs your passwords or keys: you type those into Cloudflare yourself.

Developers can follow [SETUP.md](SETUP.md) by hand. The commands are the same.

## Change the dashboard

- **The data** is defined in `src/data.ts`. Each entry is one call to the [Monotree Open API](https://docs.monotree.com/open-api/), shaped down to what the page shows.
- **The page** is `public/`: plain HTML, CSS and JavaScript, with [Chart.js](https://www.chartjs.org/) for charts.

With an AI coding agent, describe what you want, e.g. *"add a chart of onboarding completion per month"*. The agent reads [AGENTS.md](AGENTS.md) first.

Things to know:

- **Data can depend on who is looking.** The example shows each manager their own departments. See `src/data.ts`.
- **Access is checked at sign-in.** A sign-in lasts up to 8 hours. Opening the dashboard from the Monotree app signs in again silently.
- **Your Cloudflare account holds a copy of Monotree data.** You choose the host and you're responsible for that copy, so check it fits your data-protection agreements.

## Snapshot mode

If you can't register the dashboard for sign-in, `scripts/snapshot.ts` can publish a static copy with the data baked in, at a hard-to-guess link. **Anyone with the link can see it, including people who have left.** Read "Snapshot mode" in [AGENTS.md](AGENTS.md) before you use it, and keep it to company-wide numbers.

## Help

- Open API reference: <https://docs.monotree.com/open-api/> (plain text for AI agents: <https://docs.monotree.com/llms.txt>)
- Sign in with Monotree: <https://docs.monotree.com/sign-in-with-monotree/>
