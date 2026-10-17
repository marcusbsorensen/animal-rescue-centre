"""Checks site/ at 1280, 768 and 390 under the strict CSP. Serve site/ with
`python3 -m http.server 8123` first, then:
    python3 site-directions/_tools/check-site.py http://localhost:8123 site/shots
"""
import json, sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8123'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'"
ORIGIN = urlparse(BASE).netloc
BANNED = ['children', 'gentle', 'calm', 'coming soon']

PROBE = r"""
() => {
  const out = {};
  out.scroll = document.documentElement.scrollWidth - window.innerWidth;
  const vis = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0; };
  // every visible text node: font size, and words per rendered line for body text
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  out.small = []; out.long = []; let maxWords = 0;
  const perEl = new Map();
  while (walker.nextNode()) {
    const n = walker.currentNode; if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!vis(el) || el.closest('.skip,[hidden]')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) out.small.push([el.tagName, n.textContent.trim().slice(0, 40), fs]);
    if (el.closest('h1,h2,h3,.btn,.store,nav,svg')) continue;  // titles and buttons are not body text
    const block = el.closest('p,li,dd,dt,strong,span.t,div') || el;
    const re = /\S+/g; let m;
    if (!perEl.has(block)) perEl.set(block, new Map());
    const lines = perEl.get(block);
    while ((m = re.exec(n.textContent))) {
      const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const rect = r.getClientRects()[0]; if (!rect) continue;
      const key = Math.round(rect.top / 4);
      const l = lines.get(key) || { words: [], left: rect.left, right: rect.right };
      l.words.push(m[0]); l.left = Math.min(l.left, rect.left); l.right = Math.max(l.right, rect.right);
      lines.set(key, l);
    }
  }
  out.lineWidths = [];
  for (const [block, lines] of perEl) for (const l of lines.values()) {
    maxWords = Math.max(maxWords, l.words.length);
    out.lineWidths.push(l.right - l.left);
    if (l.words.length > 8) out.long.push(l.words.join(' '));
  }
  out.maxWords = maxWords;
  out.maxLinePx = Math.max(...out.lineWidths); delete out.lineWidths;
  out.titles = [...document.querySelectorAll('title,h1,h2,h3,.fact strong,.worry strong,dt,.card h3')]
    .map(e => e.textContent.replace(/\[check\]/g, '').trim()).filter(t => t.includes(','));
  const txt = document.body.innerText.toLowerCase();
  out.banned = %s.filter(w => txt.includes(w));
  // contrast: text colour against the nearest solid background
  const rgb = c => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  out.lowContrast = [];
  const seen = new Set();
  document.querySelectorAll('body *').forEach(el => {
    if (!vis(el) || el.closest('[hidden]') || seen.has(el)) return;
    const own = [...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()); if (!own) return;
    seen.add(el);
    const s = getComputedStyle(el); const fg = rgb(s.color);
    let p = el, bg = null;
    while (p) { const b = rgb(getComputedStyle(p).backgroundColor); if (b.length === 4 ? b[3] > .9 : b.length === 3) { bg = b; break; } p = p.parentElement; }
    if (!bg) bg = [255, 255, 255];
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5)) out.lowContrast.push([el.tagName, el.textContent.trim().slice(0, 30), ratio.toFixed(2)]);
  });
  out.noAlt = [...document.images].filter(i => !i.getAttribute('alt')).map(i => i.src);
  return out;
}
""" % json.dumps(BANNED)

def run(paths=('/', '/404.html')):
    results = {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        for path in paths:
            for w, h in ((1280, 900), (768, 1024), (390, 844)):
                ctx = b.new_context(viewport={'width': w, 'height': h})
                page = ctx.new_page()
                foreign, violations, bytes_ = [], [], [0]
                page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI))")
                def route(r):
                    if urlparse(r.request.url).netloc != ORIGIN:
                        foreign.append(r.request.url); return r.abort()
                    resp = r.fetch()
                    hdrs = dict(resp.headers); hdrs['content-security-policy'] = CSP
                    r.fulfill(response=resp, headers=hdrs)
                page.route('**/*', route)
                page.on('response', lambda resp: bytes_.__setitem__(0, bytes_[0] + len(resp.body() or b'')))
                page.on('console', lambda m: violations.append(m.text) if 'Content Security Policy' in m.text else None)
                page.goto(BASE + path, wait_until='networkidle')
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)"); page.wait_for_timeout(400)
                page.wait_for_load_state('networkidle')
                out = page.evaluate(PROBE)
                out['csp'] = violations + (page.evaluate('window.__csp || []'))
                out['foreign'] = foreign
                out['kb'] = round(page.evaluate("performance.getEntriesByType('navigation').concat(performance.getEntriesByType('resource')).reduce((a, e) => a + (e.decodedBodySize || 0), 0)") / 1024)
                out['cookies'] = len(ctx.cookies())
                out['play'] = page.eval_on_selector('[data-play]', 'a => a.href')
                results[f'{path} @{w}'] = out
                if SHOTS and path == '/' and w in (1280, 390):
                    page.evaluate("document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); document.querySelector('.top').style.position = 'relative'"); page.wait_for_timeout(300)
                    page.screenshot(path=f'{SHOTS}/home-{w}.jpg', full_page=True, type='jpeg', quality=78)
                ctx.close()
        b.close()
    return results

if __name__ == '__main__':
    res = run()
    bad = False
    for k, v in res.items():
        problems = {x: v[x] for x in ('small', 'long', 'titles', 'banned', 'lowContrast', 'noAlt', 'csp', 'foreign') if v[x]}
        if v['scroll'] > 0: problems['scroll'] = v['scroll']
        if v['cookies']: problems['cookies'] = v['cookies']
        bad |= bool(problems)
        print(f"{k:22} maxWords={v['maxWords']} maxLine={v['maxLinePx']:.0f}px kb={v['kb']} play={v['play']}  {'OK' if not problems else problems}")
    sys.exit(1 if bad else 0)
