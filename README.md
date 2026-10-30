# NoamBrowser

A private, fast web browser for Windows, macOS and Linux.

- **Shields** — blocks ads, trackers, malware sites, cookie banners and YouTube ads; upgrades to HTTPS; blocks cross-site cookies and fingerprinting; strips tracking tags from links.
- **Built-in VPN** — free Cloudflare WARP (WireGuard) with a kill switch, or your own SOCKS5/HTTP proxy.
- **Private by design** — no telemetry, no account, no AI services, encrypted DNS.
- **Chrome Web Store extensions 🧩** — add extensions from the Chrome Web Store (Dark Reader, Grammarly, Bitwarden…). Before anything is added you see a plain-language safety check (“can read everything on every site you visit”) with a low/medium/high risk rating. Extensions never run in private tabs or containers. You can also load your own extension folder — with a step-by-step “make your first extension” guide.
- **Tab search (Ctrl+Shift+A)** — finds open tabs, sleeping tabs, recently closed tabs and history, and even the words *inside* your open pages.
- **Search what you’ve read 🧠** — find a page again by something it said, even if you forgot its title. Kept privately on your computer (never private tabs, email, banking or password pages).
- **Highlighter 🖍️** — highlight text on any page in 4 colours (right-click → Highlight, or Ctrl+Shift+H). Highlights come back when you return, “copy link to highlight” jumps straight to the spot, and noam://highlights lists them all.
- **Share** — a clean link with tracking tags removed, a QR code to open the page on your phone, email or WhatsApp.
- **Forget-me sites** — sites whose cookies and data are wiped when you close their last tab (Shields panel).
- **Dead page rescue** — when a page is gone (404), one click shows the Wayback Machine’s copy or your own Time machine copy.
- **Organize tabs** — one click sorts your tabs into named groups by topic (videos, chat, learning, code, work, shopping, news, Torah…), on your computer, with undo.
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
- **Blue light filter** — warm night tint with 6 colours or your own, strength, screen dimming, sunset-to-sunrise or timed schedule, gradual fade-in (Ctrl+Shift+L).
- **Speed & memory ⚡** — unused tabs go to sleep and free their memory (they wake up with their back/forward history), tabs that hog the processor in the background are caught and can be put to sleep in one click, Energy saver kicks in on battery, Speed mode for older computers, instant same-site links, and fast start that only loads restored tabs when you click them.
- **Containers** — be signed in to the same site with several accounts at once (e.g. YouTube for fun, for work and for school), each with its own colour.
- **Music & ambient sounds 🎧** — 14 music styles in the sidebar (calm piano, jazz, classical, guitar, rock, synthwave, 8-bit, dance, Middle Eastern, music box, harp, space, meditation bowls, lo-fi) that keep composing new tunes, plus rain, waves, fireplace, birds and more. All made on your computer: no internet, no ads, no talking. Mix them, use moods, a sleep timer, or play automatically during Focus sessions.
- **Focus mode 🍅 (Ctrl+Shift+F)** — a Pomodoro timer built for self-discipline: say what you'll work on and make a promise, then distracting sites are tracked, gently paused (with a 10-second think-again screen) or strictly blocked. Website notifications are held and noisy tabs silenced. Every session gets a focus score with what distracted you; the progress page shows streaks, badges, a 30-day chart, whether each distraction is shrinking week by week, and when you focus best.
- **Code Buddy 🐣** — developer tools for beginners: hover anything to hear what it is, pick it and change its words, colours, size and shape with big buttons while it shows the real CSS you're writing, peek at its HTML, and follow 12 quests. "Teach me" bubbles can work on every page. Then level up to the Dev Lab.
- **Double-click dictionary** — double-click any word for a Hebrew ⇄ English translation, offline, with a 🔊 button.
- **Time machine** — save a copy of any page, look at it later even if the site changes, compare two copies line by line, or watch a page and get told when it changes.
- **Price tracker 🏷️** — click the tag in the address bar on a product page; NoamBrowser checks the price in the background and tells you when it drops or hits your target.
- **Dev Lab (F12)** — friendly developer tools that explain everything in simple words: Explore (inspector with live editing, box model, measure), Console (with error explanations), Network, Remix (live CSS), Colours & Fonts (eyedropper, contrast), Devices (phones, tablets, colour-blind vision), Everyone (accessibility checkup), Cookies & Memory, Speed report card, Scripts and a 3D view that pulls the page apart into layers — plus 13 missions to learn web development. Pro Chromium DevTools are still on Ctrl+Shift+I.
- **Code Playground** — write HTML, CSS and JavaScript and see it live, with starter projects (games, drawing pad, counter…), a friendly console and download as .html.
- **JSON viewer** — data files show as a tidy, foldable, searchable tree.
- **Screen time** — see how long you spend on each site (today, week, month), with daily limits and reminders. Stays on your computer.
- **Zmanim reminders** — a notification before Shema, Shacharit, Mincha, candle lighting, sunset and more (5 minutes to 2 hours ahead).
- **Themes** — 9 presets (including Daylight, which changes with the time of day), Liquid Glass, custom accents, wallpapers, animations.
- **Automatic updates** from this repository's Releases.

