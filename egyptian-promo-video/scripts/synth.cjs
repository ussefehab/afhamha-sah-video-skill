// Original music + sound effects for the promo, synthesized from scratch (no samples, no licensing).
// A 98 BPM Middle-Eastern trap beat in D Hijaz with darbuka, 808 bass and a plucked oud-like lead.
// Usage: node synth.cjs <outDir> <dropTime> <endTime>
const fs = require('fs');
const path = require('path');

const SR = 48000;
const [outDir, dropArg, endArg] = process.argv.slice(2);
const DROP = Number(dropArg);          // the beat drops on the reveal
const END = Number(endArg);            // last voice line ends here; music resolves after it
const TOTAL = END + 3.2;
const BPM = 98;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BAR / 16;
const N = Math.ceil(TOTAL * SR);

// Deterministic noise so every build sounds the same.
let seed = 1234567;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

const L = new Float32Array(N), R = new Float32Array(N);
const busRev = new Float32Array(N); // send to reverb

function add(buf, t, i, v) { const k = Math.floor(t * SR) + i; if (k >= 0 && k < N) buf[k] += v; }
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// ── Instruments ──────────────────────────────────────────────────────────────
function kick(t, g = 1) {
  const len = 0.45 * SR; let ph = 0;
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    const f = 45 + 110 * Math.exp(-s * 28);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.tanh(2.2 * Math.sin(ph)) * Math.exp(-s * 6.5) * 0.9 * g + (i < 120 ? rnd() * 0.25 * (1 - i / 120) * g : 0);
    add(L, t, i, v); add(R, t, i, v);
  }
}
function clap(t, g = 1) {
  let lp = 0, bp = 0;
  const len = 0.25 * SR;
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    const burst = s < 0.03 ? (Math.floor(s / 0.01) % 2 === 0 ? 1 : 0.4) : 1;
    const n = rnd();
    lp += 0.35 * (n - lp); bp = n - lp; // crude high-pass
    const v = bp * Math.exp(-s * 18) * burst * 0.42 * g;
    add(L, t, i, v * 0.95); add(R, t, i, v * 1.05); add(busRev, t, i, v * 0.5);
  }
}
function hat(t, g = 1, open = false) {
  let lp = 0;
  const len = (open ? 0.22 : 0.05) * SR;
  for (let i = 0; i < len; i++) {
    const s = i / SR; const n = rnd();
    lp += 0.6 * (n - lp);
    const v = (n - lp) * Math.exp(-s * (open ? 14 : 70)) * 0.16 * g;
    add(L, t, i, v * 0.8); add(R, t, i, v * 1.2);
  }
}
function doum(t, g = 1) {
  let ph = 0; const len = 0.3 * SR;
  for (let i = 0; i < len; i++) {
    const s = i / SR; const f = 95 + 60 * Math.exp(-s * 40);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * Math.exp(-s * 11) * 0.45 * g;
    add(L, t, i, v); add(R, t, i, v);
  }
}
function tek(t, g = 1) {
  let ph = 0, lp = 0; const len = 0.08 * SR;
  for (let i = 0; i < len; i++) {
    const s = i / SR; ph += (2 * Math.PI * 820) / SR;
    const n = rnd(); lp += 0.5 * (n - lp);
    const v = (Math.sin(ph) * 0.5 + (n - lp) * 0.8) * Math.exp(-s * 55) * 0.26 * g;
    add(L, t, i, v * 1.15); add(R, t, i, v * 0.85); add(busRev, t, i, v * 0.3);
  }
}
function bass808(t, midi, dur, g = 1) {
  let ph = 0; const len = Math.floor((dur + 0.15) * SR); const f = hz(midi);
  for (let i = 0; i < len; i++) {
    const s = i / SR;
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, s / 0.006) * (s < dur ? Math.exp(-s * 0.9) : Math.exp(-dur * 0.9) * Math.exp(-(s - dur) * 30));
    const v = Math.tanh(1.8 * Math.sin(ph)) * env * 0.42 * g;
    add(L, t, i, v); add(R, t, i, v);
  }
}
// Karplus-Strong pluck: an oud/qanun-like lead.
function pluck(t, midi, g = 1, pan = 0) {
  const f = hz(midi); const P = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(P); for (let i = 0; i < P; i++) buf[i] = rnd();
  const len = 1.6 * SR; let idx = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const nxt = 0.996 * 0.5 * (cur + prev); prev = cur; buf[idx] = nxt;
    idx = (idx + 1) % P;
    const v = cur * 0.22 * g * Math.min(1, i / 40);
    add(L, t, i, v * (1 - pan)); add(R, t, i, v * (1 + pan)); add(busRev, t, i, v * 0.7);
  }
}
// Soft detuned pad / drone.
function pad(t, midis, dur, g = 1) {
  const len = Math.floor(dur * SR); const ph = midis.map(() => [0, 0]); let lpL = 0, lpR = 0;
  for (let i = 0; i < len; i++) {
    const s = i / SR; let a = 0, b = 0;
    midis.forEach((m, k) => {
      const f = hz(m);
      ph[k][0] = (ph[k][0] + (f * 1.003) / SR) % 1; ph[k][1] = (ph[k][1] + (f * 0.997) / SR) % 1;
      a += ph[k][0] * 2 - 1; b += ph[k][1] * 2 - 1;
    });
    lpL += 0.035 * (a - lpL); lpR += 0.035 * (b - lpR);
    const env = Math.min(1, s / 0.8) * Math.min(1, (dur - s) / 0.8);
    add(L, t, i, lpL * env * 0.05 * g); add(R, t, i, lpR * env * 0.05 * g);
  }
}
// Rising filtered noise before the drop.
function riser(t, dur, g = 1) {
  let lp = 0; const len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const x = i / len; const n = rnd();
    lp += (0.02 + 0.6 * x * x) * (n - lp);
    const v = lp * x * x * 0.5 * g;
    add(L, t, i, v); add(R, t, i, v); add(busRev, t, i, v * 0.4);
  }
}
function impact(t, g = 1) {
  kick(t, 1.2 * g);
  let ph = 0; const len = 1.8 * SR;
  for (let i = 0; i < len; i++) {
    const s = i / SR; ph += (2 * Math.PI * (38 + 30 * Math.exp(-s * 6))) / SR;
    const v = (Math.sin(ph) * 0.5 + rnd() * 0.25 * Math.exp(-s * 9)) * Math.exp(-s * 2.2) * g;
    add(L, t, i, v); add(R, t, i, v); add(busRev, t, i, v * 0.6);
  }
}

