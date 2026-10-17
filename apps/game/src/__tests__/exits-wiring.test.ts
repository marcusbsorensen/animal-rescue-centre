import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  exitsForAnimal,
  placementCard,
  placementCopy,
  placementPlanFor,
  rewildingCopy,
  rewildingPlanForAnimal,
} from '@arc/game-logic';
import { HOG_HOSPITAL_NAME } from '@arc/game-logic';
import type { ExitSubject } from '@arc/game-logic';

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
    for (const m of [
      'openPathsOverlay', 'openRewildingOverlay', 'commitRewilding', 'openAdoptionMatchOverlay', 'checkBadges',
      'openPlacementOverlay', 'commitPlacement',
    ]) {
      expect(method(m).length, m).toBeGreaterThan(200);
    }
  });

  it('tells the Paths panel which paths this animal has, not only its species', () => {
    // The animal, because a fox that cannot be released has different paths
    // from one that can.
    const paths = method('openPathsOverlay');
    expect(paths).toContain('const exits = exitsForAnimal(animal)');
    expect(paths).toContain('canRehome: exits.adopt');
    expect(paths).toContain('canRewild: exits.rewild');
    expect(paths).toContain('placementPlanFor(animal)');
    expect(paths).toContain('placementCard(animal.name, placement)');
    expect(paths).not.toContain('exitsForSpecies');
  });

  it('opens the keepers’ ceremony from the Paths card', () => {
    const paths = method('openPathsOverlay');
    const branch = paths.split("action === 'aspire-place'")[1]?.split("action === 'aspire-stay'")[0] ?? '';
    expect(branch).toContain('this.openPlacementOverlay(animal)');
  });

  it('sends the ceremony words from game-logic, built for this animal', () => {
    const overlay = method('openRewildingOverlay');
    expect(overlay).toContain('rewildingCopy(animal.name, plan)');
    // Asked of the animal, so one that cannot be released has no plan.
    expect(overlay).toContain('rewildingPlanForAnimal(animal)');
    expect(overlay).not.toContain('rewildingPlanFor(animal.species)');
  });

  it('sends the keepers’ ceremony words from game-logic, on the release page', () => {
    const overlay = method('openPlacementOverlay');
    expect(overlay).toContain('placementPlanFor(animal)');
    expect(overlay).toContain('placementCopy(animal.name, plan)');
    expect(overlay).toContain("mountInGame('rewilding'");
  });

  it('commits a placement through game-logic, not by pushing onto the store', () => {
    const commit = method('commitPlacement');
    expect(commit).toContain('commitPlacementLogic(animal, this.store)');
    expect(commit).not.toContain('this.store.rehomed.push');
    expect(commit).not.toContain('this.store.animals.splice');
  });

  it('commits a release through game-logic, not by pushing onto the store', () => {
    const commit = method('commitRewilding');
    expect(commit).toContain('commitRewildingLogic(animal, this.store)');
    expect(commit).not.toContain('this.store.rewilded.push');
    expect(commit).not.toContain('this.store.animals.splice');
  });

  it('only opens the ceremony at a habitat the animal belongs to', () => {
    const arrival = GAME_SCENE.split("case 'rewilding': {")[1]?.split("case 'collection'")[0] ?? '';
    // The animal, not its species: one that cannot be released is not let go.
    expect(arrival).toContain('canReleaseAt(animal, dest.id)');
    expect(arrival).not.toContain('canReleaseAt(animal.species');
    // The old line opened it for whoever was aboard.
    expect(arrival).not.toMatch(/if \(animal\) \{ this\.openRewildingOverlay\(animal\); return; \}/);
  });

  it('only opens the keepers’ ceremony at a place that takes the animal', () => {
    const arrival = GAME_SCENE.split("case 'placement': {")[1]?.split("case 'collection'")[0] ?? '';
    expect(arrival).toContain('canPlaceAt(animal, dest.id)');
    expect(arrival).toContain('this.openPlacementOverlay(animal)');
    expect(arrival).not.toMatch(/if \(animal\) \{ this\.openPlacementOverlay\(animal\); return; \}/);
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

const card = (name: 'rehome' | 'rewild' | 'place' | 'work') =>
  document.querySelector<HTMLButtonElement>(`.path-card[data-path="${name}"]`);

/**
 * What the Paths panel is sent for an animal — the scene's own payload shape.
 * `lasting` is an animal that cannot be released.
 */
function pathsInit(species: ExitSubject['species'], name: string, lasting = false) {
  const animal: ExitSubject = { species, chronicIllness: lasting };
  const exits = exitsForAnimal(animal);
  const placement = placementPlanFor(animal);
  return {
    animalName: name,
    animalSpecies: species,
    bond: 80,
    canRehome: exits.adopt,
    canRewild: exits.rewild,
    habitatPhrase: rewildingPlanForAnimal(animal)?.habitatPhrase,
    place: placement ? placementCard(name, placement) : undefined,
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

  it('offers a bunny and a snake both', () => {
    for (const species of ['bunny', 'snake'] as const) {
      const send = mount('paths.html', '?embed=1');
      send(pathsInit(species, 'Pip'));
      expect(card('rehome')?.hidden, species).toBe(false);
      expect(card('rewild')?.hidden, species).toBe(false);
      expect(card('rewild')?.querySelector('.path-state-locked'), species).toBeNull();
    }
  });

  it('offers a parrot the family and never the wild', () => {
    // A parrot is not British wildlife: letting one go is illegal and harms
    // native birds. Whatever else changes, this card stays off.
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('parrot', 'Pip'));
    expect(card('rehome')?.hidden).toBe(false);
    expect(card('rewild')?.hidden).toBe(true);
    expect(card('place')?.hidden).toBe(true);
  });

  it('offers a healthy fox the wild and not the keepers', () => {
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('fox', 'Rusty'));
    expect(card('rehome')?.hidden).toBe(true);
    expect(card('rewild')?.hidden).toBe(false);
    expect(card('place')?.hidden).toBe(true);
  });

  it('offers a fox that cannot be released its keepers and not the wild', () => {
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('fox', 'Rusty', true));
    expect(card('rehome')?.hidden).toBe(true);
    expect(card('rewild')?.hidden).toBe(true);
    const place = card('place');
    expect(place?.hidden).toBe(false);
    expect(place?.querySelector('.path-name')?.textContent).toBe('A safe home');
    expect(place?.querySelector('.path-blurb')?.textContent).toMatch(/will look after Rusty$/);
    expect(place?.querySelector('.path-badge')?.textContent).toBeTruthy();
    expect(place?.querySelector('.path-state')?.textContent).toBe('Choose this');
  });

  it('offers a hedgehog that cannot be released the hog hospital', () => {
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('hedgehog', 'Bramble', true));
    expect(card('rewild')?.hidden).toBe(true);
    expect(card('place')?.hidden).toBe(false);
    expect(card('place')?.querySelector('.path-badge')?.textContent).toBe('🦔');
  });

  it('tells the host when the keepers’ card is chosen', async () => {
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('fox', 'Rusty', true));
    const heard: unknown[] = [];
    const listen = (e: MessageEvent) => { if (e.data?.source === 'arc-game') heard.push(e.data); };
    window.addEventListener('message', listen);
    card('place')?.click();
    // jsdom delivers a same-window postMessage asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.removeEventListener('message', listen);
    expect(heard).toEqual([{ source: 'arc-game', type: 'aspire-place', payload: { path: 'place' } }]);
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

  it('lays a snake’s four cards two by two', () => {
    const send = mount('paths.html', '?embed=1');
    send(pathsInit('snake', 'Noodle'));
    const grid = document.querySelector<HTMLElement>('.paths-grid');
    expect(grid?.style.getPropertyValue('--path-cards')).toBe('4');
    expect(grid?.dataset.cards).toBe('4');
    expect(card('place')?.hidden).toBe(false);
  });

  it('starts with the keepers’ card hidden, so a page that hears nothing promises nothing', () => {
    mount('paths.html', '?embed=1');
    expect(card('place')?.hidden).toBe(true);
    const send = mount('paths.html', '?embed=1');
    send({ animalName: 'Pip' });
    expect(card('place')?.hidden).toBe(true);
  });

  it('leaves all three cards alone when the host says nothing about them', () => {
    const send = mount('paths.html', '?embed=1');
    send({ animalName: 'Pip' });
    expect(card('rehome')?.hidden).toBe(false);
    expect(card('rewild')?.hidden).toBe(false);
    expect(card('rewild')?.querySelector('.path-state-locked')).not.toBeNull();
  });
});

