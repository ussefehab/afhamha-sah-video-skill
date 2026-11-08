# Gotchas (each one cost a failed render or a wrong take)

## Shell & files
- **Backslashes and Arabic get mangled through the shell.** Patch scripts written via heredocs lost `\d`, `\s`, ` ` (Git Bash sed even turns `\u` into an uppercase operator), and Arabic passed as command-line args arrived garbled. Write patch/config files with the Write tool and run them with `node file.cjs`; put Arabic text in files, not argv. For a literal non-breaking space use `String.fromCharCode(160)`.
- **Quoted heredocs can still fail** in the Bash tool when the body is long and full of quotes/backticks ("unexpected EOF") — use the Write tool.
- `rm c*.jpg` also deleted the freshly made `check.jpg`. Name temp files with a unique prefix (`f_*.jpg`).
- Deleting `out/video-silent.mp4` makes `--mix-only` impossible; keep it until the user is happy.

## ffmpeg
- **`-ss` binds to the NEXT `-i`.** `ffmpeg -i a.wav -ss 6.5 -i b.wav` seeks in *b*, not *a*. Put `-ss` immediately before the input it should cut.
- **Audio shorter than video → `-shortest` cuts the end card.** The voice bus ends with the last line; `apad=whole_dur=<total>` before splitting it into sidechain key/mix (already in `build.cjs`).
- `amix=duration=first` uses the first input's length — put the full-length music first.
- Windows ffmpeg builds may lack glob (`-pattern_type glob`); copy files to `seq_%03d.jpg` for tiling.

## Rendering (promo.html / build.cjs)
- A page JS error leaves `seek` undefined → every frame fails. Always `node build.cjs --check` first; it also catches edge frames (e.g. the fade tail after the last phone scene where no scene index matched → `HEAD[-1]` crash).
- Puppeteer element screenshots came out blank; full-viewport `page.screenshot` is reliable.
- Long headlines wrap into the phone mockup — `.headline.long` (auto for > 18 chars) shrinks them.
- Same-colour highlight on a same-colour card disappears (orange word on orange end card) — `.endcard .hl` overrides it.
- Chips placed with `left: 720px` ran off the 1080 px frame — chips with x ≥ 500 are right-anchored.

## Voice (Gemini TTS)
- Free tier: **10 requests/day per model** for `gemini-3.8-flash-tts`; samples burn the quota fast. Record the whole script in one request (`all`).
- `speech_metadata` style annotations and `<short pause>` tags work only on 3.8; older models reject them ("Speech metadata is not supported") — the script switches to an instruction prefix automatically.
- Extended voices (`ar-eg-*`) exist only on 3.8; 3.1 says "No matching speaker voice".
- 3.8 returns WAV; 3.1 returns headerless 16-bit PCM @ 24 kHz — detected by the `RIFF` header.
- 403 "API has not been used in project … or it is disabled" → user must click Enable on the linked console page; can take a few minutes (some requests still 403 right after).
- A 400 `code: safety` / "audio stream could not be completed" is usually transient — retry once.
- One-take splitting can drift when the reader pauses mid-sentence; the splitter weighs pauses against expected line positions, but **always transcribe to confirm**.
- Text models for transcription change names; `models` list: `GET /v1beta/models`. `gemini-2.5-flash` was retired for new users; `gemini-3.8-flash` was overloaded (503) at times — `transcribe.cjs` rotates models with retries and a 60 s timeout.
- Arabic transcription writes /v/ as ف — use `check-v.cjs` (IPA + V/F verdict) for brand consonants, not the transcript.

## Other voice routes tried
- Microsoft Edge TTS: `msedge-tts@1` fails with "Connect Error" (needs the Sec-MS-GEC token) — use v2. Rate option is `{ rate: '+12%' }`.
- Hosted HyperFrames/HeyGen compose is disabled for local CLI agents — build locally.
- ElevenLabs: free users can't use library voices via API (402 paid_plan_required); all Egyptian voices are library voices.

## Screenshots & data
- The in-app browser pane resets its emulated viewport when its width changes — set the mobile preset again right before each capture and check `innerWidth`.
- `window.confirm`-style flows and passwords: never type credentials; the user signs in themselves.
- Supabase SQL editor (if the product uses it): set the query with `monaco.editor.getModels()[last].setValue(sql)`, click Run, then confirm the "destructive operation" dialog only for statements you've checked (scoped `delete … where id in (…) and <demo marker> returning …`).
