#!/usr/bin/env bash
# Ad-hoc signs the macOS builds (required to launch on Apple Silicon), zips them,
# and writes latest-mac.yml so the in-app updater can see new versions.
set -euo pipefail
cd "$(dirname "$0")/../dist"
VERSION=$(node -p "require('../package.json').version")
files=()
for dir in mac-arm64 mac; do
  [ -d "$dir/NoamBrowser.app" ] || continue
  arch=$([ "$dir" = mac ] && echo x64 || echo arm64)
  rcodesign sign "$dir/NoamBrowser.app" >/dev/null
  name="NoamBrowser-$VERSION-$arch-mac.zip"
  (cd "$dir" && rm -f "../$name" && zip -qry "../$name" NoamBrowser.app)
  files+=("$name")
  echo "built $name"
done
node -e '
const fs=require("fs"),crypto=require("crypto");
const [version,...files]=process.argv.slice(1);
const ent=files.map(f=>({url:f,sha512:crypto.createHash("sha512").update(fs.readFileSync(f)).digest("base64"),size:fs.statSync(f).size}));
const y=["version: "+version,"files:",...ent.flatMap(e=>["  - url: "+e.url,"    sha512: "+e.sha512,"    size: "+e.size]),"path: "+ent[0].url,"sha512: "+ent[0].sha512,"releaseDate: \x27"+new Date().toISOString()+"\x27",""].join("\n");
fs.writeFileSync("latest-mac.yml",y); console.log("wrote latest-mac.yml");
' "$VERSION" "${files[@]}"
