# Voice recording plan: the adoption hand-over

> Status: plan, 2026-10-14. Marcus decided (115B) that the voices are human,
> recorded by Marcus and friends, with no outside voice service or API.
> This document is the plan for recording them. The runner side is built
> (a line plays its file when one exists and is silent when it does not); the
> recordings and the name decision below are not.
>
> Related: [`adoption-dialogue-presentation-2026-05-19.md`](adoption-dialogue-presentation-2026-05-19.md)
> (the design), [`plan-adoption-dialogue-2026-07-04.md`](plan-adoption-dialogue-2026-07-04.md)
> (the runner).

## Decisions for Marcus

**1. The names. Which of these do we record?** (The reasoning is under "The hard part: names".)

- **A. Name-free lines (recommended).** Every hand-over line is reworded so it does not say the animal's
  name, and the same words go on screen. All 60 lines can be recorded whole, and what children hear is exactly
  what they read. The animal's name stays in the picker, the ceremony and the toasts.
- **B. A few recorded names for common animals.** Marnie records the names of the animals that turn up most,
  and her lines say them. Covers about 30 per cent of animals for 20 names; the other 70 per cent still
  need name-free lines, so this is A plus extra work.
- **C. Voice only Marnie.** Only the warden is heard; every family stays text. Least to record (her two
  lines), but her lines have the animal's name in them too, so she needs name-free lines as well.

**2. How many voices in the first round?**

- **A. Marnie and eight households (recommended).** Marnie, then Priya, Nova, Jan, Lei, Finn, Babcia, the
  Odenkirks and Marcus & Rhubarb & Gosia. Between them they take all five species the game rehomes (cat, dog,
  bunny, parrot, snake). Marnie is heard in every hand-over; a family is heard when the child picks one of the
  eight, and a family with no recording stays text, which is how the game behaves now.
- **B. All 30 voices at once.** 60 lines; roughly two hours of recording across the cast.
- **C. Marnie only.** Her two lines; about fifteen minutes.

Nothing for any option is built yet. Choosing A in question 1 is one small change in game code (below).

## The cast

One warden and 29 households, two lines each: **60 lines**. Every household that adopts speaks twice (beats 2
and 4); Marnie speaks twice (beats 1 and 3). The voice notes come from the roster's own blurbs and steer a
performance; they never ask anyone for a voice or an accent they do not have. A warm, clear natural voice
beats a character voice.

- One voice is enough for a household of two or more people.
- A friend can voice several households if they sound different from one another.
- Marnie's voice must not be used for a household. Every household appears in a conversation with her.
- Aim for about ten to twelve distinct voices across the cast. Marnie is heard in every single hand-over, so
  cast her first, with the best natural performer.

