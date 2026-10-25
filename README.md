# acrv3 Cloudflare Worker

Deploy this repository using Cloudflare Workers → GitHub import. Use `npx wrangler deploy` as the deploy command. The Worker entry point is **root `index.js`** (no `src/` folder).

Add `JELLYCADE_TOKEN` under Worker → Settings → Variables and Secrets as a **Secret**.

- Automatic runs: Cloudflare cron triggers every minute, and runs `refresh()` then `acr()` only when the Unix minute is divisible by 31.
- Manual runs: Open `https://YOUR-WORKER.workers.dev/run` to run the job immediately and view sanitized `refresh()`, `acr()`, and error output on the page.
- Both scheduled and manual execution results are logged using `console.log`. Observability is enabled in `wrangler.toml`.

**Security:** `/run` requires no query token, so it is public unless protected by Cloudflare Access. Restrict access to the Worker before enabling its public URL. Returned session-related fields and the configured token are redacted, but review any non-session API data before exposing this publicly.
