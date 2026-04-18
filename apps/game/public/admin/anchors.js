// A.R.C. Room Anchor Editor — pure DOM, no innerHTML for dynamic content
//
// Data model (room-anchors.json):
//   {
//     "corridor":  { "__decor": { "sign-cat": [{ x, y, scale, facing }, ...], ... } },
//     "room-cat":  { "cat": { "sheltered": [{...}], "sleeping": [{...}] } },
//     "kitchen":   { "__decor": { "food-kibble": [{...}], ... } },
//     ...
//   }
//
// Animal anchors live at data[room][species][state]; decorative props
// (room signs, food bowls, etc.) live at data[room].__decor[key]. Keeping
// them in separate branches means the runtime animal-loader keeps working
// unchanged, and props can be consumed by the specific scene that cares.
const ROOMS = [
  { key: 'room-cat',    label: 'Cat room',    bg: '/assets/bg/bg-room-cat.png'   },
  { key: 'room-dog',    label: 'Dog room',    bg: '/assets/bg/bg-room-dog.png'   },
  { key: 'room-bunny',  label: 'Bunny room',  bg: '/assets/bg/bg-room-bunny.png' },
  { key: 'room-fox',    label: 'Fox room',    bg: '/assets/bg/bg-room-fox.png'   },
  { key: 'room-bat',    label: 'Bat room',    bg: '/assets/bg/bg-room-bat.png'   },
  { key: 'room-parrot', label: 'Parrot room', bg: '/assets/bg/bg-room-parrot.png'},
  { key: 'room-snake',  label: 'Snake room',  bg: '/assets/bg/bg-room-snake.png' },
  { key: 'corridor',    label: 'Corridor',    bg: '/assets/bg/bg-corridor.png'   },
  { key: 'kitchen',     label: 'Kitchen',     bg: '/assets/bg/bg-kitchen.png'    },
  { key: 'garden',      label: 'Garden',      bg: '/assets/bg/bg-garden.png'     },
];
const STATES = ['sheltered', 'sleeping', 'eating', 'arriving'];
const SPECIES = ['cat','dog','bunny','fox','bat','parrot','snake'];

// In-game baseline: animal sprite ~100 wide in 1280x720 viewport (~14% of
// height). Decor (room signs) is scaled relative to the bg width so a 1.0
// scale sign reads like the in-game corridor sign.
const BASE_SPRITE_FRACTION = 0.16;   // animals
const BASE_DECOR_FRACTION  = 0.12;   // decor (bg-height-relative)

let data = {};
let currentRoom = ROOMS[0].key;
let selectedAnchorEl = null;

const stage        = document.getElementById('stage');
const bg           = document.getElementById('bg');
const roomPicker   = document.getElementById('roomPicker');
const palette      = document.getElementById('palette');
const json         = document.getElementById('json');
const anchorsList  = document.getElementById('anchorsList');
const selectedPanel= document.getElementById('selectedPanel');
const paletteTitle = document.getElementById('paletteTitle');
const paletteHint  = document.getElementById('paletteHint');