| # | Speaker | Line ids | Voice note |
|---|---------|----------|------------|
| 1 | **Marnie**, the warden (`warden`) | `handover-warden-1` `handover-warden-3` | Warm, unhurried, mid-thirties. A friendly shelter warden who has done this many times and still loves it. A smile in the voice. |
| 2 | Priya “Pri” Kaur (`01-priya`) | `handover-01-priya-2` `handover-01-priya-4` | Soft and quiet-spoken, a little shy and delighted. A young woman who rarely raises her voice. |
| 3 | Jan Lindqvist (`02-jan`) | `handover-02-jan-2` `handover-02-jan-4` | Calm, slow and kind. A patient beekeeper; a low, easy voice, never hurried. |
| 4 | Nova Adebayo (`03-nova`) | `handover-03-nova-2` `handover-03-nova-4` | Bright and playful, musical, laughs easily. A young artist. |
| 5 | Babcia Basia Kowalska (`04-babcia`) | `handover-04-babcia-2` `handover-04-babcia-4` | An older woman, a loving grandmother. Slow, warm, a little crackle is welcome. |
| 6 | Finn O'Malley (`05-finn`) | `handover-05-finn-2` `handover-05-finn-4` | Energetic and cheerful, quick and breathy, just back from a run. A young man. |
| 7 | Hiroshi “Hiro” Nakamura (`06-hiro`) | `handover-06-hiro-2` `handover-06-hiro-4` | Very quiet and gentle, an older man who speaks carefully and softly. |
| 8 | Avital “Tali” Rosenberg (`18-tali`) | `handover-18-tali-2` `handover-18-tali-4` | Warm, dry and cheerful, a potter with clay on her hands. |
| 9 | Mei Lin “Linny” Chow (`19-linny`) | `handover-19-linny-2` `handover-19-linny-4` | Crisp, bright and friendly. A young blogger who talks to a camera all day. |
| 10 | Leilani “Lei” Kealoha (`20-lei`) | `handover-20-lei-2` `handover-20-lei-4` | Sunny and relaxed with a little singsong. Someone who plays the ukulele. |
| 11 | Mariama “Mara” Diop (`21-mara`) | `handover-21-mara-2` `handover-21-mara-4` | Strong, warm and joyful. A tailor who runs a busy shop and loves it. |
| 12 | Morwenna “Wenna” Treloar (`29-wenna`) | `handover-29-wenna-2` `handover-29-wenna-4` | Hearty, weathered and kind. Someone who lives by the sea in all weathers. |
| 13 | Anjali & Sam Patel-Green (`07-patel-greens`) | `handover-07-patel-greens-2` `handover-07-patel-greens-4` | Calm and unhurried, a retired couple. One gentle voice speaks for both. |
| 14 | Chris & Jamie Walker (`08-walkers`) | `handover-08-walkers-2` `handover-08-walkers-4` | Friendly and practical, a workshop-warm voice. One of the two speaks for both. |
| 15 | Mel & Alex Okonkwo-Hart (`09-okonkwo-harts`) | `handover-09-okonkwo-harts-2` `handover-09-okonkwo-harts-4` | Playful, laughing, a pair of bakers who finish each other's sentences. |
| 16 | Dani & Rex (`10-dani-rex`) | `handover-10-dani-rex-2` `handover-10-dani-rex-4` | Hearty and open-air, loud and happy, a farmhouse voice. |
| 17 | Cem & Leyla Yılmaz (`22-yilmaz`) | `handover-22-yilmaz-2` `handover-22-yilmaz-4` | Warm and cheerful, a bakery couple. One voice speaks for both. |
| 18 | Wiri & Harper (`23-wiri-harper`) | `handover-23-wiri-harper-2` `handover-23-wiri-harper-4` | Calm, clear and steady, a pair of forest rangers who talk without rushing. |
| 19 | Vargas-Chen family (`11-vargas-chen`) | `handover-11-vargas-chen-2` `handover-11-vargas-chen-4` | A busy, cheerful family; a parent's voice, quick and kind. |
| 20 | The Odenkirks (`12-odenkirks`) | `handover-12-odenkirks-2` `handover-12-odenkirks-4` | Quiet and bookish, gentle; Helen and Bo, who watch birds and read a lot. |
| 21 | Kumar-Ishii family (`13-kumar-ishii`) | `handover-13-kumar-ishii-2` `handover-13-kumar-ishii-4` | Friendly and capable, a vet mum: kind and brisk at once. |
| 22 | Grandpa Theo & grandkids (`14-theo-grandkids`) | `handover-14-theo-grandkids-2` `handover-14-theo-grandkids-4` | A gentle grandfather, low and warm. Theo speaks; the grandkids need not. |
| 23 | Perera-Fernando family (`24-perera-fernando`) | `handover-24-perera-fernando-2` `handover-24-perera-fernando-4` | Kind and calm, parents of twins. Soft, patient, a little tired and very happy. |
| 24 | The Estrada Train (`31-estrada-train`) | `handover-31-estrada-train-2` `handover-31-estrada-train-4` | Loud, cheerful chaos. A lively adult lead; an adult may do the whole train. |
| 25 | Bramble House housemates (`25-bramble-house`) | `handover-25-bramble-house-2` `handover-25-bramble-house-4` | Relaxed young friends, chilled and friendly. One voice speaks for the house. |
| 26 | Sunnybrook Children's Home (`26-aisha-childrens-home`) | `handover-26-aisha-childrens-home-2` `handover-26-aisha-childrens-home-4` | A warm carer with a steady, reassuring voice. |
| 27 | Oak Lodge Care Home (`27-tomas-care-home`) | `handover-27-tomas-care-home-2` `handover-27-tomas-care-home-4` | Gentle, with a lilt. A carer or a resident who loves a lap. |
| 28 | Ms. Popescu's Year 3 (`28-iris-teacher`) | `handover-28-iris-teacher-2` `handover-28-iris-teacher-4` | A bright primary-school teacher. A class chorus is welcome but not needed. |
| 29 | Marcus & Rhubarb & Gosia (`30-two-houses`) | `handover-30-two-houses-2` `handover-30-two-houses-4` | A cheerful family with two homes and one skateboard. Marcus's own voice fits here. |
| 30 | Ana “Tata” Silva (`16-tata`) | `handover-16-tata-2` `handover-16-tata-4` | Capable, warm and steady, a farmer, fond of her dog Rufus. |