// ── Arrangement ──────────────────────────────────────────────────────────────
// D Hijaz: D Eb F# G A Bb C D  (MIDI 62 63 66 67 69 70 72 74)
const ROOTS = [38, 38, 34, 36];            // D2 D2 Bb1 C2 (two bars each pair)
const PADS = [[50, 54, 57], [50, 54, 57], [46, 50, 53], [48, 51, 55]];
const MOTIF_A = [[0, 74], [3, 78], [6, 79], [8, 81], [10, 79], [12, 78], [14, 75]];
const MOTIF_B = [[0, 74], [2, 75], [4, 78], [6, 75], [8, 74], [11, 72], [14, 70]];

const firstBar = DROP - Math.ceil(DROP / BAR) * BAR; // bar grid lands a downbeat exactly on the drop
const endBeat = END + 0.25;

for (let b = 0; ; b++) {
  const t0 = firstBar + b * BAR;
  if (t0 > TOTAL) break;
  const preDrop = t0 < DROP - 0.01;
  const ending = t0 >= endBeat;
  const sec = ((b % 8) / 2) | 0; // chord index changes every 2 bars

  if (ending) break;

  if (preDrop) {
    // Tension: drone + sparse darbuka, the busy tone sits on top (added as SFX).
    if (b % 2 === 0 && t0 >= -BAR) pad(Math.max(0, t0), [50, 57, 62], BAR * 2 + 0.3, 0.9);
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * STEP; if (t < 0.0) continue;
      if (DROP - t < BAR * 2.2) { if (s === 0 || s === 6) doum(t, 0.7); if ([3, 10, 12, 14].includes(s)) tek(t, 0.6); }
    }
    continue;
  }

  // Main groove.
  pad(t0, PADS[sec], BAR + 0.05, 0.8);
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * STEP;
    if (t >= endBeat) break;
    if ([0, 7, 10].includes(s) || (b % 4 === 3 && s === 14)) kick(t);
    if (s === 4 || s === 12) clap(t);
    if (s % 2 === 0) hat(t, s % 4 === 2 ? 1 : 0.6);
    if (b % 2 === 1 && s >= 12) hat(t + STEP / 2, 0.5);          // 32nd-note roll at the end of every other bar
    if (s === 14 && b % 4 === 1) hat(t, 0.8, true);
    if (s === 0 || s === 6) doum(t, 0.5);
    if ([3, 9, 13].includes(s)) tek(t, 0.55);
  }
  // 808 follows the kick on the root.
  const root = ROOTS[sec];
  bass808(t0, root, STEP * 6.5);
  bass808(t0 + STEP * 7, root, STEP * 2.5, 0.9);
  bass808(t0 + STEP * 10, b % 2 ? root + 3 : root, STEP * 5);
  // Lead: motif A / B alternating, an octave lower in the second half for variety.
  const motif = b % 2 === 0 ? MOTIF_A : MOTIF_B;
  const oct = (b >> 3) % 2 ? -12 : 0;
  motif.forEach(([s, m], k) => { const t = t0 + s * STEP; if (t < endBeat) pluck(t, m + oct, 0.9, k % 2 ? 0.25 : -0.25); });
}
riser(DROP - BAR, BAR, 1);
impact(DROP, 0.9);
// Resolve: a final hit + long drone under the end card.
impact(endBeat, 0.7);
pad(endBeat, [50, 57, 62, 66], TOTAL - endBeat, 1.4);
pluck(endBeat + 0.02, 74, 1); pluck(endBeat + 0.05, 78, 0.8, 0.3); pluck(endBeat + 0.08, 81, 0.7, -0.3);

