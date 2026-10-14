import { test, expect } from '@playwright/test';

/**
 * Every family in the adoption office can be read whole, clear of the pinned
 * "Not yet" footer.
 *
 * The footer is sticky at the foot of the screen and the families scroll under
 * it. On a phone held sideways each card was 346-393px tall (its 4:3 portrait
 * the card's whole width) against 286-330px of screen above the footer, so no
 * card could ever be seen whole: the family's name and blurb were always under
 * the footer, and a real roster only made more of them. This posts a roster of
 * eight families the way GameScene does (`applicants`, after the page loads),
 * and for each card looks for a scroll position that puts all of it between the
 * top of the screen and the top of the footer.
 */

const SIZES = [
  { width: 780, height: 360 },
  { width: 667, height: 375 },
  { width: 874, height: 402 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
] as const;

const CAST = ['01-priya', '02-jan', '03-nova', '04-babcia', '05-finn', '06-hiro', '07-patel-greens', '08-walkers'];
const APPLICANTS = CAST.map((id, i) => ({
  householdId: id,
  name: ['Priya Kaur', 'Jan Novak', 'Nova Adebayo', 'Babcia Basia Kowalska', 'Finn Byrne', 'Hiroshi Nakamura', 'Anjali & Sam Patel-Green', 'The Walkers'][i],
  avatarSrc: `/admin/scene-assets/cast/${id}.png`,
  blurb: 'A quiet home with a sunny window seat, and time every day for a walk and a cuddle with a calm new friend.',
}));

for (const size of SIZES) {
  test(`every family clears the "Not yet" footer at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/admin/adoption-office.html?embed=1&animalName=Biscuit');
    await page.evaluate((applicants) => {
      window.postMessage({ source: 'arc-adoption-office-host', type: 'applicants', payload: { applicants } }, '*');
    }, APPLICANTS);
    await page.waitForFunction((n) => document.querySelectorAll('.h-card').length === n, APPLICANTS.length);
    await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined))));
    await page.evaluate(() => { for (const a of document.getAnimations()) a.finish(); });

    const buried: string[] = await page.evaluate(() => {
      const scroller = document.querySelector('.device > *') as HTMLElement;
      const footer = document.querySelector('.footer-row') as HTMLElement;
      const max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = 0;
      const room = Math.round(footer.getBoundingClientRect().top);   // above the footer while it is pinned
      const out: string[] = [];
      for (const card of Array.from(document.querySelectorAll<HTMLElement>('.h-card'))) {
        let clear = false;
        for (let y = 0; y <= max + 4 && !clear; y += 4) {
          scroller.scrollTop = Math.min(y, max);
          const r = card.getBoundingClientRect();
          clear = r.top >= 0 && r.bottom <= footer.getBoundingClientRect().top;
        }
        if (!clear) {
          const name = card.querySelector('.h-name')?.textContent ?? '?';
          out.push(`${name}: ${Math.round(card.getBoundingClientRect().height)}px tall, with ${room}px of screen above the pinned footer`);
        }
      }
      return out;
    });
    expect(buried, buried.join('\n')).toEqual([]);
  });
}
