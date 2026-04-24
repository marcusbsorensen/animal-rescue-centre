/**
 * UpdateBanner — painted wooden "new version ready" sign with a playful
 * bat hanging off the left edge. Pops down from the top of the screen
 * when vite-plugin-pwa detects a waiting service worker, and a single
 * tap on "Refresh!" skips-waiting the SW and reloads.
 *
 * Styled inline (no global CSS) so the module is self-contained and
 * non-interfering if the auto-update never fires.
 */

let active: HTMLDivElement | null = null;

export function showUpdateBanner(onRefresh: () => void): void {
  if (active) return;

  const root = document.createElement('div');
  root.id = 'arc-update-banner';
  root.style.cssText = [
    'position: fixed',
    'top: 14px',
    'left: 50%',
    'transform: translateX(-50%) translateY(-200%)',
    'z-index: 9997',                         // below iframe overlays
    'pointer-events: none',                  // children opt in
    'font-family: "Chalkboard SE", "Chalkboard", "Kalam", "Fredoka", system-ui, sans-serif',
    'transition: transform 0.55s cubic-bezier(.34,1.56,.64,1)',
  ].join(';');

  // Hanging rope (single strand from the top to the sign)
  const rope = document.createElement('div');
  rope.style.cssText = [
    'position: absolute',
    'top: -18px',
    'left: 50%',
    'transform: translateX(-50%) rotate(-1deg)',
    'width: 3px',
    'height: 18px',
    'background: linear-gradient(180deg, #6b4820, #3c2a18)',
    'border-radius: 2px',
  ].join(';');
  root.appendChild(rope);

  // The painted wooden sign itself — honey-amber plank with grooves,
  // iron nails in the corners.
  const sign = document.createElement('div');
  sign.style.cssText = [
    'position: relative',
    'pointer-events: auto',
    'display: flex',
    'align-items: center',
    'gap: 12px',
    'padding: 10px 18px 10px 14px',
    'background: ' +
      "linear-gradient(180deg, transparent 0%, transparent 29%, rgba(0,0,0,0.32) 29.5%, rgba(0,0,0,0.32) 30%, rgba(255,240,210,0.2) 30.3%, transparent 30.8%, transparent 69%, rgba(0,0,0,0.32) 69.5%, rgba(0,0,0,0.32) 70%, rgba(255,240,210,0.2) 70.3%, transparent 70.8%, transparent 100%), " +
      "linear-gradient(90deg, transparent 0%, transparent 24%, rgba(0,0,0,0.05) 25%, transparent 26%, transparent 74%, rgba(0,0,0,0.05) 75%, transparent 76%), " +
      "linear-gradient(180deg, #e7a84a 0%, #c88436 55%, #a2651c 100%)",
    'border: 2px solid #7a4b15',
    'border-radius: 10px',
    'box-shadow: 0 8px 20px rgba(0,0,0,0.35), inset 0 0 14px rgba(0,0,0,0.2), inset 0 2px 0 rgba(255,240,210,0.25)',
    'transform: rotate(-1.6deg)',
    'animation: arcSignSway 3s ease-in-out infinite',
    'transform-origin: top center',
  ].join(';');
  // Iron nails at top corners
  for (const side of ['left', 'right']) {
    const nail = document.createElement('div');
    nail.style.cssText = [
      'position: absolute',
      'top: 6px',
      `${side}: 8px`,
      'width: 7px',
      'height: 7px',
      'border-radius: 50%',
      'background: radial-gradient(circle at 30% 30%, #7b604a 0%, #3c2a18 70%, #1f140a 100%)',
      'box-shadow: 0 1px 2px rgba(0,0,0,0.4)',
    ].join(';');
    sign.appendChild(nail);
  }

  // The playful hanging bat — pipistrelle sheltered (folded-wing pose),
  // rotated 180° so it hangs upside-down off the sign's left edge.
  const bat = document.createElement('img');
  bat.src = '/assets/animals/bat-pipistrelle-sheltered.png';
  bat.alt = '';
  bat.style.cssText = [
    'position: absolute',
    'left: -28px',
    'bottom: -6px',
    'width: 58px',
    'height: auto',
    'transform: rotate(178deg)',
    'filter: drop-shadow(2px 2px 3px rgba(0,0,0,0.35))',
    'animation: arcBatSway 2.4s ease-in-out infinite',
    'transform-origin: top center',
  ].join(';');
  sign.appendChild(bat);

  // Text
  const text = document.createElement('div');
  text.style.cssText = [
    'color: #fffbe8',
    'text-shadow: 1px 2px 0 rgba(0,0,0,0.5)',
    'font-weight: 700',
    'font-size: 15px',
    'line-height: 1.15',
    'padding-left: 40px',   // leave room for the bat
    'white-space: nowrap',
  ].join(';');
  text.textContent = "Shiny new A.R.C.! Fresh stuff to play with ✨";
  sign.appendChild(text);

  // Refresh pill (honey-amber inset, cream text)
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.style.cssText = [
    'font: inherit',
    'font-weight: 700',
    'font-size: 13px',
    'color: #fffbe8',
    'text-shadow: 1px 1px 0 rgba(0,0,0,0.4)',
    'background: linear-gradient(180deg, #7ea063 0%, #5d7f4a 55%, #3f5d32 100%)',
    'border: 2px solid #3c5238',
    'border-radius: 999px',
    'padding: 5px 14px',
    'cursor: pointer',
    'box-shadow: inset 0 2px 0 rgba(255,240,210,0.25), 0 2px 4px rgba(0,0,0,0.3)',
  ].join(';');
  refreshBtn.textContent = 'Refresh!';
  refreshBtn.addEventListener('click', () => {
    onRefresh();
  });
  sign.appendChild(refreshBtn);

  // Small "later" text link
  const later = document.createElement('button');
  later.type = 'button';
  later.style.cssText = [
    'background: transparent',
    'border: none',
    'color: #fffbe8',
    'opacity: 0.85',
    'font: inherit',
    'font-family: "Caveat", cursive',
    'font-size: 14px',
    'cursor: pointer',
    'padding: 2px 4px',
  ].join(';');
  later.textContent = 'later';
  later.addEventListener('click', () => {
    root.style.transform = 'translateX(-50%) translateY(-200%)';
    setTimeout(() => {
      root.remove();
      active = null;
    }, 550);
  });
  sign.appendChild(later);

  root.appendChild(sign);

  // Keyframes — injected once per page.
  if (!document.getElementById('arc-update-banner-style')) {
    const style = document.createElement('style');
    style.id = 'arc-update-banner-style';
    style.textContent = `
      @keyframes arcSignSway {
        0%, 100% { transform: rotate(-1.6deg); }
        50%      { transform: rotate(1.2deg); }
      }
      @keyframes arcBatSway {
        0%, 100% { transform: rotate(178deg); }
        50%      { transform: rotate(183deg); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(root);
  active = root;
  // Small delay lets the transform transition actually animate the drop-in.
  requestAnimationFrame(() => {
    root.style.transform = 'translateX(-50%) translateY(0)';
  });
}