describe('the keepers’ ceremony', () => {
  const text = (id: string) => document.getElementById(id)?.textContent ?? '';

  function placementFor(species: ExitSubject['species'], name: string) {
    const plan = placementPlanFor({ species, chronicIllness: true });
    if (!plan) throw new Error(`no placement for ${species}`);
    const send = mount('rewilding.html', '?embed=1');
    send({
      animalId: 'x',
      animalName: name,
      animalSpriteSrc: `/assets/animals/${species}-sheltered.png`,
      bond: 90,
      copy: placementCopy(name, plan),
    });
    return plan;
  }

  it('reads as a safe home, on the same page as a release', () => {
    const plan = placementFor('hedgehog', 'Bramble');
    expect(text('farewell-title')).toBe('A safe home for Bramble');
    expect(text('farewell-subtitle')).toBe(`${plan.name} will look after Bramble`);
    expect(text('scroll-body')).toContain(`Now I'm going to ${plan.name}.`);
    expect(text('scroll-sign')).toBe('Your friend always — Bramble');
    expect(text('release-label')).toBe('WAVE THEM OFF!');
    expect(text('bond-remember-text')).toBe('Bramble will remember you');
  });

  it('visits the keepers, not a wild home', () => {
    const plan = placementFor('fox', 'Rusty');
    expect(text('bond-visit-text')).toBe(`Visit ${plan.name} any time`);
    expect(text('bond-visit-text')).not.toMatch(/wild home/i);
  });

  it('says nothing of the wild, a release or a family, whoever is going', () => {
    for (const species of ['fox', 'bat', 'snake', 'hedgehog'] as const) {
      placementFor(species, 'Pip');
      const everything = [
        text('farewell-title'), text('farewell-subtitle'), text('scroll-body'),
        text('scroll-sign'), text('release-label'), text('bond-remember-text'), text('bond-visit-text'),
      ].join(' ');
      expect(everything, species).not.toMatch(/farewell|\bher\b|\bshe\b|meadow|release|\bwild\b|adopt|family/i);
    }
  });
});

