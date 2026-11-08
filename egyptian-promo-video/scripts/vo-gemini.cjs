// Egyptian voice-over with Google Gemini TTS (free tier).
// The API key is read from marketing/video/.env (GEMINI_API_KEY=...) — never hard-code it here.
//
//   node vo-gemini.cjs voices                  → lists the Egyptian (ar-EG) voices
//   node vo-gemini.cjs sample <voice> [voice…] → records the hook line with each voice to vo/samples/ to compare
//   node vo-gemini.cjs all <voice>             → records all 10 lines as vo/s01.wav … s10.wav (old files are backed up)
//
// Optional in .env: GEMINI_TTS_MODEL (default gemini-3.8-flash-tts), GEMINI_TTS_STYLE (delivery direction).
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VO = path.join(ROOT, 'vo');
const ENV = path.join(ROOT, '.env');
const API = 'https://generativelanguage.googleapis.com/v1beta';

// The spoken lines, one per scene, written the way an Egyptian would say them (see SKILL.md).
const LINES = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8')).voice;

function env() {
  const out = {};
  if (fs.existsSync(ENV)) for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const E = env();
const KEY = E.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_TTS_MODEL || E.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
const STYLE = E.GEMINI_TTS_STYLE ||
  'Native Egyptian man from Cairo doing a social-media ad voice-over in natural colloquial Egyptian Arabic (عامية مصرية). Warm, confident, energetic and conversational — like talking to a friend, not reading. Natural Egyptian intonation and rhythm, no Modern Standard Arabic pronunciation.';
if (!KEY) { console.error(`Missing GEMINI_API_KEY in ${ENV}`); process.exit(1); }

async function api(p, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API + p, { ...opts, headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (r.ok) return r.json();
    const body = (await r.text()).slice(0, 400);
    // Free tier is rate-limited: wait and retry a few times on 429/503.
    if ((r.status === 429 || r.status === 503) && attempt < 5) { const wait = 15 * (attempt + 1); console.log(`  ${r.status}, retrying in ${wait}s…`); await new Promise(res => setTimeout(res, wait * 1000)); continue; }
    throw new Error(`${r.status} ${p}: ${body}`);
  }
}

async function voices() {
  const out = [];
  let token = '';
  do {
    const q = new URLSearchParams({ language_code: 'ar-EG', page_size: '200', ...(token && { page_token: token }) });
    const r = await api(`/voices?${q}`);
    out.push(...(r.voices || []));
    token = r.next_page_token || r.nextPageToken || '';
  } while (token);
  console.log(`${out.length} Egyptian voices:\n`);
  for (const v of out) {
    const id = v.id || v.voice_id || v.name;
    console.log(`- ${id}  ${v.display_name || v.displayName || ''}  ${v.gender || v.ssml_gender || ''}  ${(v.description || '').slice(0, 90)}`);
  }
  fs.mkdirSync(path.join(VO, 'samples'), { recursive: true });
  fs.writeFileSync(path.join(VO, 'samples', 'gemini-voices.json'), JSON.stringify(out, null, 1));
}

// gemini-3.8 takes the delivery style as metadata and pause tags inline; older TTS models take a spoken-style
// instruction in front of the text instead (it is not read aloud) and no tags.
const NEW_STYLE_API = /3\.8/.test(MODEL);
function ttsContent(text) {
  if (NEW_STYLE_API) return { type: 'text', text: text.replace(/…/g, '… <short pause>'), annotations: [{ type: 'speech_metadata', style: STYLE }] };
  return { type: 'text', text: `${STYLE}\nRead the following script exactly as written, with a clear pause between lines:\n\n${text.replace(/<short pause>/g, '').replace(/[ \t]+\n/g, '\n')}` };
}

async function speak(voice, text, outWav) {
  const r = await api('/interactions', {
    method: 'POST',
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'user_input', content: [ttsContent(text)] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    }),
  });
  const audio = (r.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(c => c.type === 'audio').pop();
  if (!audio?.data) throw new Error('No audio in response: ' + JSON.stringify(r).slice(0, 300));
  const raw = outWav.replace(/\.wav$/, '.raw.wav');
  const bytes = Buffer.from(audio.data, 'base64');
  fs.writeFileSync(raw, bytes);
  // 3.8 returns a WAV file; older models return headerless 16-bit PCM at 24 kHz.
  const input = bytes.subarray(0, 4).toString('latin1') === 'RIFF' ? ['-i', raw] : ['-f', 's16le', '-ar', String(audio.sample_rate || 24000), '-ac', '1', '-i', raw];
  // Trim silence at both ends, 48 kHz mono WAV for the video build.
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...input, '-af',
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse',
    '-ar', '48000', '-ac', '1', outWav]);
  fs.rmSync(raw);
}

/**
 * Splits a take into one span per line. Each cut goes on a pause near where that line should end
 * (estimated from the lines' lengths), preferring longer pauses — chosen together so the cuts stay in order.
 */
