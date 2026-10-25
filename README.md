# NoamBrowser

A private, fast web browser for Windows, macOS and Linux.

- **Shields** — blocks ads, trackers, malware sites, cookie banners and YouTube ads; upgrades to HTTPS; blocks cross-site cookies and fingerprinting; strips tracking tags from links.
- **Built-in VPN** — free Cloudflare WARP (WireGuard) with a kill switch, or your own SOCKS5/HTTP proxy.
- **Private by design** — no telemetry, no account, no AI services, encrypted DNS.
- **Password manager** — encrypted on your computer, autofill, CSV import/export.
- **Reader view**, **on-device translation**, **picture-in-picture**, **per-site dark mode**.
- **Vertical tabs**, **tab groups**, **split view**, **command palette** (Ctrl+K).
- **Sync** through your own cloud-drive folder, encrypted with your passphrase — no server.
- **Themes** — 8 presets, Liquid Glass, custom accents, wallpapers, animations.
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
