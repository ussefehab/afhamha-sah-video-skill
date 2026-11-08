# promo.html — how the template is wired

A 1080×1920 page. `window.seek(t)` sets every element's style for time `t` (no CSS animations), so puppeteer can render any frame exactly. `build.cjs` injects:
- `window.TL = { vo: [[start, end] × 10], total }` — voice timings
- `window.SCRIPT` — `script.json` (`subtitles`, `headlines` are used here)

Scene windows `W[i] = { s, e, vs, ve }` come from `TL`: scene *i* starts 0.28 s before its line and ends where the next begins; the last runs to `total` (2.6 s after the last word, for the end card).

## Scenes (index → element)

| i | Section | What happens | Key config |
|---|---|---|---|
| 0 | `#s1` hook | ringing phone + pulse rings, "الخط مشغول…", 3 missed-call rows | text in markup; timing in `seek` "1 HOOK" |
| 1 | `#s2` pain | chat card, 3 customer bubbles, typing dots, red stamp | bubble texts in markup |
| 2–4, 6–8 | `#sp` one shared phone mockup | screenshots swap inside `.screen`; headline per scene from `HEAD[idx]` | `shots`, `rings`, `CHIPS`, `chipStart/chipGap` |
| 5 | `#s6` QR | table card (`.qrcard`) + scan corners + scan line + "طاولة ٥ ← المطبخ" ticket | card markup, `img/qr.png`, `img/rest-logo.svg` |
| 9 | `#s10` brand + CTA | brand icon + wordmark + tagline, then circular wipe to the end card (big line, CTA pill, features line) | markup in `#s10` / `.endcard` |

Phone scenes:
- `shots` (in `seek`): which screenshot shows when, e.g. `3: [[1, w.s], [2, w.s + (w.e - w.s) * .38], [3, …]]` = sweets → restaurant → options. Indexes refer to the `IMGS` list (`i-home, i-sweets, i-rest, i-opt, i-cart, i-track, i-dash, i-stats, i-prod`) — rename the `<img>` ids/src to your screenshots.
- `rings`: pulsing highlight circles `[x, y, size]` in the 520 px-wide screen (screenshot pixel × 520 / screenshot width).
- `CHIPS[k]`: floating labels `[text, dotColor, glyph, x, y, 'dark'?]`; x ≥ 500 anchors to the right edge.
- The toast ("أوردر جديد وصل…") shows in scene 7.
- Scene 2 entrance: phone rises with a 3D tilt + white flash on the beat drop.

## Shared pieces
- Headlines: `.headline` (Cairo 900, 100 px; `.long` 84 px when > 18 chars); `*word*` → `.hl` gradient text.
- Subtitles: `.subs .pill`, words light up as spoken (estimated by character count); current word coloured `var(--orange)`.
- Background: `#stage` radial gradient + two drifting blurred glows `#g1/#g2`, film grain canvas, vignette, top progress bar.
- `envelope()` gives each standalone scene a whip-in (slide + blur) and quick fade-out.

## Re-theming checklist
1. `:root` variables (`--deep --choco --caramel --orange --cream --beige --grad`).
2. `#stage` background gradient, `html, body` background, `#g1/#g2` colours.
3. `.hl` gradient, `.phone` ring/glow, `.chip` / `.chip.dark`, `.ring`, `.subs .pill`, `.progress`.
4. Chip dot colours inside `CHIPS`.
5. QR card (`.qrcard*`, logo, texts), scan colours.
6. Final scene: `img/<brand-icon>`, wordmark SVG in `#brand`, tagline in `#live`, `.endcard` gradient, `.endcard .big` text (`endWords`), CTA text, features line, `.smalllogo`.
7. `node build.cjs --preview 3` and inspect `out/sheet.jpg`.

## Adapting to another product
Keep the engine (`seek`, `windows()`, `envelope`, subtitles, phone scenes) and change: the 10 lines in `script.json`, the hook/pain markup (scenes 0–1), the screenshots and `shots` map, chips/rings, the QR scene (or turn it into another standalone scene), and the brand scene. If the number of lines changes from 10, update the scene ranges in `seek` (`W[2]…W[8]` phone block, `W[5]` QR, `W[9]` CTA) and the SFX cues in `build.cjs`.
