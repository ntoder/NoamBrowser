# NoamBrowser

A private, fast web browser for Windows, macOS and Linux.

- **Shields** — blocks ads, trackers, malware sites, cookie banners and YouTube ads; upgrades to HTTPS; blocks cross-site cookies and fingerprinting; strips tracking tags from links.
- **Built-in VPN** — free Cloudflare WARP (WireGuard) with a kill switch, or your own SOCKS5/HTTP proxy.
- **Private by design** — no telemetry, no account, no AI services, encrypted DNS.
- **Password manager** — encrypted on your computer, autofill, CSV import/export, and leaked/reused/weak password alerts (Have I Been Pwned, k-anonymity).
- **Reader view**, **on-device translation**, **picture-in-picture**, **per-site dark mode**.
- **Vertical tabs**, **tab groups**, **split view**, **command palette** (Ctrl+K).
- **Workspaces** (Ctrl+Alt+1–9), **saved sessions**, **reading list**, **notes for each site**.
- **Sidebar** with web panels (WhatsApp, ChatGPT or any site) and a calculator.
- **Address-bar calculator & converter** — `5*12`, `10 km in miles`, `100 usd in ils`.
- **Media controls** for every tab, video speed keys (`[` `]` `\`), volume boost up to 300%.
- **Screenshots** — area, visible or full page, then annotate with arrows, boxes, pen, highlighter, text, blur and crop (Ctrl+Shift+X).
- **Mouse gestures**, **download pause/resume**, **speed limit** and **auto-sorting into folders**.
- **New tab widgets** — clock with Hebrew date, weather, zmanim with candle lighting and parasha, synced to-do list.
- **Sync** through your own cloud-drive folder (OneDrive, Google Drive, Dropbox, iCloud found automatically), encrypted with your passphrase — no server. Syncs bookmarks, settings, reading list, notes, to-dos, sessions and optionally passwords.
- **Themes** — 9 presets (including Daylight, which changes with the time of day), Liquid Glass, custom accents, wallpapers, animations.
- **Automatic updates** from this repository's Releases.

## Download

Get the latest version from **[Releases](https://github.com/ntoder/NoamBrowser/releases/latest)**:

| System | File |
| --- | --- |
| Windows | `NoamBrowser-Setup-x.y.z.exe` (installer, auto-updates) or `NoamBrowser.exe` (portable) |
| macOS (Apple Silicon) | `NoamBrowser-x.y.z-arm64-mac.zip` |
| macOS (Intel) | `NoamBrowser-x.y.z-x64-mac.zip` |
| Ubuntu / Debian | `noambrowser_x.y.z_amd64.deb` |
| Other Linux | `NoamBrowser-x.y.z-x86_64.AppImage` |

The app isn't signed with paid certificates yet, so Windows SmartScreen and macOS Gatekeeper warn on first launch. On Windows choose **More info → Run anyway**. On macOS run `xattr -cr /Applications/NoamBrowser.app` once, or use **System Settings → Privacy & Security → Open Anyway**.

## Build from source

```bash
npm install
npm start                 # run in development
npm run engine            # refresh the bundled ad-block filter lists
npm run dist              # Windows installer + portable
npx electron-builder --linux
npx electron-builder --mac && bash scripts/mac-finish.sh
```

See [RELEASING.md](RELEASING.md) for how to publish an update.