function splitPoints(file, lines) {
  const n = lines.length;
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-38dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map(m => +m[1]);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map(m => +m[1]);
  const total = Number(seconds(file));
  const gaps = starts.map((s, i) => ({ mid: (s + (ends[i] ?? total)) / 2, len: (ends[i] ?? total) - s })).filter(g => g.mid > 0.3 && g.mid < total - 0.3);
  if (gaps.length < n - 1) throw new Error(`Found only ${gaps.length} pauses for ${n} lines — use "all-lines" instead.`);
  const weight = lines.map(l => l.replace(/\s+/g, '').length);
  const sum = weight.reduce((a, b) => a + b, 0);
  let acc = 0;
  const expect = weight.slice(0, -1).map(w => (acc += w) / sum * total);
  const cost = (i, j) => Math.abs(gaps[j].mid - expect[i]) - 2.5 * gaps[j].len;
  // best[i][j]: lowest total cost with cut i on gap j (cuts strictly increasing).
  const best = expect.map(() => gaps.map(() => Infinity)), from = expect.map(() => gaps.map(() => -1));
  gaps.forEach((g, j) => { best[0][j] = cost(0, j); });
  for (let i = 1; i < expect.length; i++) {
    let runMin = Infinity, runArg = -1;
    for (let j = 0; j < gaps.length; j++) {
      if (j > 0 && best[i - 1][j - 1] < runMin) { runMin = best[i - 1][j - 1]; runArg = j - 1; }
      if (runArg >= 0) { best[i][j] = runMin + cost(i, j); from[i][j] = runArg; }
    }
  }
  const last = expect.length - 1;
  let j = best[last].indexOf(Math.min(...best[last]));
  const cuts = [];
  for (let i = last; i >= 0; i--) { cuts.unshift(gaps[j].mid); j = from[i][j]; }
  const bounds = [0, ...cuts, total];
  return bounds.slice(0, -1).map((a, i) => [a, bounds[i + 1]]);
}

const seconds = f =>Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim()).toFixed(2);

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'voices') return voices();
  if (!args.length) throw new Error('Pass a voice (see "voices")');
  if (cmd === 'sample') {
    const dir = path.join(VO, 'samples'); fs.mkdirSync(dir, { recursive: true });
    for (const v of args) {
      const out = path.join(dir, `hook-${v}.wav`);
      await speak(v, LINES[0], out);
      console.log(`${v}: ${out} (${seconds(out)}s)`);
    }
    return;
  }
  if (cmd === 'line') {
    // Re-record one line: node vo-gemini.cjs line <voice> <number>
    const i = Number(args[1]) - 1;
    const out = path.join(VO, `s${String(i + 1).padStart(2, '0')}.wav`);
    if (fs.existsSync(out)) fs.copyFileSync(out, out.replace(/\.wav$/, '.prev.wav'));
    await speak(args[0], LINES[i], out);
    console.log(`s${i + 1}: ${seconds(out)}s`);
    return;
  }
  if (cmd === 'all' || cmd === 'all-lines') {
    // "all" records the whole script in ONE request (the free tier allows only a few requests a day, and one
    // continuous take sounds more natural), then splits it at the pauses between lines. "all-lines" = one request per line.
    const tmp = path.join(VO, 'take');
    fs.mkdirSync(tmp, { recursive: true });
    const clips = [];
    if (cmd === 'all') {
      const take = path.join(tmp, `full-${args[0]}-${MODEL}.wav`);
      if (!fs.existsSync(take)) await speak(args[0], LINES.join(' <short pause> <short pause>\n'), take);
      console.log('full take:', seconds(take) + 's');
      const cuts = splitPoints(take, LINES);
      cuts.forEach(([a, b], i) => {
        const out = path.join(tmp, `s${String(i + 1).padStart(2, '0')}.wav`);
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', take, '-ss', a.toFixed(3), '-to', b.toFixed(3), '-af',
          'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse',
          '-ar', '48000', '-ac', '1', out]);
        clips.push(out);
      });
    } else {
      for (let i = 0; i < LINES.length; i++) {
        const out = path.join(tmp, `s${String(i + 1).padStart(2, '0')}.wav`);
        await speak(args[0], LINES[i], out);
        clips.push(out);
      }
    }
    // Only now replace the video's voice-over (the old one is kept).
    const backup = path.join(VO, 'backup-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
    fs.mkdirSync(backup, { recursive: true });
    for (const f of fs.readdirSync(VO)) if (/^s\d+\.(wav|mp3)$/.test(f)) fs.renameSync(path.join(VO, f), path.join(backup, f));
    clips.forEach((c, i) => { const out = path.join(VO, path.basename(c)); fs.copyFileSync(c, out); console.log(`s${i + 1}: ${seconds(out)}s`); });
    console.log('Previous voice-over backed up in', backup);
    return;
  }
  throw new Error('Unknown command: ' + cmd);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
