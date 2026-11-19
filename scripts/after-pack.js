// Stamps NoamBrowser's icon and version info onto the Windows .exe without
// needing Wine (pure-JS resource editing via resedit).
// Then VMP-signs the app with castlabs EVS (Windows and macOS), so Netflix, Spotify, Disney+ and other protected
// video services accept it. Signing needs a castlabs EVS login on the build machine (in GitHub Actions it comes from
// the EVS_ACCOUNT_NAME / EVS_PASSWD secrets); without one the build still works, just without production VMP.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function vmpSign(dir) {
  if (process.env.NOAM_SKIP_VMP) return;
  const py = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  try {
    execFileSync(py, ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', dir], { stdio: 'inherit' });
    console.log('  • VMP-signed for protected video:', path.basename(dir));
  } catch (e) {
    if (process.env.NOAM_REQUIRE_VMP) throw new Error('VMP signing failed: ' + e.message);
    console.warn('  • VMP signing skipped (no castlabs EVS login on this computer)');
  }
}

exports.default = async function afterPack(context) {
  // macOS: VMP-sign before the app gets its Apple signature (scripts/mac-finish.sh)
  if (context.electronPlatformName === 'darwin') { vmpSign(context.appOutDir); return; }
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const R = ResEdit.default || ResEdit;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const version = context.packager.appInfo.version;

  const exe = R.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = R.NtExecutableResource.from(exe);

  const iconFile = R.Data.IconFile.from(fs.readFileSync(icoPath));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map((i) => i.data));

  const vi = R.Resource.VersionInfo.fromEntries(res.entries)[0] || R.Resource.VersionInfo.createEmpty();
  const [a, b, c] = version.split('.').map((x) => parseInt(x, 10) || 0);
  vi.setFileVersion(a, b, c, 0, 1033);
  vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    CompanyName: 'Noam',
    FileDescription: 'NoamBrowser',
    ProductName: 'NoamBrowser',
    InternalName: 'NoamBrowser',
    OriginalFilename: 'NoamBrowser.exe',
    LegalCopyright: 'Copyright © 2026 Noam',
    FileVersion: version,
    ProductVersion: version,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • stamped icon + version on', path.basename(exePath));
  // Windows: VMP-sign after everything that changes the .exe
  vmpSign(context.appOutDir);
};
