#!/usr/bin/env node
/**
 * Build the game, archive it, and upload the result to TestFlight.
 *
 *   pnpm testflight              # next build number, taken from App Store Connect
 *   pnpm testflight --build 42   # a build number you choose
 *   pnpm testflight --no-upload  # archive and export only, leave the .ipa on disk
 *
 * Reads three things from the environment, all set in ~/.zshenv:
 *   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH
 *
 * THE PATH IS SANITISED ON PURPOSE. Xcode's packaging step shells out to
 * /usr/bin/rsync, which spawns its own server process from PATH. Homebrew's
 * rsync 3.5.1 answers, rejects Apple's `--extended-attributes` flag, and the
 * export dies with the unhelpful "Copy failed". Running the Xcode steps with
 * /opt/homebrew/bin off PATH is the whole fix; see the trap note in
 * .claude/HANDOVER.md.
 *
 * SIGNING IS MANUAL, also on purpose. Automatic ("cloud") signing fails with
 * "Cloud signing permission error" because the App Store Connect API key is
 * not authorised to mint certificates. The distribution certificate and the
 * "ARC App Store" profile already exist, so manual signing against them needs
 * no extra permission. If the profile is ever missing locally, re-download it
 * from App Store Connect rather than switching back to automatic.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appProj = path.join(root, 'apps', 'game', 'ios', 'App');
const work = path.join(os.tmpdir(), 'arc-testflight');
const archivePath = path.join(work, 'ARC.xcarchive');
const exportPath = path.join(work, 'export');
const optionsPath = path.join(work, 'ExportOptions.plist');

const TEAM_ID = 'R94VDZ56RY';
const BUNDLE_ID = 'com.healingishere.arc';
const PROFILE_NAME = 'ARC App Store';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

for (const key of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY_PATH']) {
  if (!process.env[key]) {
    console.error(`✗ ${key} is not set. It belongs in ~/.zshenv.`);
    process.exit(1);
  }
}

/** Xcode steps only: Homebrew off PATH (see the header). */
const cleanEnv = {
  ...process.env,
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
};

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });

const capture = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { encoding: 'utf8', ...opts });

// ---------------------------------------------------------------- build number

/**
 * App Store Connect rejects a build number it has already seen, and the
 * rejection arrives after the 100 MB upload rather than before it. Asking for
 * the highest build on record costs one request and saves that round trip.
 */
function nextBuildNumber() {
  const explicit = value('--build');
  if (explicit) return explicit;

  const script = `
import os, sys, time, json, urllib.request
import jwt
tok = jwt.encode(
    {"iss": os.environ["ASC_ISSUER_ID"], "exp": int(time.time()) + 600,
     "aud": "appstoreconnect-v1"},
    open(os.environ["ASC_PRIVATE_KEY_PATH"]).read(),
    algorithm="ES256",
    headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})
url = ("https://api.appstoreconnect.apple.com/v1/builds"
       "?filter[app]=${'6821467142'}&sort=-version&limit=1&fields[builds]=version")
req = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
data = json.load(urllib.request.urlopen(req))["data"]
print(int(data[0]["attributes"]["version"]) + 1 if data else 1)
`;
  try {
    return capture('python3', ['-c', script]).trim();
  } catch {
    console.warn('! Could not reach App Store Connect for the build number.');
    console.warn('  Pass one yourself with --build <n>.');
    process.exit(1);
  }
}

const buildNumber = nextBuildNumber();
console.log(`→ build ${buildNumber}`);

// ------------------------------------------------------------------ web bundle

console.log('→ staging the web bundle');
run('node', [path.join(root, 'scripts', 'build-ios.mjs')]);

// --------------------------------------------------------------------- archive

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

console.log('→ archiving');
run('xcodebuild', [
  '-project', path.join(appProj, 'App.xcodeproj'),
  '-scheme', 'App',
  '-configuration', 'Release',
  '-destination', 'generic/platform=iOS',
  '-archivePath', archivePath,
  `CURRENT_PROJECT_VERSION=${buildNumber}`,
  'archive',
], { cwd: appProj, env: cleanEnv });

// ---------------------------------------------------------------------- export

writeFileSync(optionsPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${BUNDLE_ID}</key><string>${PROFILE_NAME}</string>
  </dict>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
`);

console.log('→ exporting');
run('xcodebuild', [
  '-exportArchive',
  '-archivePath', archivePath,
  '-exportPath', exportPath,
  '-exportOptionsPlist', optionsPath,
], { env: cleanEnv });

const ipa = path.join(exportPath, 'App.ipa');
if (!existsSync(ipa)) {
  console.error(`✗ no .ipa at ${ipa}`);
  process.exit(1);
}

if (flag('--no-upload')) {
  console.log(`✓ ${ipa}`);
  process.exit(0);
}

// ---------------------------------------------------------------------- upload

console.log('→ uploading to TestFlight');
run('xcrun', [
  'altool', '--upload-app',
  '-f', ipa,
  '-t', 'ios',
  '--apiKey', process.env.ASC_KEY_ID,
  '--apiIssuer', process.env.ASC_ISSUER_ID,
], { env: cleanEnv });

console.log(`✓ build ${buildNumber} uploaded.`);
console.log('  Processing takes a few minutes; TestFlight emails the testers when it lands.');
