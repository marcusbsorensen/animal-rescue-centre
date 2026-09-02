#!/usr/bin/env python3
"""Download the Google Fonts A.R.C. uses and rewrite them as local @font-face."""
import re
import pathlib
import urllib.request

# Nunito + Caveat are the game canvas's faces. Fredoka, Quicksand, Kalam
# and Gochi Hand are the sign screens' — those were still being fetched
# from fonts.googleapis.com by 36 files in public/admin/ long after the
# canvas stopped, which is the same three problems the header below
# describes, on the screens a child actually reads words on.
#
# Weights are what the sign screens ask for, taken from the <link> they
# used: Fredoka 400-700, Quicksand 400-600, Kalam 400/700, Gochi Hand has
# only one.
CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Nunito:wght@400;600;700;800;900"
    "&family=Caveat:wght@400;700"
    "&family=Fredoka:wght@400;500;600;700"
    "&family=Quicksand:wght@400;500;600"
    "&family=Kalam:wght@400;700"
    "&family=Gochi+Hand"
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

    slug = fam.group(1).lower().replace(" ", "-")
    name = f"{slug}-{wgt.group(1)}-{subset}.woff2"
    if name not in downloaded:
        data = urllib.request.urlopen(
            urllib.request.Request(url.group(1), headers={"User-Agent": UA})
        ).read()
        (OUT / name).write_bytes(data)
        downloaded[name] = len(data)

    kept.append(block.replace(url.group(1), f"/fonts/{name}").strip())

header = (
    "/*\n"
    " * Self-hosted type: Nunito + Caveat for the game canvas, Fredoka +\n"
    " * Quicksand + Kalam + Gochi Hand for the DOM sign screens.\n"
    " *\n"
    " * These used to load from fonts.googleapis.com. That meant a\n"
    " * third-party request on every cold launch — which sends the device\n"
    " * IP to Google, a review risk for an App Store Kids Category title —\n"
    " * plus fallback typography whenever the game opened offline, and a\n"
    " * race against Phaser's first canvas text paint.\n"
    " *\n"
    " * The sign screens kept their fonts.googleapis.com <link> for months\n"
    " * after the canvas dropped it — 36 files. That is why a hand-painted\n"
    " * plank could render its label in plain system sans: the stack ends\n"
    " * in system-ui, and until the network answered, system-ui is what\n"
    " * you got. Offline, it is what you kept.\n"
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
