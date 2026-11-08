// Checks the split voice-over: transcribes each clip with Gemini so the cut points can be verified without listening.
// Usage: node transcribe.cjs [s02 s05 …]   (default: all clips)
const fs = require('fs');
const path = require('path');
const ENV = path.resolve(__dirname, '..', '.env');
const KEY = (fs.readFileSync(ENV, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim();
const VO = path.resolve(__dirname, '..', 'vo');
const MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];

async function transcribe(file) {
  const body = { contents: [{ parts: [
    { inline_data: { mime_type: 'audio/wav', data: fs.readFileSync(file).toString('base64') } },
    { text: 'Transcribe this short Egyptian Arabic audio exactly as spoken. Output only the Arabic transcript, nothing else.' },
  ] }] };
  for (let attempt = 0; attempt < 6; attempt++) {
    const model = MODELS[attempt % MODELS.length];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
      });
      const j = await r.json();
      const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
      if (text) return text;
      if (![429, 500, 503].includes(j.error?.code)) return 'ERROR ' + JSON.stringify(j.error || j).slice(0, 150);
    } catch { /* timeout: retry */ }
    await new Promise(r => setTimeout(r, 8000 * (attempt + 1)));
  }
  return 'ERROR: no answer after retries';
}

(async () => {
  const only = process.argv.slice(2);
  const files = fs.readdirSync(VO).filter(f => /^s\d+\.wav$/.test(f) && (!only.length || only.includes(f.replace('.wav', '')))).sort();
  for (const f of files) console.log(`${f}: ${await transcribe(path.join(VO, f))}`);
})();
