---
name: egyptian-promo-video
description: Make a professional vertical (9:16) promo / ad video for a website, app, system or product, with an Egyptian-Arabic voice-over, kinetic Arabic typography, real product screenshots in phone mockups, synced subtitles, original music and sound effects — rendered locally to MP4 (plus a WhatsApp-size copy) with no paid tools. Use this whenever the user asks for a promo video, ad, reel, TikTok/Instagram/Facebook video, explainer, product demo video, motion/animated video or "فيديو ترويجي / إعلان / ريلز / فيديو انيميشن / فويس أوفر مصري", even if they only say "make a video for my site/app/company", want to re-brand an existing promo for another company, or want the voice to sound more Egyptian/natural.
---

# Egyptian promo video

Builds a ~60–70 s vertical promo video entirely on the local machine:

```
script.json ──► voice-over (Gemini TTS, free) ──► per-line clips ──► timeline
screenshots ──► promo.html (seek(t) animation) ──► puppeteer frames ──► ffmpeg
synth.cjs (original beat + SFX) ──► sidechain-ducked mix ──► loudnorm −14 LUFS ──► MP4 + WhatsApp copy
```

Every scene lasts exactly as long as its spoken line, so changing a word or the voice re-times the whole video automatically.

The proven example (a restaurant ordering system: busy phone hook → WhatsApp pain → reveal → menu → cart → QR tables → order tracking → dashboard → stats → brand + CTA) is the default template. Reuse its structure for other products by changing the scenes, not the engine.

## What you need

- Node 18+, ffmpeg/ffprobe on PATH, Google Chrome (or set `CHROME_PATH`).
- In the build folder: `npm i puppeteer-core qrcode msedge-tts@2` (on a full C: drive point `npm_config_cache` and `TEMP` at another drive).
- A **free** Google AI Studio key for the voice (aistudio.google.com/apikey). The user pastes it into `VIDEO/.env` as `GEMINI_API_KEY=…` themselves — create the file with the key empty and never ask them to paste it in chat or print it. The first call may say the Generative Language API is disabled for their project: give them the console link from the error to click **Enable**, then retry after a minute.

## Folder layout

Create `VIDEO/` inside the user's project (e.g. `marketing/video-<brand>/`):

```
VIDEO/.env            GEMINI_API_KEY=      (user fills)
VIDEO/script.json     copy of assets/script.example.json, edited
VIDEO/build/          scripts/* + assets/template/* from this skill
VIDEO/build/img/      screenshots + logos used by promo.html
VIDEO/vo/             s01.wav … s10.wav (voice clips)
VIDEO/out/            renders, sheet.jpg, timeline.json
```

## Workflow

### 1. Brief (only ask what you can't find)
Product and what it does, audience (who buys), brand name **and how it's pronounced**, palette + logo (look in the user's code: tailwind config, icon.svg, Logo component), CTA, contact info if any. Default format: 9:16, 60–70 s, Egyptian dialect, male energetic voice.

### 2. Script → `script.json`
Ten lines, one per scene. The structure that worked:
1. **Hook (0–4 s)**: a painful question the viewer recognises ("كام أوردر ضاع منك النهارده… عشان التليفون كان مشغول؟").
2. **Pain**: the current bad way, ending on the loss.
3. **Reveal**: "طب تخيّل…" + the product (beat drop here).
4–9. **One feature per scene**, each with its real screenshot.
10. **Brand + CTA**: who offers it, invitation to subscribe/contact.

`voice` is what the TTS reads: write it the way an Egyptian *says* it (عامية, "…" for breaths, "؟" for questioning tone, numbers as words "أربعة وعشرين", "QR" as "كيو آر"). `subtitles` is what viewers read (digits "٢٤", "QR", brand in Latin letters). `headlines` are 2–5 word kinetic titles for scenes 1–9; wrap the highlighted word in `*…*`.

Don't invent statistics, percentages, prices, awards or testimonials — viewers and the client can't verify them, and they create legal risk. Benefits stated plainly sell well enough.

**Brand names with V/P/G**: Arabic has no V, so "نوفيكس" is read "NOFIX". Write it with ڤ ("نوڤيكس") or in Latin ("NOVIX") in `voice`, then verify with `check-v.cjs` (step 4).

### 3. Screenshots (real product, phone size)
Use puppeteer at `390×844, deviceScaleFactor 3` (→ 1170×2532) and save into `build/img/`. The template expects: `phone-home.png, phone-sweets.png, phone-restaurant.png, phone-options.png, phone-cart.png, tracking.png, dashboard-cancel.jpg, dashboard-stats.jpg, dashboard-products.jpg` — rename/replace per product (see `references/template.md`).

- **Re-branding / generic demo**: inject a script with `evaluateOnNewDocument` + `MutationObserver` that rewrites the old brand name, swaps logo `src`, hides phone numbers and replaces brand photos, then check `innerText` for leftovers.
- **Logged-in pages** (dashboards): use the in-app browser pane where the user is already signed in (never type their password), emulate a 375×812 viewport, apply the same DOM swaps with `javascript_tool`, and take the screenshot there (it saves a file you can copy). The pane can reset its size mid-task — re-apply the mobile viewport before each shot.
- **Real customer data**: mask names/phones on screen before capturing. If you need realistic states (a new order, a cancel request), create clearly-labelled demo records, capture, then delete exactly those records and confirm they're gone.

