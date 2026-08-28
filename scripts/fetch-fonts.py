#!/usr/bin/env python3
"""Download the Google Fonts A.R.C. uses and rewrite them as local @font-face."""
import re
import pathlib
import urllib.request

CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Nunito:wght@400;600;700;800;900"
    "&family=Caveat:wght@400;700"
    "&display=swap"
)
# A modern UA makes Google serve woff2 + unicode-range subsets.
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

OUT = pathlib.Path("apps/game/public/fonts")
OUT.mkdir(parents=True, exist_ok=True)

req = urllib.request.Request(CSS_URL, headers={"User-Agent": UA})
css = urllib.request.urlopen(req).read().decode("utf-8")

# Keep only latin and latin-ext; the game ships in English and the other
# subsets (cyrillic, vietnamese) are dead weight inside an app bundle.
blocks = re.split(r"(?=/\*\s*[a-z-]+\s*\*/)", css)
kept = []
downloaded = {}

for block in blocks:
    m = re.match(r"/\*\s*([a-z-]+)\s*\*/", block.strip())
    if not m:
        continue
    subset = m.group(1)
    if subset not in ("latin", "latin-ext"):
        continue

    fam = re.search(r"font-family:\s*'([^']+)'", block)
    wgt = re.search(r"font-weight:\s*(\d+)", block)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", block)
    if not (fam and wgt and url):
        continue

    name = f"{fam.group(1).lower()}-{wgt.group(1)}-{subset}.woff2"
    if name not in downloaded:
        data = urllib.request.urlopen(
            urllib.request.Request(url.group(1), headers={"User-Agent": UA})
        ).read()
        (OUT / name).write_bytes(data)
        downloaded[name] = len(data)

    kept.append(block.replace(url.group(1), f"/fonts/{name}").strip())

header = (
    "/*\n"
    " * Self-hosted Nunito + Caveat.\n"
    " *\n"
    " * These used to load from fonts.googleapis.com. That meant a\n"
    " * third-party request on every cold launch — which sends the device\n"
    " * IP to Google, a review risk for an App Store Kids Category title —\n"
    " * plus fallback typography whenever the game opened offline, and a\n"
    " * race against Phaser's first canvas text paint.\n"
    " *\n"
    " * Latin and latin-ext subsets only. Regenerate with\n"
    " * scripts/fetch-fonts.py if the weights in use ever change.\n"
    " */\n\n"
)
(OUT / "fonts.css").write_text(header + "\n\n".join(kept) + "\n")

total = sum(downloaded.values())
for n, s in sorted(downloaded.items()):
    print(f"  {n:38s} {s/1024:7.1f} KB")
print(f"  {'TOTAL':38s} {total/1024:7.1f} KB across {len(downloaded)} files")
