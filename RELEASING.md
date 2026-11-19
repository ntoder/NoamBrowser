# Releasing NoamBrowser

**The easy way (3.2+):** bump `version` in package.json, update RELEASE_NOTES.md, push to main, then on GitHub open
**Actions → Build NoamBrowser → Run workflow**. GitHub builds Windows, Mac and Linux on real machines (VMP-signed for
Netflix when the EVS_ACCOUNT_NAME / EVS_PASSWD secrets are set) and creates a **draft release** with all files.
Open Releases, check it, click **Publish**. Installed copies update themselves.

---

# Publishing a NoamBrowser update

Every copy of NoamBrowser checks `github.com/ntoder/NoamBrowser/releases/latest`
every few hours. To ship an update, create a GitHub Release that has these files.

## 1. Build (or get the files from Claude)

The version number in `package.json` must be higher than the last release.

## 2. Create the release on GitHub

1. Go to **github.com/ntoder/NoamBrowser/releases/new**.
2. **Choose a tag**: type `v2.1.0` (match the version) and pick *Create new tag*.
3. **Release title**: `NoamBrowser 2.1.0`. Add notes about what changed — they show in the app.
4. Drag in **all** of these files from the `dist` folder:

   | File | Needed for |
   | --- | --- |
   | `latest.yml` | Windows updates (**required**) |
   | `NoamBrowser-Setup-x.y.z.exe` | Windows installer + updates |
   | `NoamBrowser-Setup-x.y.z.exe.blockmap` | Smaller Windows updates |
   | `NoamBrowser.exe` | Windows portable download |
   | `latest-mac.yml` | Mac update notices (**required**) |
   | `NoamBrowser-x.y.z-arm64-mac.zip` | Apple Silicon Macs |
   | `NoamBrowser-x.y.z-x64-mac.zip` | Intel Macs |
   | `latest-linux.yml` | Linux updates (**required**) |
   | `NoamBrowser-x.y.z-x86_64.AppImage` | Linux AppImage + updates |
   | `noambrowser_x.y.z_amd64.deb` | Ubuntu/Debian + updates |

5. Leave **Set as a pre-release** unticked, and click **Publish release**.

Within a few hours every installed copy finds it. The Windows installer and
Linux versions download it in the background and show **Restart to update**;
Macs and the portable `.exe` show **Update available** and open the download page.

Tip: in NoamBrowser, **Settings → About & updates → Check for updates** checks right away.