// ── Helpers ────────────────────────────────────────────────
function el(tag, opts) {
  const n = document.createElement(tag);
  if (opts) {
    if (opts.class) n.className = opts.class;
    if (opts.text != null) n.textContent = opts.text;
    if (opts.attrs) for (const k in opts.attrs) n.setAttribute(k, opts.attrs[k]);
    if (opts.style) for (const k in opts.style) n.style[k] = opts.style[k];
  }
  return n;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// ── Scene-aware palette ────────────────────────────────────
// Returns `{ title, hint, items: [{type, ...}] }` for the currently selected
// scene. Palettes are intentionally narrow — you don't want to see cat
// sprites when dressing the corridor.
function paletteForScene(roomKey) {
  if (roomKey === 'corridor') {
    // Two categories for the corridor:
    //   1. Door signs (decor) — mark each species room
    //   2. Arriving animal sprites — newly-rescued animals stand in the
    //      corridor before they're welcomed in. Hand-placing their
    //      anchors lets the art direct where kids see them (e.g. near
    //      the entrance, on a rescue mat) rather than the runtime's
    //      procedural even-spacing.
    const items = [
      ...SPECIES.map(sp => ({
        type: 'decor', key: `sign-${sp}`, label: `${sp} sign`,
        src: `/assets/signs/sign-${sp}.png`,
      })),
      ...SPECIES.map(sp => ({
        type: 'animal', species: sp, state: 'arriving',
        src: `/assets/animals/${sp}-arriving.png`,
        label: `${sp} · arriving`,
      })),
    ];
    return {
      title: 'Signs + arriving sprites',
      hint:  'Signs for door slots, arriving sprites for where new rescues stand in the corridor.',
      items,
    };
  }
  if (roomKey === 'kitchen') {
    const foods = [
      'berries','bone','carrot','chicken','egg','fish','fruit','hay',
      'insects','kibble','lettuce','mouse','nuts','seeds','tuna',
    ];
    return {
      title: 'Food props',
      hint:  'Drop a food item onto a bowl or counter.',
      items: foods.map(f => ({
        type: 'decor', key: `food-${f}`, label: f,
        src: `/assets/food/food-${f}.png`,
      })),
    };
  }
  if (roomKey === 'garden') {
    // The garden holds bonded pets from ANY species, so we offer all
    // seven. Most pets in the garden are in `sheltered` or `sleeping`
    // state (deriveAnchorState returns those whenever hunger/tiredness
    // aren't urgent, which is most of the time for happy pets), so
    // those are the two states worth anchoring. `eating` is included
    // for variety — if a pet does get peckish, the art director can
    // anchor a bowl-side pose too.
    //
    // (Runtime calls anchors.pick('garden', species, visualState, i)
    // with modulo cycling across multiple anchors for the same species
    // and state — place as many as you like to get variety when
    // multiple pets of the same species coexist in the garden.)
    const gardenStates = ['sheltered', 'sleeping', 'eating'];
    const items = [];
    for (const sp of SPECIES) {
      for (const state of gardenStates) {
        items.push({
          type: 'animal', species: sp, state,
          src: `/assets/animals/${sp}-${state}.png`,
          label: `${sp} · ${state}`,
        });
      }
    }
    return {
      title: 'Garden pets',
      hint:  'Drop a pet sprite wherever that species should sit / snooze / nibble in the garden.',
      items,
    };
  }
  // room-<species>: show only that species' sprite states
  const species = roomKey.replace(/^room-/, '');
  return {
    title: `${species} sprites`,
    hint:  'Drag a state sprite to anchor where that pose should appear.',
    items: STATES.map(state => ({
      type: 'animal', species, state,
      src: `/assets/animals/${species}-${state}.png`,
      label: `${species} · ${state}`,
    })),
  };
}

function renderPalette() {
  clear(palette);
  const pal = paletteForScene(currentRoom);
  paletteTitle.textContent = pal.title;
  paletteHint.textContent  = pal.hint;
  if (pal.items.length === 0) {
    palette.appendChild(el('div', { class: 'empty', text: 'Nothing to place here.' }));
    return;
  }
  pal.items.forEach(item => {
    const chip = el('div', { class: 'chip' });
    chip.draggable = true;
    chip.dataset.payload = JSON.stringify(item);
    const img = el('img');
    img.src = item.src;
    img.alt = item.label;
    img.addEventListener('error', () => { img.style.opacity = 0.3; });
    const l = el('div', { class: 'l', text: item.label });
    chip.appendChild(img); chip.appendChild(l);
    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-arc-sprite', chip.dataset.payload);
      e.dataTransfer.effectAllowed = 'copy';
    });
    palette.appendChild(chip);
  });
}

// ── Room picker ────────────────────────────────────────────
ROOMS.forEach(r => {
  const opt = el('option', { text: r.label });
  opt.value = r.key;
  roomPicker.appendChild(opt);
});
roomPicker.addEventListener('change', () => loadRoom(roomPicker.value));

// ── Drop handling — scene-aware ────────────────────────────
stage.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  const raw = e.dataTransfer.getData('application/x-arc-sprite');
  if (!raw) return;
  const p = JSON.parse(raw);
  const rect = bg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  if (p.type === 'animal') {
    addAnimalAnchor(currentRoom, p.species, p.state, { x, y, scale: 1.0, facing: 'right' });
  } else {
    addDecorAnchor(currentRoom, p.key, { x, y, scale: 1.0, facing: 'right' });
  }
  renderAnchors();
  emitJson();
});

