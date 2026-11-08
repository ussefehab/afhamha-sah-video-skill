// Builds the promo video: timeline from the voice-over → music/SFX → frames → MP4 with mixed audio.
//
// Layout (VIDEO = the folder that holds this build/ folder):
//   VIDEO/script.json   { name, voice[], subtitles[], headlines[] }
//   VIDEO/vo/s01.wav …  one clip per line (from vo-gemini.cjs / vo-edge.cjs)
//   VIDEO/build/        promo.html, img/, these scripts
//   VIDEO/out/          renders
//
// Usage:
//   node build.cjs --check        run every frame without rendering, to catch script errors (fast)
//   node build.cjs --preview 3    a still every 3 s + out/sheet.jpg contact sheet
//   node build.cjs                full render → out/<name>-9x16.mp4 and a WhatsApp-size copy
//   node build.cjs --mix-only     redo only the audio on the last rendered frames
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core'); }
const CHROME = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');

const ROOT = path.resolve(__dirname, '..');
const VO = path.join(ROOT, 'vo');
const OUT = path.join(ROOT, 'out');
const AUD = path.join(OUT, 'audio');
fs.mkdirSync(AUD, { recursive: true });
const SCRIPT = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const NAME = SCRIPT.name || 'promo';
const FPS = 30;
const GAP = 0.35, LEAD = 0.6, TAIL = 2.6;
const arg = k => process.argv.includes(k);

const dur = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

// 1) Timeline from the real voice-over lengths: every scene lasts exactly as long as its line.
const clips = fs.readdirSync(VO).filter(f => /^s\d+\.wav$/.test(f)).sort();
if (clips.length !== SCRIPT.voice.length) console.warn(`! ${clips.length} voice clips for ${SCRIPT.voice.length} script lines`);
let t = LEAD;
const vo = clips.map(f => { const d = dur(path.join(VO, f)); const r = [+t.toFixed(3), +(t + d).toFixed(3)]; t += d + GAP; return r; });
const total = +(vo[vo.length - 1][1] + TAIL).toFixed(3);
const TL = { vo, total };
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(TL, null, 1));
const W = vo.map((v, i) => ({ s: i === 0 ? 0 : v[0] - 0.28, e: i === vo.length - 1 ? total : vo[i + 1][0] - 0.28, vs: v[0], ve: v[1] }));
console.log('total', total, 's');

// 2) Original music + SFX (no licensing): the beat drops on the reveal scene (3rd).
if (!arg('--check')) execFileSync('node', [path.join(__dirname, 'synth.cjs'), AUD, String(W[Math.min(2, W.length - 1)].s), String(vo[vo.length - 1][1])], { stdio: 'inherit' });

const preview = arg('--preview') ? Number(process.argv[process.argv.indexOf('--preview') + 1]) || 3 : 0;

