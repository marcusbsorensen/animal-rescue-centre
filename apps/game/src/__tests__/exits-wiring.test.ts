import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { exitsForSpecies, rewildingPlanFor, rewildingCopy } from '@arc/game-logic';

/**
 * How the exits reach a child: the Paths panel, the release ceremony, and the
 * scene code that feeds them.
 *
 * The rules live in game-logic/exits.ts and are tested there. What is checked
 * here is that the app uses them — and, for the two static pages, what a
 * child would see. `GameScene` cannot be imported under test (Phaser probes
 * a canvas), so its wiring is read, the way `collection-wiring.test.ts` reads
 * the arrival switch. The two HTML pages hold no table of their own and can be
 * run: their inline script is executed by jsdom and sent the same `init`
 * message the scene sends.
 */

const SRC = path.join(__dirname, '..');
const PUBLIC = path.join(SRC, '..', 'public');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const GAME_SCENE = read('scenes/GameScene.ts');

/** The body of one GameScene method, up to the next method at the same indent. */
function method(name: string): string {
  const after = GAME_SCENE.split(new RegExp(`\\n  (?:private |public )?${name}\\(`))[1] ?? '';
  return after.split(/\n  (?:private |public )?[a-zA-Z]+\(/)[0] ?? '';
}

describe('GameScene uses the exit rules', () => {
  it('can find the methods it is checked on', () => {
    // If this fails a split has stopped finding its method and every
    // assertion below it is checking an empty string.
    for (const m of ['openPathsOverlay', 'openRewildingOverlay', 'commitRewilding', 'openAdoptionMatchOverlay', 'checkBadges']) {
      expect(method(m).length, m).toBeGreaterThan(200);
    }
  });

  it('tells the Paths panel which paths the species has', () => {
    const paths = method('openPathsOverlay');
    expect(paths).toContain('canRehome: exitsForSpecies(animal.species).adopt');
    expect(paths).toContain('canRewild: exitsForSpecies(animal.species).rewild');
  });

  it('sends the ceremony words from game-logic, built for this animal', () => {
    const overlay = method('openRewildingOverlay');
    expect(overlay).toContain('rewildingCopy(animal.name, plan)');
    expect(overlay).toContain('rewildingPlanFor(animal.species)');
  });

  it('commits a release through game-logic, not by pushing onto the store', () => {
    const commit = method('commitRewilding');
    expect(commit).toContain('commitRewildingLogic(animal, this.store)');
    expect(commit).not.toContain('this.store.rewilded.push');
    expect(commit).not.toContain('this.store.animals.splice');
  });

  it('only opens the ceremony at a habitat the animal belongs to', () => {
    const arrival = GAME_SCENE.split("case 'rewilding': {")[1]?.split("case 'collection'")[0] ?? '';
    expect(arrival).toContain('canReleaseAt(animal.species, dest.id)');
    // The old line opened it for whoever was aboard.
    expect(arrival).not.toMatch(/if \(animal\) \{ this\.openRewildingOverlay\(animal\); return; \}/);
  });

  it('sends an animal nobody adopts to the wild rather than to an empty office', () => {
    const match = method('openAdoptionMatchOverlay');
    expect(match).toContain('!isAdoptableSpecies(animal.species)');
    expect(match.indexOf('openRewildingOverlay')).toBeLessThan(match.indexOf("scene.launch('AdoptionMatchScene'"));
  });

  it('counts species badges across everyone rescued, not only who is in the building', () => {
    const badges = method('checkBadges');
    for (const species of ['cat', 'dog', 'bunny', 'fox', 'snake', 'parrot', 'bat']) {
      expect(badges, species).toContain(`lifetimeRescuedCount('${species}', this.store)`);
    }
    // The line this replaced, for every species at once.
    expect(badges).not.toMatch(/this\.store\.animals\.filter\(\(a\) => a\.species ===/);
  });
});

// ── Running the two pages ──────────────────────────────────────

const listeners: Array<EventListenerOrEventListenerObject> = [];
const realAdd = window.addEventListener.bind(window);

/** Put the page in the document, let jsdom run its script, and return a way to message it. */
function mount(file: string, query = ''): (payload: Record<string, unknown>) => void {
  const html = fs.readFileSync(path.join(PUBLIC, 'admin', file), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  // Scripts are taken out of the parsed page, so that they run once, when
  // they are put back below, and not on the way in.
  const scripts = [...parsed.body.querySelectorAll('script')].map((s) => s.textContent ?? '');
  parsed.body.querySelectorAll('script').forEach((s) => s.remove());
  document.body.replaceChildren(...[...parsed.body.childNodes].map((n) => document.importNode(n, true)));

  window.history.pushState({}, '', `/admin/${file}${query}`);
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions) => {
    if (type === 'message') listeners.push(fn);
    return realAdd(type, fn, opts);
  }) as typeof window.addEventListener;
  try {
    for (const code of scripts) {
      // A function wrapper, because the pages declare top-level `const`s and
      // a second mount in the same window would otherwise redeclare them.
      const el = document.createElement('script');
      el.textContent = `(function () {\n${code}\n})();`;
      document.body.appendChild(el);
    }
  } finally {
    window.addEventListener = realAdd as typeof window.addEventListener;
  }
  return (payload) => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'arc-game-host', type: 'init', payload },
    }));
  };
}

afterEach(() => {
  for (const fn of listeners.splice(0)) window.removeEventListener('message', fn);
  document.body.replaceChildren();
});

const card = (name: 'rehome' | 'rewild' | 'work') =>
  document.querySelector<HTMLButtonElement>(`.path-card[data-path="${name}"]`);

