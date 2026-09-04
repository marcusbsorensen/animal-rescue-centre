# Keep these — they are not dead weight

`bay-road-vets.png` is referenced by no code, and that is the only
reason it looks disposable. It is a finished painted elevation of the
vet surgery — cream render, brick plinth, tiled roof, and the green
cross sign on its post outside, which is the detail the building is
really about.

**Marcus's decision, 2026-09-04: it stays.** It was nearly commissioned
over on this date because a search for destination art looked in
`driving/topdown/` and never thought to look here.

The arrival forecourt currently draws `site-vet-building.png` — a
Victorian seaside villa rendered as one of a set of five, which is why
it is the one in use rather than this. Swapping this cottage in is a
one-file rename if that is ever wanted; it is a bungalow, which is
period-correct for Birchington in a way the villa is not (the village
has some of the first bungalows built in England).

Underscore-prefixed files are skipped by `plugins/asset-manifest.ts`, so
this note never ships.
