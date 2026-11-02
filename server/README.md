# NoamBrowser Accounts server

A tiny server for NoamBrowser accounts, made for **Cloudflare Workers** (free plan). It stores only data that was
encrypted on people's own computers, so it can't read anyone's bookmarks, passwords or chats. It also holds NoamChat
messages for friends who are offline, until they collect them.

Free plan limits (as of 2026): 100,000 requests a day and a 5 GB database, which is plenty for thousands of users.

## Set it up (about 10 minutes, no coding)

1. Make a free account at **https://dash.cloudflare.com/sign-up**.
2. **Create the database:** in the left menu choose **Storage & Databases → D1 SQL Database → Create**. Name it
   `noambrowser-accounts` and press **Create**. (The server makes its own tables the first time it runs.)
3. **Create the Worker:** in the left menu choose **Compute (Workers) → Workers & Pages → Create → Create Worker**
   (start from "Hello World"). Name it `noambrowser-accounts` and press **Deploy**.
4. Press **Edit code**, delete everything in `worker.js`, paste in the whole of **`account-worker.js`** from this
   folder, and press **Deploy**.
5. **Connect the database:** go back to the Worker, open **Settings → Bindings → Add → D1 database**.
   Variable name: **`DB`** (capital letters). Database: `noambrowser-accounts`. Press **Save**.
6. Open `https://noambrowser-accounts.<your-subdomain>.workers.dev/v1` in a browser. You should see
   `{"service":"NoamBrowser Accounts","version":1}`.
7. Put that address (without `/v1`) into `src/account-config.js` so every copy of NoamBrowser uses it, or type it on
   NoamBrowser's **⋮ → Account** page.

## With the command line instead (optional)

```
npm install -g wrangler
wrangler d1 create noambrowser-accounts      # copy the database_id it prints into wrangler.toml
wrangler deploy
```
