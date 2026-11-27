# Setting up a new dashboard: steps for the AI assistant

Follow this when someone asks you to set up a Monotree dashboard from this template. Assume they are **not a developer**: they may not know what a terminal, a repository or a deploy is. Read [AGENTS.md](AGENTS.md) too: its rules apply to everything you build.

How to work with them:

- Explain each step in one plain sentence before you do it. Ask one thing at a time.
- Do the technical work yourself: downloading, installing, editing files, deploying.
- **Never ask them to paste a secret into the chat.** The client secret and the API key go straight into Cloudflare, by their own hand (step 7). The client id and the Monotree address are not secret.
- Some steps happen outside your reach: the Monotree CMS, the Cloudflare website. For those, give exact click paths, then wait until they say they're done.
- Steps 5, 6 and 9 need a **Monotree admin**. Ask early whether they are one; if not, they'll need one at hand for those steps.

## 1. Get the template onto their computer

- Check that Node.js 20 or newer is installed (`node --version`). If it isn't, ask them to install the LTS version from <https://nodejs.org> and to tell you when it's done.
- Download this repository into a new folder with a name that says what it is, e.g. `acme-dashboard`. Use `git clone https://github.com/monotreedk/dashboard-starter.git acme-dashboard`, or download and unpack <https://github.com/monotreedk/dashboard-starter/archive/refs/heads/main.zip> if git is missing.
- Run `npm install` in the folder.
- Tell them where the folder is. Future changes are made from it, so they should keep it.

## 2. Ask what they want

- **Their Monotree address**, e.g. `acme.monotree.com`. The issuer is `https://` plus that address, with no trailing slash.
- **What the dashboard should show.** If they're unsure, offer the example (Team pulse: a manager's departments next to the whole company) and change it later.
- **Who should see it.** Map the answer to `ACCESS` (see `src/access.ts`): everyone, admins, editors, managers, members of a group, or managers of a group. For a group, they can find its id in the Monotree CMS: open the group, and the id is the number in the address bar (`/groups/12`).

## 3. Sign in to Cloudflare

Run `npx wrangler login`. A browser window opens, where they sign in to Cloudflare or create a free account. Wait until the command reports success.

## 4. First deploy

1. In `wrangler.jsonc`, set `name` to something that says what it is, e.g. `acme-dashboard` (lowercase letters, digits and dashes). The name becomes part of the address.
2. Run `npx wrangler deploy`.
   - The first time on an account, it asks for a `workers.dev` subdomain. Suggest their company name.
   - Note the address it prints, e.g. `https://acme-dashboard.acme.workers.dev`.
   - The dashboard shows an error until step 8. Tell them that's expected.
3. Set the session secret yourself. It never needs to be seen:
   ```
   node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put SESSION_SECRET
   ```

## 5. Register the dashboard for Sign in with Monotree

A Monotree admin registers it in the Monotree CMS: **Integrations → Sign in with Monotree → Register website**. Tell them:

- **Name:** something employees will recognise; they see it when they sign in.
- **Address:** the address from step 4, without a path, e.g. `https://acme-dashboard.acme.workers.dev`. The sign-in addresses are derived from it.
- The dialog then shows the **client id**, which they can give you, and the **client secret**, which goes to Cloudflare in step 7. The secret is shown only once, so they should keep the dialog open until step 7.

If you are connected to their Monotree as an admin through the Monotree MCP server, you can call `register_sign_in_client` with the name and address instead. It returns the client id and a link to the CMS, but never the secret: send them the link, where they press **New secret** and keep the page open for step 7.

If the CMS doesn't have **Integrations → Sign in with Monotree** yet, write an email to their Monotree contact instead, asking them to register a confidential client with:

> - Name: `<a name employees will recognise>`
> - Redirect URI: `https://<address>/auth/callback`
> - Login initiation URI: `https://<address>/auth/initiate`
> - Target link prefix: `https://<address>/`

Monotree replies with the client id and the client secret. Carry on with step 6 while they wait.

## 6. Create an API key in Monotree

A Monotree admin creates it in the Monotree CMS: **Integrations → API Tokens → Create Token**. Tell them:

- which scopes to tick: only those `src/data.ts` needs, which is `read:stats` and `read:groups` for the example
- to name it after the dashboard
- that the key is shown only once, so they should keep the page open for step 7

Through the Monotree MCP server, `create_api_token` with the name and those scopes does the same. It never returns the key: send them the link it returns, where they press **New key** on the token.

## 7. They put the two secrets into Cloudflare

Guide them in the Cloudflare website:

1. **Workers & Pages** → their dashboard's Worker → **Settings** → **Variables and Secrets** → **Add**.
2. Type **Secret**, name `MONOTREE_API_KEY`, value: the API key from step 6.
3. Again: type **Secret**, name `OIDC_CLIENT_SECRET`, value: the client secret from step 5.

Secrets added there are kept by later deploys.

## 8. Configure and deploy

1. In `wrangler.jsonc`, set:
   - `MONOTREE_ISSUER`
   - `OIDC_CLIENT_ID`
   - `ACCESS`
2. Run `npx wrangler deploy`.
3. Check the result yourself:
   - Fetching the address should redirect to `/auth/login`.
   - `/auth/login` should redirect to their Monotree's `/oauth/authorize`.
   - If it shows an error page instead, read it. A 404 from Monotree's discovery document means the client isn't registered yet.

Settings live in `wrangler.jsonc`. Tell them not to change variables on the Cloudflare website: the next deploy puts back what the file says.

## 9. Put it in the Monotree app

A Monotree admin adds a menu link in the CMS:

- type **External app**
- URL `https://<address>/`
- targeted at the same people as `ACCESS`, so nobody sees a link they can't open

Through the Monotree MCP server, `create_app_link` with the title, the address and the group ids makes it as a draft; the admin publishes it from the link it returns.

Ask them to tap it in the Monotree app. They should land on the dashboard without logging in.

## 10. Make it theirs

Now build what they asked for in step 2, following AGENTS.md. Deploy with `npx wrangler deploy`, and ask them to look after each change. If a new dataset needs another API scope, tell them: they'll have to create a new key with that scope, and replace the secret in Cloudflare (step 7).