### 4. Voice-over
Free, natural Egyptian voices come from Gemini TTS (`scripts/vo-gemini.cjs`):

- `gemini-3.8-flash-tts` has **92 native Egyptian voices** (`ar-eg-*`, e.g. `ar-eg-concierge-1` young/bright, `ar-eg-commercial-11` ad voice, `ar-eg-storyteller-3` casual). Free tier: **only 10 requests/day for this model**.
- `gemini-3.1-flash-tts-preview` has a separate free quota but only general voices (`Puck` upbeat male — the user's pick, `Orus` firm male, …) steered to Egyptian by the style text.
- Commands (run from `VIDEO/build`):
  - `node vo-gemini.cjs voices` → list `ar-EG` voices.
  - `node vo-gemini.cjs sample <voice> [voice…]` → hook line per voice into `vo/samples/` (1 request each). Convert to mp3 and send them so the user picks by ear — you can't listen.
  - `node vo-gemini.cjs all <voice>` → **one request** for the whole script, split into 10 clips at the pauses (cheap on quota and sounds like one continuous take). Old clips are backed up.
  - `node vo-gemini.cjs line <voice> <n>` → re-record a single line.
  - Use `GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview` to switch model.
- Spend samples wisely (5 voices = 5 requests). If the 3.8 quota runs out, offer: wait until it resets (~midnight Pacific), or record today with 3.1. Don't suggest extra Google accounts to get more quota — Google's API terms forbid circumventing limits and it can get both accounts suspended.
- Fallbacks: `vo-edge.cjs` (Microsoft `ar-EG-ShakirNeural`, unlimited, no key — users found it robotic/non-Egyptian), or the user records the lines on their phone and you trim/normalise them into `vo/sNN.wav`. ElevenLabs is excellent but paid.

**Verify every take — you can't hear it:**
- `node transcribe.cjs [s05 s06…]` transcribes each clip with a Gemini text model. Each transcript must equal its script line. If words from the next line sit at the end of a clip, the cut is late: find pauses with `ffmpeg -af silencedetect=noise=-38dB:d=0.1` and move the tail to the next clip (see gotchas for the `-ss` trap). Fix from `vo/take/` originals.
- `node check-v.cjs s10` asks whether a brand consonant is /v/ or /f/ (twice per clip). Include the known-bad take as a control so you know the check works.

### 5. Theme the template
The template also needs `img/qr.png` (make it with `node -e "require('qrcode').toFile('img/qr.png','<site url or brand>',{errorCorrectionLevel:'H',margin:1,width:680})"` — viewers can scan it, so point it somewhere real or at plain text), `img/rest-logo.svg` (the demo business's logo) and the brand icon (`img/novix-icon.svg` in the example).

`assets/template/promo.html` is NOVIX-styled (navy #0B1020, blue→violet gradient). Re-theme by editing the `:root` variables, the stage background and glow colours, `.hl` gradient, chips/rings/subtitle pill, QR card, and the final scene (logo, wordmark, tagline, CTA, features line). `references/template.md` lists where each piece lives and how scenes are wired.

### 6. Check, preview, render
From `VIDEO/build`:
1. `node build.cjs --check` — runs all ~2000 frames without screenshots; catches JS errors in seconds instead of after a 5-minute render.
2. `node build.cjs --preview 3` → `out/sheet.jpg`. **Look at it** (Read the image): headline wrapping, things off-canvas, contrast (e.g. orange text on an orange card), leftover old branding.
3. `node build.cjs` (run in the background, ~5 min for 66 s). It reports video vs audio length (must match) and loudness (≈ −14 LUFS).
4. Send the WhatsApp copy with SendUserFile (the full file is usually > 30 MB and only shows on desktop), tell the user where both files are, and say plainly that you checked by transcription/frames but couldn't listen.

### 7. Music
`synth.cjs` composes an original 98 BPM Middle-Eastern trap beat (darbuka, 808, plucked oud-like lead in D Hijaz) with the drop on the reveal scene, plus busy-tone / whoosh / ding / beep / pop SFX. Licensed libraries (e.g. Epidemic Sound connectors) may only allow previews, not downloads — previews aren't licensed for ads, so don't use them.

## Delivering
- Final: `out/<name>-9x16.mp4` (1080×1920, 30 fps, H.264, AAC, −14 LUFS) and `out/<name>-9x16-whatsapp.mp4`.
- Mention anything placeholder (missing phone number on the end card, etc.) and offer the obvious next step (add contact info, landscape version, embed on their site).
- If screenshots had to be hosted publicly (only needed for cloud video tools), tell the user where and offer to remove them.

Read `references/gotchas.md` before running anything — it lists every failure hit while building this and the fix.
