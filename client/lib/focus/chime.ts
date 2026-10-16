// A short three-note chime when a timer phase ends, made with Web Audio (no sound files).

let ctx: AudioContext | null = null;

/** Call from a click (browsers only allow sound after the user interacts with the page). */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* no Web Audio: stay silent */ }
}

export function chime(notes: number[] = [660, 880, 1320]) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  notes.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    const at = t0 + i * 0.18;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(at);
    osc.stop(at + 1);
  });
}