(async () => {
  // 3) Frames: promo.html draws any instant from seek(t), so every frame is exact.
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((tl, sc) => { window.__RENDER = true; window.TL = tl; window.SCRIPT = sc; }, TL, SCRIPT);
  await page.goto('file:///' + path.join(__dirname, 'promo.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.ready);
  if (errors.length) throw new Error('promo.html failed to load: ' + errors.join(' | '));

  if (arg('--check')) {
    const bad = await page.evaluate(n => { const out = []; for (let f = 0; f < n; f++) { try { seek(f / 30, f); } catch (e) { out.push(`frame ${f} (${(f / 30).toFixed(2)}s): ${e.message}`); if (out.length > 5) break; } } return out; }, Math.ceil(total * FPS));
    await browser.close();
    console.log(bad.length ? 'ERRORS\n' + bad.join('\n') : `all ${Math.ceil(total * FPS)} frames OK`);
    process.exit(bad.length ? 1 : 0);
  }

  if (preview) {
    const dir = path.join(OUT, 'stills');
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    let i = 0;
    for (let s = 0.5; s < total; s += preview) {
      await page.evaluate(x => seek(x), s);
      await page.screenshot({ path: path.join(dir, `seq_${String(i++).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 80 });
    }
    await browser.close();
    const cols = 7, rows = Math.ceil(i / cols);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-start_number', '0', '-i', path.join(dir, 'seq_%03d.jpg'), '-vf', `scale=240:427,tile=${cols}x${rows}`, '-frames:v', '1', path.join(OUT, 'sheet.jpg')]);
    console.log(`${i} stills; contact sheet: ${path.join(OUT, 'sheet.jpg')}`);
    return;
  }

  const silent = path.join(OUT, 'video-silent.mp4');
  const t0 = Date.now();
  if (!arg('--mix-only')) {
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), silent], { stdio: ['pipe', 'inherit', 'inherit'] });
    const frames = Math.ceil(total * FPS);
    for (let f = 0; f < frames; f++) {
      await page.evaluate((x, fr) => seek(x, fr), f / FPS, f);
      const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 150 === 0) console.log(`frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
  }
  await browser.close();
  if (errors.length) throw new Error('page errors while rendering: ' + errors.slice(0, 3).join(' | '));

  // 4) Audio: voice on top, music ducked under it (sidechain), SFX on cue. Cue times follow the template's scenes —
  // adjust them if you change what happens in a scene.
  const sfx = [['busy.wav', 0.05, 0.55]];
  W.forEach((w, i) => { if (i > 0) sfx.push(['whoosh.wav', Math.max(0, w.s - 0.12), 0.55]); });
  if (W[4]) sfx.push(['ding.wav', W[4].s + 1.3 + 2.1 + 0.7, 0.7]);   // order ready (after the 3 check chips)
  if (W[5]) sfx.push(['beep.wav', W[5].s + 3.05, 0.6]);              // QR scanned
  if (W[7]) sfx.push(['ding.wav', W[7].s + 0.35, 0.8]);              // dashboard toast
  const chipCues = { 3: [1.0, .8, 3], 4: [1.3, .7, 4], 6: [1.0, 1.1, 4], 7: [3.6, 1.2, 2], 8: [1.0, 1.5, 3] };
  for (const k in chipCues) { if (!W[k]) continue; const [st, gap, n] = chipCues[k]; for (let i = 0; i < n; i++) sfx.push(['pop.wav', W[k].s + st + i * gap, 0.45]); }

  const inputs = ['-i', path.join(AUD, 'music.wav')];
  clips.forEach(c => inputs.push('-i', path.join(VO, c)));
  sfx.forEach(([f]) => inputs.push('-i', path.join(AUD, f)));
  const nVo = clips.length;
  let fc = '';
  clips.forEach((c, i) => { const ms = Math.round(vo[i][0] * 1000); fc += `[${i + 1}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${ms}|${ms}[v${i}];`; });
  // apad: the voice bus ends with the last line; without padding the mix (and -shortest) would cut the end card.
  fc += clips.map((c, i) => `[v${i}]`).join('') + `amix=inputs=${nVo}:normalize=0:duration=longest,highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,apad=whole_dur=${total},asplit=2[vo][key];`;
  fc += `[0:a]volume=0.55[mus];[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350:makeup=1[duck];`;
  sfx.forEach(([f, at, vol], i) => { const ms = Math.round(at * 1000); fc += `[${nVo + 1 + i}:a]aresample=48000,adelay=${ms}|${ms},volume=${vol}[x${i}];`; });
  fc += sfx.map((s, i) => `[x${i}]`).join('') + `amix=inputs=${sfx.length}:normalize=0:duration=longest[fx];`;
  fc += `[duck][vo][fx]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=9,atrim=0:${total}[out]`;
  const mix = path.join(AUD, 'mix.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', fc, '-map', '[out]', '-ar', '48000', mix], { stdio: 'inherit' });

  const final = path.join(OUT, `${NAME}-9x16.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', mix, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' });
  // A copy under ~30 MB for WhatsApp / phone sharing.
  const small = path.join(OUT, `${NAME}-9x16-whatsapp.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', final, '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', small], { stdio: 'inherit' });

  // Report what to check: length (video = audio), loudness (≈ -14 LUFS), sizes.
  const vd = dur(final), ad = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=duration', '-of', 'csv=p=0', final]).toString().trim());
  // The integrated value is the last "I:" (earlier ones are running per-frame readings).
  const lufs = [...spawnLoud(final).matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1];
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s\n  ${final} (${(fs.statSync(final).size / 1e6).toFixed(1)} MB)\n  ${small} (${(fs.statSync(small).size / 1e6).toFixed(1)} MB)\n  video ${vd.toFixed(2)}s, audio ${ad.toFixed(2)}s, loudness ${lufs} LUFS`);
})().catch(e => { console.error(e); process.exit(1); });

function spawnLoud(file) {
  return require('child_process').spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
}
