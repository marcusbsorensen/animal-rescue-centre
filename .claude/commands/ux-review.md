# UX Review — Children's Game Audit

Run a systematic visual audit of every game scene against evidence-based children's UX guidelines (ages 7-11).

## How to Run

Use the Claude Preview MCP to start the dev server, navigate through every scene, screenshot at mobile/tablet/desktop sizes, and generate a prioritised issue list with specific file paths and fixes.

## Audit Procedure

### Step 1: Start Preview Server
Start the `game-dev` server via `mcp__Claude_Preview__preview_start`.

### Step 2: Screenshot Every Scene

Navigate to each scene and screenshot at **three viewports**:
- Mobile: 375x812 (iPhone 14)
- Tablet: 768x1024 (iPad)
- Desktop: 1280x800

**Scenes to audit** (navigate using `preview_eval` to call `game.scene.start('SceneName')`):
1. `MainMenuScene` — logged out state
2. `MainMenuScene` — logged in state (mock session)
3. `SignupScene`
4. `LoginScene`
5. `GameScene` — corridor view (default)
6. `GameScene` — room view (tap a species room)
7. `GameScene` — kitchen view
8. `GameScene` — garden view
9. `GameScene` — animal details modal
10. `GameScene` — arrivals with story cards
11. `DepotScene` — mode selection
12. `DepotScene` — playing (board view)
13. `DepotScene` — results screen
14. `SupplyRunScene` — destination selection
15. `SupplyRunScene` — driving mode
16. `SupplyRunScene` — results screen
17. `FriendsScene`
18. `SocialScene`
19. `LoadingScene`
20. `KitchenMinigameScene`
21. `WalkScene`
22. `VetScene`

### Step 3: Evaluate Against Checklist

For EACH screenshot, evaluate against every item below. Score as PASS / WARN / FAIL.

---

## Evaluation Criteria

All thresholds below are derived from peer-reviewed research (Hourcade 2015, Gathercole & Alloway 2008), platform guidelines (Apple HIG, Google Material Design, WCAG 2.1/2.2), and analysis of successful children's games (Toca Boca, Candy Crush, Prodigy, Pokemon, Mario Kart).

### A. Touch Targets (Motor Control)

Children ages 7-11 have ~2x the targeting error of adults (Hourcade 2015). Small buttons are the #1 UX failure in children's games.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| T1 | Primary action buttons (Play, Accept, Confirm) | < 48px | 48-63px | >= 64px height |
| T2 | Secondary buttons (Back, Settings, Nav tabs) | < 40px | 40-47px | >= 48px height |
| T3 | Icon-only buttons (Mute, Close) | < 40px | 40-47px | >= 48px |
| T4 | Spacing between adjacent touch targets | < 8px | 8-11px | >= 12px |
| T5 | Text-only buttons have adequate hit area (not just text bounds) | hit area = text bounds | hit area +10px padding | hit area +20px padding |
| T6 | Interactive game elements (board cells, obstacles) | < 40px | 40-47px | >= 48px |

### B. Typography (Reading Development)

Children 7-9 read at 80-120 WPM (Hasbrouck & Tindal 2017). Text-heavy UI is a barrier. Sans-serif, rounded fonts are strongly preferred (Walker & Reynolds 2003).

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| F1 | Body text / descriptions | < 14px | 14-15px | >= 16px |
| F2 | Button labels | < 16px | 16-17px | >= 18px |
| F3 | Headings / scene titles | < 20px | 20-23px | >= 24px |
| F4 | HUD text (scores, timers, counters) | < 16px | 16-17px | >= 18px |
| F5 | Small labels / hints | < 11px | 11-13px | >= 14px |
| F6 | Font family is rounded sans-serif (Nunito, Baloo, Fredoka, etc) | Serif or generic system font | Mixed (some text not using brand font) | All text uses rounded sans-serif |
| F7 | No ALL-CAPS body text (destroys word-shape cues children rely on) | Body text in ALL CAPS | Minor labels in ALL CAPS | No ALL CAPS or headings only |
| F8 | Line height >= 1.4x font size | < 1.2x | 1.2-1.39x | >= 1.4x |
| F9 | Instructions/dialogue <= 15 words per line | > 25 words | 16-25 words | <= 15 words |
| F10 | Text has `resolution: devicePixelRatio` for crisp rendering on retina | Not set | Set on some text | Set globally on all text |