## The script

Every household says the same two lines, so they are printed once here. Each line has a stable id:
`handover-<speaker>-<beat>`, for example `handover-warden-1` and `handover-01-priya-2`. The ids are the file
names, the same in the voice booth, in `public/admin/voice-script.json` and in the game, and a test keeps
all three in step with `packages/game-logic/src/adoption-dialogue.ts`.

`{animal}` stands for the animal's name, which the game fills in. It is the problem the next section is about.

### Marnie (left, the warden)

| Line id | Beat | Pose | What the game shows now | Draft with no name (option A) |
|---------|------|------|-------------------------|-------------------------------|
| `handover-warden-1` | 1 | neutral | This is {animal}. {animal} has been hoping for the perfect home. | Meet our little friend! This one has been hoping for the perfect home. |
| `handover-warden-3` | 3 | happy | Look after {animal} for us, won't you? | Look after them for us, won't you? |

### Every household (right)

| Line id pattern | Beat | Pose | What the game shows now | Draft with no name (option A) |
|-----------------|------|------|-------------------------|-------------------------------|
| `handover-<household>-2` | 2 | neutral | Hello little {animal}! We've come all this way to meet you. | Hello, little one! We've come all this way to meet you. |
| `handover-<household>-4` | 4 | greeting | Thank you, Marnie! We'll love {animal} forever. | Thank you, Marnie! We promise to love them forever. |

The household ids are in the cast table above, for instance `handover-24-perera-fernando-4`. "Marnie" is a
fixed name, so a household can say it and be recorded saying it.

The drafts are a suggestion, written to be said aloud and to stay short for an eight-year-old. Change any
wording before recording; the only rule is that the recording and the screen carry the same words.

## The hard part: names

Children read along while they listen, so **the text on screen has to be exactly what is heard**. Today every
one of the four lines says the animal's name, and a recording cannot say every name.

What is true about the names:

- The name is picked from a fixed list per species, with no free text (spec section 3). The five species that
  get adopted have 20 names each, which comes to **90 different names** because some are shared (Biscuit, Bramble,
  Pepper, Marble, Daisy, Ziggy, Pebble, Juniper).
- If species and names are equally likely, the commonest 10 names cover about 20 per cent of animals, 20 names
  about 30 per cent, 40 names about 50 per cent, and all 90 cover all of them. So recording "a few" names
  helps a small share of children.
- Marnie alone could record all 90 names, one take each, in roughly 45 minutes.
- A household cannot: 29 voices by 90 names is 2,610 clips.
- Stitching a name between two recorded halves of a sentence is audible as a seam, and a name said inside a
  sentence needs to be said in that sentence's tune.

The three options as questions of effort and honesty:

| | A. Name-free lines | B. A few recorded names | C. Only Marnie |
|---|---|---|---|
| Lines to record | 60 | 60 plus 20 to 90 names | 2 (plus 90 names if she says them) |
| Does what is heard match the text on every animal | Yes | Only for the recorded names; the rest need name-free text too, so the screen has two versions of each line | Yes, if her lines are name-free |
| Does the animal's name stay in the conversation | No (it stays on the picker, ceremony and toasts) | Sometimes | Only in Marnie's name lines |
| Who is heard | Marnie and the family | Marnie, sometimes the family | Marnie |
| Extra work in the game | Change four line templates and a test | Per-name audio lookup, stitching, two text versions | Smallest |
| Cost of changing your mind later | Low: a name line for Marnie can be added on top | High | Low |

**Recommendation: A.** It is the only option where the whole conversation is voiced and the screen always
matches the audio, and it costs 60 short lines. It also keeps the door open: if the animal's name matters
in Marnie's mouth, add one extra Marnie line ("Meet ...!") with the 90 names recorded once in her voice
(roughly 45 minutes), and nothing already recorded changes. The price of A is that the hand-over text stops
saying "Pumpkin": the name is on the picker and the ceremony either side of it, and the green animal-name
highlight no longer appears in this conversation (it stays in the runner for other ones).

If you choose A, the change in code is: make the four `HANDOVER_LINES` templates in
`packages/game-logic/src/adoption-dialogue.ts` equal to their `nameFree` drafts (or your own wording), refresh
`public/admin/voice-script.json` (the command is in the test), and publish. Until then a take recorded against
a draft is kept but not shipped, because the game would still be showing different words. The publish tool says
so for each take.

## File format and names

- **What the booth records.** Whatever the browser gives: WebM/Opus in Chrome, Edge and Firefox, MP4/AAC
  (`.m4a`) in Safari on a Mac or iPad. That is fine for a voice line. Someone with a recorder app can do better
  with a 48 kHz, mono, 24-bit WAV and bring it in with "Import a recording".
- **Names.** Raw takes: `<line id>__take<N>.<ext>`, for example `handover-warden-1__take2.webm`. The chosen take:
  `<line id>.<ext>`, with a `<line id>.json` beside it that records the words said, who said them and that they
  agreed.
- **What ships.** `apps/game/public/assets/voice/<line id>.mp3`: mono, 44.1 kHz, MP3 at 96 kbps, silence trimmed
  from both ends, levelled to -16 LUFS so every voice sits at the same volume. MP3 because the game's other voice
  clips are MP3 and it plays everywhere, including the iOS web view. About 20 KB a line, so the whole cast is
  about 1.2 MB, loaded a conversation at a time and never at boot.
- **How the game finds a line.** The asset manifest lists what has shipped. A beat whose id has a file plays it;
  a beat with no file stays silent. A tap on the box, SKIP, or the conversation ending stops whatever is playing,
  and so does turning sound effects off.

## Folder layout

```
apps/game/
  voice-takes/                 gitignored: never committed
    raw/<speaker>/             every take, <line id>__take<N>.<ext>
    keep/                      the chosen take for each line, <line id>.<ext> + <line id>.json
  public/
    admin/
      voice-booth.html         the booth (dev only; removed from every production build)
      voice-script.json        the script the booth reads (dev only; removed from builds)
    assets/voice/              committed: <line id>.mp3, what the game plays
  plugins/voice-booth*.ts      the dev-server endpoint the booth saves through
  tools/voice-publish.mjs      kept takes -> assets/voice/*.mp3
```

Friends' names and their agreement live in the sidecars under `voice-takes/`, which stay on this computer.
The repository is public, so nothing that names a friend goes into it.

## The voice booth

Open `http://localhost:5173/admin/voice-booth.html` on the computer running the dev server.

1. Say who is speaking and tick the box: the speaker has agreed to the consent line below. Nothing records
   until both are done.