describe('the release ceremony', () => {
  const text = (id: string) => document.getElementById(id)?.textContent ?? '';

  function ceremonyFor(species: ExitSubject['species'], name: string) {
    const plan = rewildingPlanForAnimal({ species });
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
    expect(text('farewell-subtitle')).toBe(`${HOG_HOSPITAL_NAME} will take Bramble home to the woods`);
    expect(text('scroll-body')).toBe(
      `Thank you for taking such good care of me. ${HOG_HOSPITAL_NAME} will take me home to the woods, where I belong. ` +
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
    for (const species of ['fox', 'bunny', 'bat', 'snake', 'hedgehog'] as const) {
      ceremonyFor(species, 'Pip');
      const everything = [
        text('farewell-title'), text('farewell-subtitle'), text('scroll-body'),
        text('scroll-sign'), text('release-label'), text('bond-remember-text'),
      ].join(' ');
      expect(everything, species).not.toMatch(/farewell|\bher\b|\bshe\b|meadow|release/i);
    }
  });

  it('keeps its own line about visiting a wild home', () => {
    ceremonyFor('hedgehog', 'Bramble');
    expect(text('bond-visit-text')).toBe('Visit their wild home any time');
  });

  it('says nothing a particular animal could contradict when the host sends no words', () => {
    const send = mount('rewilding.html', '?embed=1');
    send({ animalName: 'Pip', bond: 50 });
    expect(text('farewell-title')).toBe('A wild home for Pip');
    expect(text('release-label')).toBe('WAVE THEM OFF!');
    expect(text('scroll-body')).not.toMatch(/\b(her|she|meadow|moor|woods|sea|forest|wetlands)\b/i);
  });
});