/** What the Paths panel is sent for a species — the scene's own payload shape. */
function pathsInit(species: Parameters<typeof exitsForSpecies>[0], name: string) {
  return {
    animalName: name,
    animalSpecies: species,
    bond: 80,
    canRehome: exitsForSpecies(species).adopt,
    canRewild: exitsForSpecies(species).rewild,
    habitatPhrase: rewildingPlanFor(species)?.habitatPhrase,
  };
}

describe('the Paths panel', () => {
  it('starts with the wild locked and everything drawn, so a page that hears nothing promises nothing', () => {
    mount('paths.html', '?embed=1');
    expect(card('rehome')).not.toBeNull();
    expect(card('rehome')?.hidden).toBe(false);
    expect(card('rewild')?.hidden).toBe(false);
    expect(card('rewild')?.querySelector('.path-state')?.classList.contains('path-state-locked')).toBe(true);
  });

  it('offers a hedgehog the wild and no forever family', () => {
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('hedgehog', 'Bramble'));

    expect(card('rehome')?.hidden).toBe(true);
    expect(card('rewild')?.hidden).toBe(false);
    const state = card('rewild')?.querySelector('.path-state');
    expect(state?.classList.contains('path-state-locked')).toBe(false);
    expect(state?.textContent).toBe('Choose this');
    expect(card('rewild')?.querySelector('.path-blurb')?.textContent).toBe('Take Bramble home to the woods');
  });

  it('offers a cat or a dog the family and not the wild', () => {
    for (const species of ['cat', 'dog'] as const) {
      const send = mount('paths.html', '?embed=1');
      send(pathsInit(species, 'Tabby'));
      expect(card('rehome')?.hidden, species).toBe(false);
      expect(card('rewild')?.hidden, species).toBe(true);
    }
  });

  it('offers a bunny, a parrot and a snake both', () => {
    for (const species of ['bunny', 'parrot', 'snake'] as const) {
      const send = mount('paths.html', '?embed=1');
      send(pathsInit(species, 'Pip'));
      expect(card('rehome')?.hidden, species).toBe(false);
      expect(card('rewild')?.hidden, species).toBe(false);
      expect(card('rewild')?.querySelector('.path-state-locked'), species).toBeNull();
    }
  });

  it('lays the cards that are left across the row', () => {
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('hedgehog', 'Bramble'));
    const grid = document.querySelector<HTMLElement>('.paths-grid');
    expect(grid?.style.getPropertyValue('--path-cards')).toBe('2');

    const send2 = mount('paths.html', '?embed=1');
    send2(pathsInit('bunny', 'Pip'));
    expect(document.querySelector<HTMLElement>('.paths-grid')?.style.getPropertyValue('--path-cards')).toBe('3');
  });

  it('leaves all three cards alone when the host says nothing about them', () => {
    const send = mount('paths.html', '?embed=1');
    send({ animalName: 'Pip' });
    expect(card('rehome')?.hidden).toBe(false);
    expect(card('rewild')?.hidden).toBe(false);
    expect(card('rewild')?.querySelector('.path-state-locked')).not.toBeNull();
  });
});

describe('the release ceremony', () => {
  const text = (id: string) => document.getElementById(id)?.textContent ?? '';

  function ceremonyFor(species: Parameters<typeof rewildingPlanFor>[0], name: string) {
    const plan = rewildingPlanFor(species);
    if (!plan) throw new Error(`no plan for ${species}`);
    const send = mount('rewilding.html', '?embed=1');
    send({
      animalId: 'x',
      animalName: name,
      animalSpriteSrc: `/assets/animals/${species}-sheltered.png`,
      bond: 90,
      copy: rewildingCopy(name, plan),
    });
  }

  it('reads as a good ending for a hedgehog', () => {
    ceremonyFor('hedgehog', 'Bramble');
    expect(text('farewell-title')).toBe('A wild home for Bramble');
    expect(text('farewell-subtitle')).toBe('Bramble is going home to the woods');
    expect(text('scroll-body')).toBe(
      "Thank you for taking such good care of me. Now I'm going home to the woods, where I belong. " +
      "I'll be so happy there! I might pop back to say hello.",
    );
    expect(text('scroll-sign')).toBe('Your friend always — Bramble');
    expect(text('release-label')).toBe('WAVE THEM OFF!');
    expect(text('bond-remember-text')).toBe('Bramble will remember you');
  });

  it('names Simeon & Karo in a bat’s ending', () => {
    ceremonyFor('bat', 'Dusk');
    expect(text('farewell-subtitle')).toBe('Simeon & Karo will take Dusk home to the deep forest');
    expect(text('scroll-body')).toContain('Simeon & Karo will take me home to the deep forest');
  });

  it('no longer says "Farewell" or "her" or a meadow, whoever is going', () => {
    for (const species of ['fox', 'bunny', 'parrot', 'bat', 'snake', 'hedgehog'] as const) {
      ceremonyFor(species, 'Pip');
      const everything = [
        text('farewell-title'), text('farewell-subtitle'), text('scroll-body'),
        text('scroll-sign'), text('release-label'), text('bond-remember-text'),
      ].join(' ');
      expect(everything, species).not.toMatch(/farewell|\bher\b|\bshe\b|meadow|release/i);
    }
  });

  it('says nothing a particular animal could contradict when the host sends no words', () => {
    const send = mount('rewilding.html', '?embed=1');
    send({ animalName: 'Pip', bond: 50 });
    expect(text('farewell-title')).toBe('A wild home for Pip');
    expect(text('release-label')).toBe('WAVE THEM OFF!');
    expect(text('scroll-body')).not.toMatch(/\b(her|she|meadow|moor|woods|sea|forest|wetlands)\b/i);
  });
});
