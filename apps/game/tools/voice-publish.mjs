#!/usr/bin/env node
/**
 * Publish the kept voice takes: turn them into the compressed audio the game
 * plays, and put it where the game looks for it.
 *
 *   node apps/game/tools/voice-publish.mjs [--dry-run] [--prune]
 *        [--takes <dir>] [--script <file>] [--out <dir>]
 *
 * Reads  apps/game/voice-takes/keep/<lineId>.<ext> + <lineId>.json  (the booth's kept takes)
 * Writes apps/game/public/assets/voice/<lineId>.mp3                 (committed; this is what ships)
 *
 * A take ships only when the words that were recorded are the words the game
 * shows for that line. The text on screen has to match what is heard, because
 * children read along. So a take recorded against the name-free draft waits
 * until the game's own text is changed to the draft (option A in
 * docs/voice-recording-plan-2026-10-14.md), and a take whose line has since been
 * reworded is held back too. Nothing is guessed: it says what it did and why.
 *
 * Format: mono, 44.1 kHz, MP3 at 96 kbps (the game's other voice clips are MP3,
 * which every browser and the iOS web view play), silence trimmed from both
 * ends, loudness levelled to -16 LUFS so every voice sits at the same volume.
 *
 * Needs ffmpeg (brew install ffmpeg).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Decide what to do with each kept take. Pure, so it can be tested.
 *
 * @param {{ speakers: Array<{ id: string, lines: Array<{ lineId: string, text: string }> }> }} script
 * @param {Array<{ lineId: string, file: string, text: string, consent?: boolean }>} kept
 * @param {string[]} existing  lineIds that already have a published mp3
 */
export function planPublish(script, kept, existing = []) {
  const gameText = new Map();
  for (const sp of script.speakers) for (const l of sp.lines) gameText.set(l.lineId, l.text);

  const publish = [];
  const held = [];
  for (const k of kept) {
    if (!gameText.has(k.lineId)) {
      held.push({ lineId: k.lineId, reason: 'not a line in the script' });
    } else if (k.consent !== true) {
      held.push({ lineId: k.lineId, reason: 'the speaker has not agreed (no consent on the take)' });
    } else if (gameText.get(k.lineId).includes('{animal}')) {
      held.push({ lineId: k.lineId, reason: 'the game still shows the animal\'s name in this line, which cannot be recorded' });
    } else if (gameText.get(k.lineId) !== k.text) {
      held.push({ lineId: k.lineId, reason: 'the words recorded are not the words the game shows' });
    } else {
      publish.push(k);
    }
  }
  const keptIds = new Set(kept.map((k) => k.lineId));
  const orphans = existing.filter((id) => !keptIds.has(id));
  return { publish, held, orphans };
}

/** The ffmpeg arguments for one take. */
export function ffmpegArgs(input, output) {
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12';
  const filter = [
    'highpass=f=70',
    trim,
    'areverse',
    trim,
    'areverse',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(',');
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '44100', '-af', filter, '-codec:a', 'libmp3lame', '-b:a', '96k', output];
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const game = path.resolve(here, '..');
  const takes = path.resolve(option(args, '--takes') ?? path.join(game, 'voice-takes'));
  const scriptFile = path.resolve(option(args, '--script') ?? path.join(game, 'public/admin/voice-script.json'));
  const out = path.resolve(option(args, '--out') ?? path.join(game, 'public/assets/voice'));
  const dry = args.includes('--dry-run');
  const prune = args.includes('--prune');

  const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  const keepDir = path.join(takes, 'keep');
  if (!fs.existsSync(keepDir)) {
    console.log(`Nothing to publish: ${keepDir} does not exist. Record and keep some takes in the voice booth first.`);
    return 0;
  }
  const kept = fs.readdirSync(keepDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(keepDir, f), 'utf8')));
  const existing = fs.existsSync(out)
    ? fs.readdirSync(out).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4))
    : [];

  const plan = planPublish(script, kept, existing);

  if (!dry && plan.publish.length) {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    } catch {
      console.error('ffmpeg is not installed. Run: brew install ffmpeg');
      return 1;
    }
    fs.mkdirSync(out, { recursive: true });
  }
  for (const k of plan.publish) {
    const input = path.join(keepDir, k.file);
    const output = path.join(out, `${k.lineId}.mp3`);
    if (dry) {
      console.log(`would publish ${k.lineId}  (${k.file} -> ${path.relative(process.cwd(), output)})`);
      continue;
    }
    execFileSync('ffmpeg', ffmpegArgs(input, output), { stdio: 'inherit' });
    console.log(`published ${k.lineId}  (${(fs.statSync(output).size / 1024).toFixed(0)} KB)`);
  }
  for (const h of plan.held) console.log(`held back ${h.lineId}: ${h.reason}`);
  for (const id of plan.orphans) {
    if (prune && !dry) {
      fs.rmSync(path.join(out, `${id}.mp3`));
      console.log(`removed ${id}.mp3 (no kept take)`);
    } else {
      console.log(`orphan ${id}.mp3 has no kept take${prune ? '' : ' (run with --prune to remove it)'}`);
    }
  }
  console.log(`\n${plan.publish.length} ${dry ? 'would be ' : ''}published, ${plan.held.length} held back.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
