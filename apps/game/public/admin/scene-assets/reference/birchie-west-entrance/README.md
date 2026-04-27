# Birchie west-entrance references

Visual reference photos for the west-entrance approach road to Birchie-on-Sea — the "you're arriving in town" beat shared by every PTV drive and Supply Run coming from the Herne Bay direction.

See `docs/ptv-pet-transport-vehicle.md` §"Visual references + art direction" for context.

## Canonical visual + motion spec

- **Canonical variant**: the **blue-dungarees + red-shirt + blue-cap** tube-man from the AliExpress reference set (two others in the set — yellow hard-hat / green cap — are reference for the kind, not this specific unit).
- **Game placement**: left side of the road on the **west entrance to Birchie** (Herne Bay approach).
- **Asymmetric arm airflow (per Marcus, 2026-04-24)**: the **right arm** is the one that flaps and waves drivers in; left arm stays low. This is the specific physical unit at the west entrance, not all tube-men in general.
- **Full body motion (per video reference)**: the tube body itself whips side-to-side in a drunken, rhythmic flop. Both arms move on the demo unit in the video, but for Birchie's unit the right arm is dominant. Head sways. Motion is deliberately janky — jerky, over-inflated, no smooth animation curves. The jankiness is the charm.

### Asset files in this folder

- `thumbnail.jpg` — static group shot of the three tube-man variants (blue, yellow, green). Blue is ours.
- `wavy-arm-motion-demo.mp4` — 38 s demo video showing the full floppy-body motion and real-light colours. Use for animation timing + palette pulls. **Source:** [AliExpress listing](https://video.aliexpress-media.com/play/u/ae_sg_item/2200742899232/p/1/e/6/t/10301/5000203174701.mp4).
- `motion-frames/frame-01.jpg` … `frame-08.jpg` — 8 frames extracted across the video for browsing without a player. Frame 06 (green tube bent dramatically left) is the best showcase of the full-body sway; frame 04 (yellow solo, arms outstretched horizontal) shows a relaxed mid-pose.
- `petrol-station-*.*` — to come. Small British forecourt, two pumps, kiosk with bunting. Generic branding ("BIRCHIE FUEL" / "THE PUMP"). Right side of the road, shortly after the car wash.
- `petrol-station-*.*` — to come. Small British forecourt style, two pumps, kiosk with bunting. Generic branding (e.g. "BIRCHIE FUEL" or "THE PUMP"). Right side of the road, shortly after the car wash.

## Don't ship these

These reference photos are **targets for Manus to re-illustrate** in the A.R.C. storybook style, not direct game assets. They live under `admin/` so they're browsable from the admin UI for design review; never bundled into the game runtime.
