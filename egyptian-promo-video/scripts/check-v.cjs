// Asks Gemini whether the brand name in each clip is said with a V or an F (a check we can't do by ear here).
const fs = require('fs');
const path = require('path');
const KEY = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)[1].trim();
const VO = path.resolve(__dirname, '..', 'vo');
const PROMPT = 'This Egyptian Arabic clip starts with "مع" followed by a brand name. Listen carefully to the consonant in the middle of the brand name. ' +
  'Is it a voiced labiodental /v/ (as in English "very") or a voiceless /f/ (as in "fix")? Answer in exactly this format: "SOUND: V" or "SOUND: F", then "IPA: <IPA of the brand name>", then "CONFIDENCE: <low/medium/high>".';

async function ask(file) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const model = ['gemini-3.8-flash', 'gemini-3.5-flash'][attempt % 2];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'audio/wav', data: fs.readFileSync(file).toString('base64') } }, { text: PROMPT }] }] }),
      });
      const j = await r.json();
      const t = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
      if (t) return `${model}: ${t.replace(/\s+/g, ' ')}`;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 6000 * (attempt + 1)));
  }
  return 'no answer';
}

(async () => {
  for (const name of process.argv.slice(2)) {
    // Ask twice per clip so one odd answer doesn't decide it.
    console.log(name, '→', await ask(path.join(VO, name + '.wav')));
    console.log(name, '→', await ask(path.join(VO, name + '.wav')));
  }
})();
