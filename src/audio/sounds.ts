export type SoundName = 'fire' | 'miss' | 'hit' | 'sunk' | 'win' | 'lose';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number };

function play(notes: Note[]): void {
  const ac = context();
  if (!ac) return;
  const now = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, now + n.at);
    amp.gain.setValueAtTime(0, now + n.at);
    amp.gain.linearRampToValueAtTime(n.gain ?? 0.15, now + n.at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.001, now + n.at + n.dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(now + n.at);
    osc.stop(now + n.at + n.dur + 0.05);
  }
}

const SOUNDS: Record<SoundName, Note[]> = {
  fire: [{ freq: 220, at: 0, dur: 0.08, type: 'square', gain: 0.05 }],
  miss: [{ freq: 330, at: 0, dur: 0.25, type: 'sine', gain: 0.08 }],
  hit: [
    { freq: 110, at: 0, dur: 0.3, type: 'sawtooth', gain: 0.12 },
    { freq: 80, at: 0.05, dur: 0.3, type: 'square', gain: 0.08 },
  ],
  sunk: [
    { freq: 90, at: 0, dur: 0.5, type: 'sawtooth', gain: 0.14 },
    { freq: 60, at: 0.1, dur: 0.6, type: 'square', gain: 0.1 },
    { freq: 45, at: 0.25, dur: 0.6, type: 'sawtooth', gain: 0.1 },
  ],
  win: [
    { freq: 523, at: 0, dur: 0.15 },
    { freq: 659, at: 0.15, dur: 0.15 },
    { freq: 784, at: 0.3, dur: 0.15 },
    { freq: 1047, at: 0.45, dur: 0.4 },
  ],
  lose: [
    { freq: 392, at: 0, dur: 0.25 },
    { freq: 330, at: 0.25, dur: 0.25 },
    { freq: 262, at: 0.5, dur: 0.5 },
  ],
};

export function playSound(name: SoundName): void {
  try {
    play(SOUNDS[name]);
  } catch {
    // Audio is best-effort; never let it break the game.
  }
}
