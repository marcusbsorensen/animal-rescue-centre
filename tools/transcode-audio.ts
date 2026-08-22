/**
 * transcode-audio.ts
 *
 * Bring the audio folder to one universally-playable format and a sane
 * bitrate.
 *
 * Two problems this fixes:
 *
 *   1. **OGG Vorbis does not play on iOS Safari.** 55 of the 83 audio
 *      files were .ogg — every voice line and UI chime among them. On the
 *      iPad this game is built for, all of that was silent. Everything
 *      becomes MP3, which plays everywhere.
 *
 *   2. **Bitrate.** Music sat at 128–180 kbps stereo and short UI sounds
 *      at 132 kbps. Music goes to 96 kbps stereo; voice, sfx and ui go to
 *      64 kbps mono, which is ample for a one-second chime.
 *
 * Phaser keys come from the filename minus its extension, so swapping the
 * container leaves every key unchanged — no code has to move.
 *
 * Two names existed in both formats (music-corridor, music-vet), which
 * collided on the same Phaser key: both downloaded, one arbitrarily won.
 * The newer .ogg is treated as the intended take and the superseded .mp3
 * is parked in asset-drafts/superseded-audio/ rather than deleted.
 *
 *   pnpm tsx tools/transcode-audio.ts          # report only
 *   pnpm tsx tools/transcode-audio.ts --write  # convert
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = 'apps/game/public/assets/audio';
const PARK = 'asset-drafts/superseded-audio';
const WRITE = process.argv.includes('--write');

const SOURCE_EXT = ['.ogg', '.wav', '.mp3'];

/**
 * Music gets stereo at 96k; everything else is short and fine as 64k mono.
 *
 * Takes the path relative to the audio folder, not the basename — music
 * announces itself two ways and both have to count. Most tracks are named
 * `music-*.mp3` at the top level, but the tunnel loop lives in a `music/`
 * subfolder without the prefix, and keying on the basename alone put a
 * 101-second track through the one-second-chime settings.
 */
function encodingFor(relPath: string): { bitrate: string; channels: number } {
  const segments = relPath.split(path.sep);
  const isMusic =
    segments.includes('music') || path.basename(relPath).startsWith('music-');
  return isMusic
    ? { bitrate: '96k', channels: 2 }
    : { bitrate: '64k', channels: 1 };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (SOURCE_EXT.includes(path.extname(entry.name).toLowerCase())) out.push(p);
  }
  return out;
}

function main(): void {
  const files = walk(DIR);
  const before = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);

  // Which names exist in more than one container — these collide on the
  // Phaser key, and only one of them can survive.
  const byKey = new Map<string, string[]>();
  for (const f of files) {
    const key = path.join(path.dirname(f), path.basename(f, path.extname(f)));
    byKey.set(key, [...(byKey.get(key) ?? []), f]);
  }

  console.log(`${files.length} audio files, ${(before / 1048576).toFixed(1)} MB`);
  const collisions = [...byKey.entries()].filter(([, v]) => v.length > 1);
  if (collisions.length) {
    console.log(`\nsame-key collisions (newest container wins, other parked):`);
    for (const [k, v] of collisions) console.log(`  ${path.basename(k)}: ${v.map((f) => path.extname(f)).join(' + ')}`);
  }

  if (!WRITE) {
    console.log('\nDry run — pass --write to convert. Nothing changed.');
    return;
  }

  fs.mkdirSync(PARK, { recursive: true });
  let after = 0;
  let converted = 0;
  let parked = 0;

  for (const [key, variants] of byKey) {
    // Prefer the most recently modified source as the authoritative take.
    const ordered = [...variants].sort(
      (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
    );
    const source = ordered[0];

    for (const superseded of ordered.slice(1)) {
      fs.renameSync(superseded, path.join(PARK, path.basename(superseded)));
      parked += 1;
      console.log(`  parked    ${path.basename(superseded)}`);
    }

    const target = `${key}.mp3`;
    const tmp = `${key}.transcoding.mp3`;
    const { bitrate, channels } = encodingFor(path.relative(DIR, key));
    const origBytes = fs.statSync(source).size;

    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', source,
      '-codec:a', 'libmp3lame',
      '-b:a', bitrate,
      '-ac', String(channels),
      '-ar', '44100',
      tmp,
    ]);

    if (source !== target) fs.rmSync(source);
    fs.renameSync(tmp, target);

    const newBytes = fs.statSync(target).size;
    after += newBytes;
    converted += 1;
    console.log(
      `  ${path.basename(target).padEnd(34)} ${(origBytes / 1024).toFixed(0).padStart(5)} → ${(newBytes / 1024).toFixed(0).padStart(5)} KB  (${bitrate}, ${channels === 1 ? 'mono' : 'stereo'})`,
    );
  }

  console.log(
    `\n${converted} converted, ${parked} parked. ` +
    `${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB ` +
    `(saved ${((before - after) / 1048576).toFixed(1)} MB).`,
  );
}

main();
