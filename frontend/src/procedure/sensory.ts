/**
 * Sound and vibration for the workshop.
 *
 * Tones are synthesised, so nothing has to be downloaded and they work offline. Everything is
 * optional: a muted device, a browser without Web Audio or a learner who turned sound off still
 * gets the same information on screen.
 */

import type { ConsequenceEffect } from "../api/learning";

export type Cue = "correct" | "wrong" | "pick" | "complete" | ConsequenceEffect;

const SOUND_KEY = "opedu:sound";

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // The preference simply lasts for this page only.
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Constructor) return null;
  try {
    context ??= new Constructor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(
  output: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.12,
) {
  const oscillator = output.createOscillator();
  const gain = output.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  const begin = output.currentTime + start;
  gain.gain.setValueAtTime(0, begin);
  gain.gain.linearRampToValueAtTime(volume, begin + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, begin + duration);
  oscillator.connect(gain).connect(output.destination);
  oscillator.start(begin);
  oscillator.stop(begin + duration + 0.02);
}

function crackle(output: AudioContext, duration: number, volume = 0.2) {
  const frames = Math.floor(output.sampleRate * duration);
  const buffer = output.createBuffer(1, frames, output.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    // Short random bursts that die away: the sound of an electrical arc.
    const burst = Math.random() < 0.18 ? 1 : 0.15;
    data[index] = (Math.random() * 2 - 1) * burst * (1 - index / frames);
  }
  const source = output.createBufferSource();
  const gain = output.createGain();
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain).connect(output.destination);
  source.start();
}

const VIBRATION: Record<Cue, number | number[]> = {
  correct: 30,
  pick: 12,
  wrong: [60, 50, 60],
  complete: [40, 60, 40, 60, 120],
  spark: [20, 30, 20, 30, 160],
  blown_fuse: [120, 60, 40],
  hazard: [200, 80, 200],
  damage: [120, 60, 120],
  wrong_reading: [60, 50, 60],
  none: [60, 50, 60],
};

/** Play the cue for something that just happened. Safe to call anywhere, any number of times. */
export function cue(kind: Cue) {
  try {
    navigator.vibrate?.(VIBRATION[kind]);
  } catch {
    // Vibration is a bonus.
  }
  if (!soundEnabled()) return;
  const output = audio();
  if (!output) return;
  switch (kind) {
    case "correct":
      tone(output, 660, 0, 0.12);
      tone(output, 880, 0.09, 0.18);
      break;
    case "pick":
      tone(output, 520, 0, 0.06, "triangle", 0.08);
      break;
    case "complete":
      [523, 659, 784, 1047].forEach((frequency, index) =>
        tone(output, frequency, index * 0.11, 0.3, "triangle", 0.13),
      );
      break;
    case "spark":
      crackle(output, 0.45);
      tone(output, 90, 0, 0.3, "sawtooth", 0.1);
      break;
    case "blown_fuse":
      crackle(output, 0.12, 0.25);
      tone(output, 240, 0.05, 0.25, "square", 0.07);
      break;
    case "hazard":
      tone(output, 440, 0, 0.16, "square", 0.09);
      tone(output, 330, 0.2, 0.3, "square", 0.09);
      break;
    case "damage":
      tone(output, 160, 0, 0.3, "sawtooth", 0.1);
      break;
    default:
      tone(output, 200, 0, 0.2, "sawtooth", 0.08);
  }
}
