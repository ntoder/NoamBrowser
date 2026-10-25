// Stamps NoamBrowser's icon and version info onto the Windows .exe without
// needing Wine (pure-JS resource editing via resedit).
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
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
};