// ── Toolbar ────────────────────────────────────────────────
document.getElementById('exportJson').addEventListener('click', () => {
  const blob = new Blob([json.value], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'room-anchors.json';
  a.click();
});
document.getElementById('copyJson').addEventListener('click', () => {
  navigator.clipboard.writeText(json.value);
  alert('JSON copied.');
});
document.getElementById('loadJson').addEventListener('click', () => document.getElementById('jsonFile').click());
document.getElementById('jsonFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  data = JSON.parse(await file.text());
  renderAnchors(); emitJson();
});

// ── Keyboard controls (works for any selected anchor) ──────
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const sel = selectedAnchorEl;
  if (!sel) return;
  const step = e.shiftKey ? 10 : 1;
  const rect = bg.getBoundingClientRect();
  const a = sel._anchor;
  let changed = true;
  if      (e.key === 'ArrowLeft')  a.x -= step / rect.width;
  else if (e.key === 'ArrowRight') a.x += step / rect.width;
  else if (e.key === 'ArrowUp')    a.y -= step / rect.height;
  else if (e.key === 'ArrowDown')  a.y += step / rect.height;
  else if (e.key === '[')          a.scale = Math.max(0.2, a.scale - 0.05);
  else if (e.key === ']')          a.scale = Math.min(3.0, a.scale + 0.05);
  else if (e.key === 'f' || e.key === 'F') a.facing = a.facing === 'right' ? 'left' : 'right';
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected();
    return;
  } else changed = false;
  if (changed) { e.preventDefault(); renderAnchors(); emitJson(); }
});

// ── Data mutations ─────────────────────────────────────────
function ensureAnimalPath(roomKey, species, state) {
  if (!data[roomKey]) data[roomKey] = {};
  if (!data[roomKey][species]) data[roomKey][species] = {};
  if (!data[roomKey][species][state]) data[roomKey][species][state] = [];
}
function ensureDecorPath(roomKey, propKey) {
  if (!data[roomKey]) data[roomKey] = {};
  if (!data[roomKey].__decor) data[roomKey].__decor = {};
  if (!data[roomKey].__decor[propKey]) data[roomKey].__decor[propKey] = [];
}
function addAnimalAnchor(roomKey, species, state, anchor) {
  ensureAnimalPath(roomKey, species, state);
  data[roomKey][species][state].push(anchor);
}
function addDecorAnchor(roomKey, propKey, anchor) {
  ensureDecorPath(roomKey, propKey);
  data[roomKey].__decor[propKey].push(anchor);
}
function removeAnimalAnchor(roomKey, species, state, i) {
  data[roomKey][species][state].splice(i, 1);
  if (data[roomKey][species][state].length === 0) delete data[roomKey][species][state];
  if (data[roomKey][species] && Object.keys(data[roomKey][species]).length === 0) delete data[roomKey][species];
  // Clean up __decor holder if the room ends up empty apart from it
  if (data[roomKey] && Object.keys(data[roomKey]).length === 0) delete data[roomKey];
}
function removeDecorAnchor(roomKey, propKey, i) {
  data[roomKey].__decor[propKey].splice(i, 1);
  if (data[roomKey].__decor[propKey].length === 0) delete data[roomKey].__decor[propKey];
  if (Object.keys(data[roomKey].__decor).length === 0) delete data[roomKey].__decor;
  if (data[roomKey] && Object.keys(data[roomKey]).length === 0) delete data[roomKey];
}

// ── Room loading ───────────────────────────────────────────
function loadRoom(key) {
  currentRoom = key;
  const room = ROOMS.find(r => r.key === key);
  bg.src = room.bg;
  bg.onload = () => renderAnchors();
  selectedAnchorEl = null;
  renderPalette();
  renderSelectedPanel();
}

