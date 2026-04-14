// A.R.C. Room Anchor Editor — pure DOM, no innerHTML for dynamic content
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
const SPECIES = ['cat','dog','bunny','fox','bat','parrot','snake'];
const STATES  = ['sheltered','sleeping','eating','arriving'];
const PALETTE = [];
SPECIES.forEach(sp => STATES.forEach(st => PALETTE.push({ species: sp, state: st })));

let data = {};
let currentRoom = ROOMS[0].key;
let selectedAnchorEl = null;

const stage = document.getElementById('stage');
const bg = document.getElementById('bg');
const roomPicker = document.getElementById('roomPicker');
const palette = document.getElementById('palette');
const json = document.getElementById('json');
const anchorsList = document.getElementById('anchorsList');
const selectedPanel = document.getElementById('selectedPanel');

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

ROOMS.forEach(r => {
  const opt = el('option', { text: r.label });
  opt.value = r.key;
  roomPicker.appendChild(opt);
});
roomPicker.addEventListener('change', () => loadRoom(roomPicker.value));

PALETTE.forEach(p => {
  const chip = el('div', { class: 'chip' });
  chip.draggable = true;
  chip.dataset.species = p.species;
  chip.dataset.state = p.state;
  const img = el('img');
  img.src = `/assets/animals/${p.species}-${p.state}.png`;
  img.alt = `${p.species} ${p.state}`;
  img.addEventListener('error', () => { img.style.opacity = 0.3; });
  const l = el('div', { class: 'l', text: `${p.species} · ${p.state}` });
  chip.appendChild(img); chip.appendChild(l);
  chip.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-arc-sprite', JSON.stringify(p));
    e.dataTransfer.effectAllowed = 'copy';
  });
  palette.appendChild(chip);
});

stage.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  const raw = e.dataTransfer.getData('application/x-arc-sprite');
  if (!raw) return;
  const p = JSON.parse(raw);
  const rect = bg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  addAnchor(currentRoom, p.species, p.state, { x, y, scale: 1.0, facing: 'right' });
  renderAnchors();
  emitJson();
});

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

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const sel = selectedAnchorEl;
  if (!sel) return;
  const step = e.shiftKey ? 10 : 1;
  const rect = bg.getBoundingClientRect();
  const a = sel._anchor;
  let changed = true;
  if (e.key === 'ArrowLeft')  a.x -= step / rect.width;
  else if (e.key === 'ArrowRight') a.x += step / rect.width;
  else if (e.key === 'ArrowUp') a.y -= step / rect.height;
  else if (e.key === 'ArrowDown') a.y += step / rect.height;
  else if (e.key === '[') a.scale = Math.max(0.2, a.scale - 0.05);
  else if (e.key === ']') a.scale = Math.min(3.0, a.scale + 0.05);
  else if (e.key === 'f' || e.key === 'F') a.facing = a.facing === 'right' ? 'left' : 'right';
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    removeAnchor(sel._roomKey, sel._species, sel._state, sel._index);
    selectedAnchorEl = null;
    renderAnchors(); emitJson();
    return;
  } else changed = false;
  if (changed) { e.preventDefault(); renderAnchors(); emitJson(); }
});

function ensurePath(roomKey, species, state) {
  if (!data[roomKey]) data[roomKey] = {};
  if (!data[roomKey][species]) data[roomKey][species] = {};
  if (!data[roomKey][species][state]) data[roomKey][species][state] = [];
}
function addAnchor(roomKey, species, state, anchor) {
  ensurePath(roomKey, species, state);
  data[roomKey][species][state].push(anchor);
}
function removeAnchor(roomKey, species, state, i) {
  data[roomKey][species][state].splice(i, 1);
  if (data[roomKey][species][state].length === 0) delete data[roomKey][species][state];
  if (data[roomKey][species] && Object.keys(data[roomKey][species]).length === 0) delete data[roomKey][species];
}

function loadRoom(key) {
  currentRoom = key;
  const room = ROOMS.find(r => r.key === key);
  bg.src = room.bg;
  bg.onload = () => renderAnchors();
  selectedAnchorEl = null;
  renderSelectedPanel();
}

function renderAnchors() {
  Array.from(stage.querySelectorAll('.anchor')).forEach(n => n.remove());
  const room = data[currentRoom] || {};
  const rect = bg.getBoundingClientRect();
  if (!rect.width) return;
  const items = [];
  Object.entries(room).forEach(([species, states]) => {
    Object.entries(states).forEach(([state, anchors]) => {
      anchors.forEach((a, i) => items.push({ species, state, index: i, a }));
    });
  });
  items.forEach(({species, state, index, a}) => {
    const node = el('div', { class: 'anchor' });
    node.style.left = (a.x * 100) + '%';
    node.style.top  = (a.y * 100) + '%';
    const img = el('img');
    img.src = `/assets/animals/${species}-${state}.png`;
    img.style.transform = `scale(${a.scale * 0.3}) scaleX(${a.facing === 'left' ? -1 : 1})`;
    img.style.opacity = 0.92;
    img.addEventListener('error', () => { img.style.display = 'none'; });
    const dot = el('div', { class: 'dot' });
    const label = el('div', { class: 'label', text: `${species} · ${state}` });
    node.appendChild(img); node.appendChild(dot); node.appendChild(label);
    node._anchor = a; node._roomKey = currentRoom; node._species = species; node._state = state; node._index = index;
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
  const info = el('div', { style: { fontSize: '13px', marginBottom: '8px' } });
  const title = el('strong', { text: `${selectedAnchorEl._species} · ${selectedAnchorEl._state}` });
  info.appendChild(title);
  info.appendChild(el('br'));
  info.appendChild(document.createTextNode(`x: ${(a.x*100).toFixed(1)}% · y: ${(a.y*100).toFixed(1)}%`));
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
  Object.entries(room).forEach(([species, states]) => {
    Object.entries(states).forEach(([state, anchors]) => {
      anchors.forEach((a, i) => items.push({ species, state, index: i, a }));
    });
  });
  if (items.length === 0) {
    const empty = el('div', { class: 'empty', text: 'No anchors yet. Drag a sprite from the left.' });
    anchorsList.appendChild(empty);
    return;
  }
  items.forEach((it) => {
    const sel = selectedAnchorEl && selectedAnchorEl._species === it.species && selectedAnchorEl._state === it.state && selectedAnchorEl._index === it.index;
    const row = el('div', { class: 'item' + (sel ? ' selected' : '') });
    row.appendChild(el('span', { text: `${it.species} · ${it.state} #${it.index}` }));
    row.appendChild(el('span', { text: `(${(it.a.x*100).toFixed(0)}, ${(it.a.y*100).toFixed(0)})` }));
    row.addEventListener('click', () => {
      const anchorEls = Array.from(stage.querySelectorAll('.anchor'));
      const match = anchorEls.find(en => en._species === it.species && en._state === it.state && en._index === it.index);
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
  removeAnchor(selectedAnchorEl._roomKey, selectedAnchorEl._species, selectedAnchorEl._state, selectedAnchorEl._index);
  selectedAnchorEl = null;
  renderAnchors(); emitJson();
}
function emitJson() { json.value = JSON.stringify(data, null, 2); }

loadRoom(currentRoom);
emitJson();
window.addEventListener('resize', renderAnchors);
