// Fallback voice-over: Microsoft Edge neural voices (free, no key, unlimited) — ar-EG-ShakirNeural / ar-EG-SalmaNeural.
// Clear but noticeably synthetic and closer to MSA; prefer vo-gemini.cjs when a natural Egyptian voice matters.
// Needs: npm i msedge-tts@2 (v1 can't connect anymore).
// Usage: node vo-edge.cjs [voice] [rate]     e.g. node vo-edge.cjs ar-EG-ShakirNeural +12%
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VO = path.join(ROOT, 'vo');
const LINES = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8')).voice;
const [VOICE = 'ar-EG-ShakirNeural', RATE = '+12%'] = process.argv.slice(2);

(async () => {
  fs.mkdirSync(VO, { recursive: true });
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  for (let i = 0; i < LINES.length; i++) {
    const tmp = path.join(VO, `tmp${i}`);
    fs.mkdirSync(tmp, { recursive: true });
    // Edge reads "…" as a long pause; commas give a more natural rhythm.
    const { audioFilePath } = await tts.toFile(tmp, LINES[i].replace(/…/g, '،'), { rate: RATE });
    const out = path.join(VO, `s${String(i + 1).padStart(2, '0')}.wav`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', audioFilePath, '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse',
      '-ar', '48000', '-ac', '1', out]);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(path.basename(out), execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim() + 's');
  }
  tts.close();
})().catch(e => { console.error('ERROR', e.message || e); process.exit(1); });