2. Pick the words to record (the name-free draft is the default).
3. For each line: **Record**, speak, **Stop**. It is saved as a take at once. Record two or three. Play
   each back with its **Take N** button. Choose the best and press **Keep this take**.
4. **Import a recording** attaches a file instead: a Voice Memos export, a WAV from a recorder.
5. **Next line to do** jumps to the first line without a kept take, and **Show: lines still to do** hides
   the finished ones.

When there are kept takes: `node apps/game/tools/voice-publish.mjs` (add `--dry-run` to see first). It
converts each take that matches the game's words, tells you which it held back and why, and writes the MP3s
into `public/assets/voice/`. Commit those.

**Saving needs the dev server to be restarted once.** The endpoint is a Vite plugin, and a plugin only
loads when the dev server starts. Until then the page opens and records, but says "Saving is off".

**On an iPad.** As the dev server is started now it listens on this computer only (`localhost`), so an iPad
cannot reach it. Two things have to change: start it with `--host`, and serve it over https, because a browser
only allows a microphone on `localhost` or https, and an iPad reaching the Mac by its network address over
plain http gets neither. (A self-signed certificate does it; `@vitejs/plugin-basic-ssl` is the usual way and is
not installed here.) The page then still loads and "Import a recording" still works over http, so the
simple route is: record in the Voice Memos app on the iPad, share the files to the Mac, and import them in the
booth. The laptop's own microphone needs none of this.

## A recording guide for people who are not actors

You do not need a performance. You need to sound like a kind person talking to a child.

- **A quiet room with soft things in it.** A bedroom with the curtains drawn and a duvet is better than a
  kitchen. Fridges, fans, the boiler and traffic all show up on a recording. Close the door. Put the phone on
  silent and in aeroplane mode.
- **The microphone.** The laptop's own microphone or a phone is fine. About a hand's width (15 to 20 cm) from
  your mouth, a little to one side so breath does not pop on it. Do not move while you speak. The meter by the
  Record button should move in the middle; if it touches red, back away.
- **Say it to someone.** Picture a seven-year-old across the table. Smile as you speak; it can be heard.
  Slower than you would speak to an adult, with the words clear. Do not do a voice you cannot keep up.
- **Three takes of every line.** Leave a second of quiet before you start and after you stop. If you trip,
  stop and go again; there is no penalty. Do all your lines in one sitting so the room and your voice match.
- **Keep water to hand,** and stop if your voice is getting tired. A short second session is better than a
  rough first one.
- **Do not whisper or shout.** Anything the child must catch has to survive a small tablet speaker.
- **If you are under 18,** a parent or guardian has to agree to the consent line first, and should be in the room.

## The consent line

Each person whose voice might ship agrees to this first. The booth asks for it before it records anything and
saves the answer with each kept take.

> I'm happy for my recorded voice to be used in the A.R.C. game for children. I understand anyone who plays
> the game will hear it, and that I can ask for it to be taken out of future versions. I'm not agreeing to my
> voice being used to train or imitate voices with AI.
> (If I am under 18, my parent or guardian has agreed too.)

A reply by message or email saying "I agree to the consent line" is enough to keep with the take. If a friend
asks to be removed, delete their kept takes and published MP3s; the next release leaves them out.

## What is built and what is not

| | |
|---|---|
| Built | The runner plays a recorded line and stays silent without one; stops on advance, SKIP and sound-off. The asset loader's lookup. The voice booth page. The dev endpoint, kept out of production builds. The publish tool. The script file. A test that the plan, the script and the game's lines agree. |
| Waiting on you | Question 1 (names) and question 2 (how many voices). |
| Waiting on a dev-server restart | Registering the booth's endpoint in `vite.config.ts`. It is on its own branch (`claude/voice-booth-wiring`) so that the running dev server is not restarted under anyone; merging it restarts the server. |
| Not built | Any of the name options. Any recordings. A separate service-worker cache for voice clips (in the wiring branch). |