### C. Colour & Contrast (Visual Processing)

Children's visual processing is less efficient at extracting low-contrast content. 8% of boys have colour vision deficiency.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| C1 | Body text contrast ratio (WCAG) | < 4.5:1 | 4.5-6.9:1 | >= 7:1 |
| C2 | Large text / heading contrast | < 3:1 | 3-4.4:1 | >= 4.5:1 |
| C3 | Interactive element contrast vs background | < 3:1 | 3-4.4:1 | >= 4.5:1 |
| C4 | Colour is NOT the sole indicator of state | Colour-only state indicators | Colour primary, icon secondary | Icon + colour + text for all states |
| C5 | No pure white (#FFF) background (causes glare) | Pure white bg | #F8F8F8 or similar | Off-white / cream (e.g. #FEF9EF) |
| C6 | No pure black (#000) text (harsh on young eyes) | Pure black text | #111-#222 | #333 or warmer (e.g. #3A2E22) |
| C7 | Reward/success colour is gold/green (universal) | Non-standard reward colour | Partially consistent | Gold (#FFD700) for rewards, Green for success |
| C8 | Danger colour is red (universal by age 7) | Non-standard danger colour | Partially consistent | Red for danger/urgency |

### D. Navigation (Cognitive Load)

Children hold 3-5 items in working memory (Gathercole & Alloway 2008). Hub-and-spoke is the safest navigation model.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| N1 | Max navigation items visible at once | > 7 | 6-7 | <= 5 |
| N2 | Navigation depth (clicks to reach any feature) | > 3 levels | 3 levels | <= 2 levels |
| N3 | Back/Home button always visible and consistent position | Missing or moves between screens | Present but inconsistent position | Always visible, always same position |
| N4 | Navigation uses icons + text (not text-only) | Text-only navigation | Most items have icons | All nav items have icon + label |
| N5 | No hamburger/hidden menus | Hamburger menu as primary nav | Hamburger for secondary features | All nav visible on screen |
| N6 | No dead ends (every screen has a clear next action or way back) | Dead end screens exist | Some screens have unclear next steps | Every screen has obvious next action |

### E. Feedback & Animation (Attention & Engagement)

Every touch must produce feedback within 100ms (NNG). Children re-tap if nothing happens, causing cascading errors.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| E1 | All buttons have visual press feedback | No press feedback | Some buttons have feedback | All buttons animate on press |
| E2 | Button press feedback latency | > 200ms | 100-200ms | < 100ms |
| E3 | Scene transitions are smooth (not instant jump) | No transition | Instant with slight fade | Fade/slide transition 200-400ms |
| E4 | Success animations scale with achievement size | Same animation for all | Two tiers | Small win = small anim, big win = celebration |
| E5 | Error feedback is gentle (not punitive) | Harsh buzzer/red flash | Neutral | Gentle shake + encouraging message |
| E6 | No continuous animation in areas requiring focus/reading | Distracting anims over text | Minor background movement | Static or very subtle behind text areas |
| E7 | Ambient particles respect reduced-motion preference | Ignores prefers-reduced-motion | Reduces but doesn't eliminate | Fully respects the preference |

### F. Button Design (Affordance)

Children need stronger affordance signals than adults to identify interactive elements (NNG 2019). Flat design harms discoverability for children.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| B1 | Primary buttons have 3D depth effect (shadow, bevel, border-bottom) | Flat with no depth cues | Slight shadow only | Clear 3D effect (shadow + bevel or thick bottom border) |
| B2 | Buttons visually distinct from non-interactive panels | Buttons look like panels | Some distinction | Clear visual separation (colour, depth, shape) |
| B3 | Hover/focus state clearly different from default | No hover state | Subtle change only | Obvious scale/glow/colour change |
| B4 | Interactive elements have consistent visual language | Mixed button styles | Mostly consistent | All same style with colour variations only |

### G. Layout & Visual Hierarchy (Screen Organisation)

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| L1 | HUD takes <= 15% of screen area during gameplay | > 20% | 15-20% | <= 15% |
| L2 | Game/content area >= 65% of screen | < 55% | 55-64% | >= 65% |
| L3 | Safe margins from screen edges (avoid notch/gesture areas) | No margins | < 12px | >= 16px margins |
| L4 | Content fits within viewport (no unintentional overflow/scrolling) | Content clipped or overflows | Minor overflow at some sizes | Fully contained at all viewports |
| L5 | Visual hierarchy clear (can identify primary action within 2 seconds) | Primary action unclear | Primary action findable but not obvious | Primary action is the most prominent element |
| L6 | Interactive element count per screen (cognitive overload) | > 12 interactive elements | 9-12 | <= 8 for core gameplay screens |

### H. Driving Game Specific (Supply Run)

Based on Mario Kart, racing game UX patterns.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| R1 | HUD shows position/progress prominently | No progress indicator | Small or hard to read | Large, obvious progress display |
| R2 | Steering controls large enough for children | < 60px touch zones | 60-79px | >= 80px touch zones |
| R3 | Speed conveyed visually (not just numbers) | Static road, no speed feel | Some motion cues | Road lines scroll, edges blur, camera effects |
| R4 | Obstacle type readable at speed (smashable vs avoid) | No visual distinction | Subtle distinction | Clear colour/shape coding (green=smash, red=dodge) |
| R5 | Collision feedback immediate and obvious | No feedback | Flash only | Flash + shake + sound + score popup |
| R6 | Controls hint visible for new players | No controls shown | Text-only hint | Visual controls guide with icons |

### I. Puzzle Game Specific (Depot)

Based on Candy Crush, Toon Blast patterns.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| P1 | Board cells large enough to tap accurately | < 36px | 36-47px | >= 48px |
| P2 | Group highlight on hover/touch (shows what will collapse) | No highlight | Single cell only | Entire group highlighted |
| P3 | Collapse animation (not instant disappear) | Instant removal | Simple fade | Shrink/pop with stagger + particles |
| P4 | Score popup on each successful tap | No popup | Number only | Number + size label ("BIG!", "HUGE!") |
| P5 | Power-ups visually distinct from regular tiles | Same style as regular | Slight glow | Glowing border + distinct icon + animation |
| P6 | Goals clearly displayed and progress visible | Goals hidden | Goals shown but no progress | Goals with live X/Y counter |
| P7 | Moves remaining prominently displayed | Not shown | Small text | Large, obvious counter |

### J. Mobile & Responsive

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| M1 | Game playable at 375px width (smallest phone) | Broken layout | Cramped but functional | Clean layout, all elements accessible |
| M2 | No horizontal scrolling required | Horizontal scroll needed | Minor overflow | Fully contained |
| M3 | Touch targets don't overlap at mobile size | Overlapping targets | Tight but separate | Clear spacing maintained |
| M4 | Text readable without zooming at mobile size | < 12px text at mobile | 12-13px | >= 14px minimum at mobile |
| M5 | Viewport meta prevents accidental zoom (`user-scalable=no`) | Not set | Partially set | Full viewport meta with user-scalable=no |

### K. Visual Polish & Theming (Craft Quality)

Children's games live or die by visual coherence. Generic OS emojis and empty backgrounds signal "prototype" and break immersion. Every screen should feel like it belongs in the same world.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| V1 | No generic OS emojis on buttons/UI chrome (nav, actions, headings) | Emoji used as button icons | Some buttons have emoji, some don't | All UI icons are custom artwork or text-only |
| V2 | Background texture/pattern on every screen (not flat colour) | Plain flat background fill only | Background colour with gradient but no pattern | Subtle thematic pattern (e.g. paw prints, tyre tracks, gears) |
| V3 | Background pattern is thematic to the scene context | No pattern or generic pattern | Pattern exists but unrelated to scene | Pattern reinforces scene theme (medical crosses for vet, utensils for kitchen, etc.) |
| V4 | Cards/panels constrained to readable width (not edge-to-edge on desktop) | Cards stretch full viewport width | Cards >600px but <80% width | Cards max-width ≤500px and centered |
| V5 | Adequate spacing between text content and interactive buttons | Text touching/overlapping buttons (<8px gap) | 8-15px gap | ≥20px clear breathing room between text blocks and buttons |
| V6 | Button colour semantics match action intent | Red/danger colour for positive actions | Inconsistent colour usage | Green=primary, warm=secondary, blue=info, red=danger only |
| V7 | Visual hierarchy: primary action is largest/boldest, secondary smaller | All buttons same size/weight | Some size variation | Clear size+colour hierarchy (primary > secondary > tertiary) |
| V8 | Consistent visual language across all screens | Mixed styles between scenes | Mostly consistent with minor drift | Same panel style, button style, title style everywhere |
| V9 | Content emojis (animal states, game items) acceptable as placeholders | N/A | Emoji used for game content (items, status indicators) | All game content uses custom artwork |
| V10 | No wireframe/prototype aesthetic (placeholder rectangles, missing art) | Multiple placeholder shapes visible | One or two placeholder areas | All visual areas have finished appearance |

### L. Spacing & Composition

Good spacing prevents cognitive overload and guides the eye. Children need more whitespace than adults to parse visual groups.

| ID | Rule | FAIL | WARN | PASS |
|----|------|------|------|------|
| S1 | Group spacing: related items clustered, unrelated items separated | No visual grouping | Some grouping | Clear Gestalt grouping with ≥20px between groups |
| S2 | Section padding inside cards/panels | < 8px inner padding | 8-15px | ≥16px padding on all sides |
| S3 | Vertical rhythm: consistent spacing between repeated elements | Random spacing | Mostly consistent | Uniform spacing (±2px) between all list/grid items |
| S4 | Screen not cramped: content area has breathing room | Content fills >90% of available space | 80-90% utilisation | 65-80% utilisation with clear margins |
| S5 | Text-to-button gap (description text before action buttons) | <10px gap | 10-19px gap | ≥20px clear separation |

---

## Step 4: Generate Report

Output a structured report:

### Report Format

```
# UX Audit Report — A.R.C. (Animal Rescue Centre)
Date: [date]
Viewports tested: Mobile (375x812), Tablet (768x1024), Desktop (1280x800)

## Critical Issues (FAIL)
[List all FAIL items grouped by scene, with:]
- Issue ID (e.g. T1, F2)
- Scene name
- Viewport(s) affected
- What's wrong (specific measurement)
- How to fix (specific file, line number, code change)
- Priority: P0 (blocks usability) / P1 (significant UX harm) / P2 (notable issue)

## Warnings (WARN)
[Same format, lower priority]

## Passes
[Summary of what's working well — important for morale!]

## Score Summary
[Table of category scores: A-J, with pass/warn/fail counts]
[Overall score as percentage]

## Top 5 Highest-Impact Fixes
[Ordered by impact × effort, with specific implementation instructions]
```

### Scoring
- PASS = 2 points
- WARN = 1 point  
- FAIL = 0 points
- Category score = points earned / max points possible
- Overall score = total points / total possible

---

## Research Sources

This audit checklist is based on:
- Hourcade, J.P. (2015). Interaction Design and Children. Foundations and Trends in HCI
- Nielsen Norman Group (2019). Children's UX: Usability Findings from Studies with Children
- Gathercole & Alloway (2008). Working Memory and Learning
- Walker & Reynolds (2003). Serif, sans serif and infant characters in children's reading books
- Sesame Workshop Design Principles (touch tablet experiences)
- Apple HIG Kids Category requirements (44pt min targets)
- Google Material Design (48dp min targets)
- WCAG 2.1/2.2 (contrast ratios, target sizes)
- PBS Kids design guidelines
- Analysis of: Toca Life World, Candy Crush, Toon Blast, Prodigy Math, Animal Jam, Pokemon, Mario Kart, Roblox, Minecraft, Club Penguin