## How to install

All downloads are on the **[Releases page](https://github.com/ntoder/NoamBrowser/releases/latest)**. Scroll down to **Assets** and pick the file for your computer. (Ignore the files ending in `.yml` and `.blockmap` — those are for automatic updates.)

You only install once. After that, NoamBrowser updates itself.

### 🪟 Windows

1. Download **`NoamBrowser-Setup-2.1.0.exe`** (the number may be newer).
2. Open it from your Downloads folder.
3. If a blue box says **"Windows protected your PC"**: click **More info**, then **Run anyway**. (This appears because the app is new, not because something is wrong.)
4. NoamBrowser installs and opens by itself. You'll find it in the Start menu and on your desktop.

*No admin rights / want to run it from a USB stick?* Download **`NoamBrowser.exe`** instead and just double-click it — nothing is installed. (This version doesn't update itself; it tells you when there's a new one.)

### 🍎 Mac

1. Find out which Mac you have: click the **Apple menu  → About This Mac**.
   - It says **Chip: Apple M1 / M2 / M3 / M4…** → download **`NoamBrowser-…-arm64-mac.zip`**
   - It says **Processor: Intel…** → download **`NoamBrowser-…-x64-mac.zip`**
2. Double-click the downloaded zip. A **NoamBrowser** app appears next to it.
3. Drag **NoamBrowser** into your **Applications** folder.
4. Open **Terminal** (press ⌘ Space, type `Terminal`, press Enter), paste this line and press Enter:
   ```
   xattr -cr /Applications/NoamBrowser.app
   ```
   This tells macOS it's OK to open the app. You only do it once. It prints nothing — that means it worked.
5. Open NoamBrowser from Applications (or Launchpad).

*Skipped step 4 and got "NoamBrowser Not Opened"?* Click **Done**, then go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to NoamBrowser.

### 🐧 Linux (Ubuntu, Debian, Mint, Zorin, Pop!_OS…)

Do these steps **on the Linux computer itself**.

1. Download **`noambrowser_2.1.0_amd64.deb`** (the number may be newer) with the browser on that computer. It goes into your **Downloads** folder.
2. Open **Terminal** (press **Ctrl + Alt + T**).
3. Copy this whole line, paste it with **Ctrl + Shift + V**, and press Enter:
   ```
   sudo apt install ~/Downloads/noambrowser_*_amd64.deb
   ```
4. Type your computer password when it asks (nothing shows while you type — that's normal), press Enter, then press **Y** and Enter if it asks to continue.
5. Open **NoamBrowser** from your apps menu.

*Getting "Unsupported file" or "no such file"?* The file isn't in Downloads on that computer. Run `ls ~/Downloads` to see what's there, and download it again if it's missing.

*Other Linux (Fedora, Arch…)?* Download **`NoamBrowser-…-x86_64.AppImage`**, right-click it → **Properties → Permissions → Allow executing as a program**, then double-click it.

### Updating

Nothing to do. NoamBrowser checks for new versions every few hours. On Windows and Linux it downloads the update and shows **Restart to update**; on Mac it shows **Update available** and opens this page so you can download the new zip (then repeat Mac steps 2–4). To check right now: **Settings → About & updates → Check for updates**.

### Is it safe?

The warnings on Windows and Mac show up for any app that hasn't paid Microsoft or Apple for a signing certificate. NoamBrowser's full source code is in this repository.

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