// ── Reverb (Schroeder) on the send bus ───────────────────────────────────────
function reverb(input) {
  const combs = [1557, 1617, 1491, 1422].map(d => ({ d: Math.round(d * SR / 44100), buf: null, i: 0 }));
  combs.forEach(c => (c.buf = new Float32Array(c.d)));
  const aps = [225, 556].map(d => ({ d: Math.round(d * SR / 44100), buf: null, i: 0 }));
  aps.forEach(a => (a.buf = new Float32Array(a.d)));
  const out = new Float32Array(input.length);
  for (let n = 0; n < input.length; n++) {
    let y = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.buf[c.i] = input[n] + o * 0.8; c.i = (c.i + 1) % c.d; y += o; }
    y *= 0.25;
    for (const a of aps) { const o = a.buf[a.i]; const v = -y + o; a.buf[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.d; y = v; }
    out[n] = y;
  }
  return out;
}
const rev = reverb(busRev);
for (let n = 0; n < N; n++) { L[n] += rev[n] * 0.35; R[n] += rev[(n + 331) % N] * 0.35; }

// Fade in the first 50 ms and out over the last 2.5 s; soft-clip the master.
for (let n = 0; n < N; n++) {
  const s = n / SR;
  const g = Math.min(1, s / 0.05) * Math.min(1, (TOTAL - s) / 2.5);
  L[n] = Math.tanh(L[n] * 0.9) * g; R[n] = Math.tanh(R[n] * 0.9) * g;
}

// ── Sound effects ───────────────────────────────────────────────────────────
function sfx(name, dur, fn) {
  const n = Math.floor(dur * SR); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  writeWav(path.join(outDir, name), [out, out]);
}
// Egyptian busy tone: 425 Hz, 0.5 s on / 0.5 s off, band-limited like a phone line.
sfx('busy.wav', 3.0, s => (s % 1 < 0.5 ? 1 : 0) * Math.min(1, (s % 1) / 0.01) * (Math.sin(2 * Math.PI * 425 * s) * 0.8 + Math.sin(2 * Math.PI * 850 * s) * 0.12) * 0.35);
// Whoosh: noise through a band-pass that sweeps up and back down.
{
  let low = 0, band = 0;
  sfx('whoosh.wav', 0.75, s => {
    const x = s / 0.75; const fc = 300 + 4200 * Math.sin(Math.PI * x);
    const f = 2 * Math.sin((Math.PI * fc) / SR); const n = rnd();
    low += f * band; const high = n - low - 0.5 * band; band += f * high;
    return band * Math.pow(Math.sin(Math.PI * x), 2) * 0.55;
  });
}
// Notification ding: two bell partials.
sfx('ding.wav', 1.2, s => (Math.sin(2 * Math.PI * 1318.5 * s) * Math.exp(-s * 5) + 0.6 * Math.sin(2 * Math.PI * 1975.5 * s) * Math.exp(-s * 6) + 0.25 * Math.sin(2 * Math.PI * 3640 * s) * Math.exp(-s * 12)) * 0.28 * Math.min(1, s / 0.002) +
  (s > 0.13 ? (Math.sin(2 * Math.PI * 1760 * (s - 0.13)) * Math.exp(-(s - 0.13) * 5)) * 0.22 : 0));
// Scanner beep (double).
sfx('beep.wav', 0.4, s => ((s < 0.09 || (s > 0.14 && s < 0.23)) ? Math.sin(2 * Math.PI * 1850 * s) * 0.3 : 0));
// Soft pop for chips appearing.
sfx('pop.wav', 0.12, s => Math.sin(2 * Math.PI * (900 * Math.exp(-s * 30) + 250) * s) * Math.exp(-s * 40) * 0.4);

writeWav(path.join(outDir, 'music.wav'), [L, R]);
console.log('music', TOTAL.toFixed(2), 's; drop at', DROP, '; first bar', firstBar.toFixed(3));

function writeWav(file, chans) {
  const n = chans[0].length, ch = chans.length;
  const b = Buffer.alloc(44 + n * ch * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(chans[c][i] * 32767))), o); o += 2; }
  fs.writeFileSync(file, b);
}