// ── Render ─────────────────────────────────────────────────
function renderAnchors() {
  Array.from(stage.querySelectorAll('.anchor')).forEach(n => n.remove());
  const room = data[currentRoom] || {};
  const rect = bg.getBoundingClientRect();
  if (!rect.width) return;

  const animalBaseH = rect.height * BASE_SPRITE_FRACTION;
  const decorBaseH  = rect.height * BASE_DECOR_FRACTION;

  // Flatten all placeable anchors so we can render them in a uniform loop.
  const items = [];
  Object.entries(room).forEach(([key, subtree]) => {
    if (key === '__decor') {
      Object.entries(subtree).forEach(([propKey, anchors]) => {
        anchors.forEach((a, i) => items.push({ kind: 'decor', propKey, index: i, a }));
      });
    } else {
      // key is a species; subtree is { state: [anchors] }
      Object.entries(subtree).forEach(([state, anchors]) => {
        anchors.forEach((a, i) => items.push({ kind: 'animal', species: key, state, index: i, a }));
      });
    }
  });

  items.forEach((item) => {
    const { kind, a } = item;
    const node = el('div', { class: 'anchor' });
    node.style.left = (a.x * 100) + '%';
    node.style.top  = (a.y * 100) + '%';

    const spriteH = (kind === 'animal' ? animalBaseH : decorBaseH) * a.scale;
    const img = el('img');
    img.src = kind === 'animal'
      ? `/assets/animals/${item.species}-${item.state}.png`
      : `/assets/signs/${item.propKey}.png`; // covers sign-* and fab-* in signs dir
    // fall back to food directory if the sign file 404s — lets kitchen
    // items render too. Simpler than branching per kitchen/corridor.
    img.addEventListener('error', () => {
      if (kind === 'decor' && img.src.includes('/signs/')) {
        img.src = img.src.replace('/signs/', '/food/');
      } else {
        img.style.display = 'none';
      }
    });
    img.style.position = 'absolute';
    img.style.left = '50%';
    img.style.bottom = '0';
    img.style.height = spriteH + 'px';
    img.style.width = 'auto';
    img.style.transform = `translateX(-50%) scaleX(${a.facing === 'left' ? -1 : 1})`;
    img.style.transformOrigin = 'bottom center';
    img.style.opacity = 0.92;

    const dot = el('div', { class: 'dot' });
    const labelText = kind === 'animal'
      ? `${item.species} · ${item.state}`
      : item.propKey;
    const label = el('div', { class: 'label', text: labelText });
    label.style.bottom = (spriteH + 6) + 'px';
    label.style.top = 'auto';

    node.appendChild(img); node.appendChild(dot); node.appendChild(label);
    node._anchor = a;
    node._roomKey = currentRoom;
    node._kind = kind;
    if (kind === 'animal') {
      node._species = item.species;
      node._state = item.state;
    } else {
      node._propKey = item.propKey;
    }
    node._index = item.index;
    node.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      selectAnchor(node);
      const startRect = bg.getBoundingClientRect();
      const onMove = (em) => {
        a.x = Math.max(0, Math.min(1, (em.clientX - startRect.left) / startRect.width));
        a.y = Math.max(0, Math.min(1, (em.clientY - startRect.top) / startRect.height));
        node.style.left = (a.x * 100) + '%';
        node.style.top = (a.y * 100) + '%';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        emitJson();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    stage.appendChild(node);
  });
  renderAnchorsList();
}

function selectAnchor(node) {
  if (selectedAnchorEl) selectedAnchorEl.classList.remove('selected');
  selectedAnchorEl = node;
  node.classList.add('selected');
  renderSelectedPanel();
  renderAnchorsList();
}

function renderSelectedPanel() {
  clear(selectedPanel);
  if (!selectedAnchorEl) {
    selectedPanel.className = 'empty';
    selectedPanel.textContent = 'Click an anchor to select.';
    return;
  }
  selectedPanel.className = '';
  const a = selectedAnchorEl._anchor;
  const titleText = selectedAnchorEl._kind === 'animal'
    ? `${selectedAnchorEl._species} · ${selectedAnchorEl._state}`
    : selectedAnchorEl._propKey;
  const info = el('div', { style: { fontSize: '13px', marginBottom: '8px' } });
  info.appendChild(el('strong', { text: titleText }));
  info.appendChild(el('br'));
  info.appendChild(document.createTextNode(`anchor at x: ${(a.x*100).toFixed(1)}%, y: ${(a.y*100).toFixed(1)}%`));
  info.appendChild(el('br'));
  info.appendChild(document.createTextNode(`scale: ${a.scale.toFixed(2)} · facing: ${a.facing}`));
  selectedPanel.appendChild(info);
  const row = el('div', { class: 'row' });
  const mk = (txt, fn, cls) => { const b = el('button', { text: txt }); if (cls) b.className = cls; b.addEventListener('click', fn); return b; };
  row.appendChild(mk('- scale', () => bump('scale', -0.1)));
  row.appendChild(mk('+ scale', () => bump('scale', 0.1)));
  row.appendChild(mk('flip', toggleFacing));
  row.appendChild(mk('Delete', deleteSelected, 'danger'));
  selectedPanel.appendChild(row);
}

function renderAnchorsList() {
  clear(anchorsList);
  const room = data[currentRoom] || {};
  const items = [];
  Object.entries(room).forEach(([key, subtree]) => {
    if (key === '__decor') {
      Object.entries(subtree).forEach(([propKey, anchors]) => {
        anchors.forEach((a, i) => items.push({ kind: 'decor', propKey, index: i, a }));
      });
    } else {
      Object.entries(subtree).forEach(([state, anchors]) => {
        anchors.forEach((a, i) => items.push({ kind: 'animal', species: key, state, index: i, a }));
      });
    }
  });
  if (items.length === 0) {
    anchorsList.appendChild(el('div', { class: 'empty', text: 'No anchors yet. Drag something from the left.' }));
    return;
  }
  items.forEach((it) => {
    let sel = false;
    if (selectedAnchorEl && selectedAnchorEl._kind === it.kind && selectedAnchorEl._index === it.index) {
      if (it.kind === 'animal') {
        sel = selectedAnchorEl._species === it.species && selectedAnchorEl._state === it.state;
      } else {
        sel = selectedAnchorEl._propKey === it.propKey;
      }
    }
    const row = el('div', { class: 'item' + (sel ? ' selected' : '') });
    const labelText = it.kind === 'animal'
      ? `${it.species} · ${it.state} #${it.index}`
      : `${it.propKey} #${it.index}`;
    row.appendChild(el('span', { text: labelText }));
    row.appendChild(el('span', { text: `(${(it.a.x*100).toFixed(0)}, ${(it.a.y*100).toFixed(0)})` }));
    row.addEventListener('click', () => {
      const anchorEls = Array.from(stage.querySelectorAll('.anchor'));
      const match = anchorEls.find(en => {
        if (en._kind !== it.kind || en._index !== it.index) return false;
        if (it.kind === 'animal') return en._species === it.species && en._state === it.state;
        return en._propKey === it.propKey;
      });
      if (match) selectAnchor(match);
    });
    anchorsList.appendChild(row);
  });
}

function bump(field, delta) {
  if (!selectedAnchorEl) return;
  selectedAnchorEl._anchor[field] = Math.max(0.2, Math.min(3, selectedAnchorEl._anchor[field] + delta));
  renderAnchors(); emitJson();
}
function toggleFacing() {
  if (!selectedAnchorEl) return;
  const a = selectedAnchorEl._anchor;
  a.facing = a.facing === 'right' ? 'left' : 'right';
  renderAnchors(); emitJson();
}
function deleteSelected() {
  if (!selectedAnchorEl) return;
  const sel = selectedAnchorEl;
  if (sel._kind === 'animal') {
    removeAnimalAnchor(sel._roomKey, sel._species, sel._state, sel._index);
  } else {
    removeDecorAnchor(sel._roomKey, sel._propKey, sel._index);
  }
  selectedAnchorEl = null;
  renderAnchors(); emitJson();
}
function emitJson() { json.value = JSON.stringify(data, null, 2); }

// Auto-load the currently-deployed room-anchors.json on startup so the
// editor opens with your saved positions instead of a blank slate. Falls
// back to empty data if the file doesn't exist yet.
async function bootstrap() {
  try {
    const res = await fetch('/data/room-anchors.json', { cache: 'no-store' });
    if (res.ok) data = await res.json();
  } catch { /* no existing file — start empty */ }
  loadRoom(currentRoom);
  emitJson();
}
bootstrap();
window.addEventListener('resize', renderAnchors);
