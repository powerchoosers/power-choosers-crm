/**
 * Nodal Point Forensic Audio System
 * Uses Web Audio API to synthesize sounds dynamically.
 * Zero dependencies, no MP3 files to load, zero network latency.
 */

import { useUIStore } from '@/store/uiStore';

// Synthesizer utility
const playSynth = (
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  vol: number = 0.5
) => {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  
  // Check global master toggle
  if (!useUIStore.getState().soundEnabled) return;

  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;

    // Frequency Envelope
    oscillator.frequency.setValueAtTime(freqStart, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + duration);

    // Amplitude Envelope (quick attack, fade out)
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn("Audio generation failed or blocked by browser:", e);
  }
};

/**
 * Tactical Ping (Sonar)
 * Used for receiving a new signal/message.
 */
export const playPing = () => {
  if (useUIStore.getState().soundIncomingEnabled) {
    playSynth('sine', 880, 440, 0.4, 0.2);
  }
};

/**
 * Navigation Transition
 * A softer, sine-based sound for menu selections.
 */
export const playNavigation = () => {
  if (useUIStore.getState().soundNavigationEnabled) {
    playSynth('sine', 440, 220, 0.08, 0.15);
  }
};

/**
 * Nav Tick
 * Simulates a physical mouse click — filtered noise burst, 12ms transient.
 */
export const playNavTick = () => {
  if (!useUIStore.getState().soundEnabled) return;
  if (!useUIStore.getState().soundNavigationEnabled) return;
  if (typeof window === 'undefined' || !window.AudioContext) return;

  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioCtx.sampleRate;
    const duration = 0.012; // 12ms
    const bufferSize = Math.floor(sampleRate * duration);

    const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // White noise shaped with a steep exponential decay envelope
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    // Bandpass to shape it like a physical click (cut lows + highs)
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
  } catch (e) {
    console.warn('Audio generation failed or blocked by browser:', e);
  }
};

/**
 * Forensic Click
 * Used for UI interactions like clicking buttons or toggles.
 */
export const playClick = () => {
  if (useUIStore.getState().soundActionEnabled) {
    playSynth('square', 300, 50, 0.05, 0.1);
  }
};

/**
 * Critical Alert (Klaxon)
 * Used for high-priority alerts (e.g. Demand ratchet exposure spike).
 */
export const playAlert = () => {
  if (useUIStore.getState().soundCriticalEnabled) {
    playSynth('sawtooth', 200, 200, 0.8, 0.3);
    // Double pulse
    setTimeout(() => playSynth('sawtooth', 200, 200, 0.8, 0.3), 1000);
  }
};

/**
 * Subtle Notification
 * Standard low-frequency background telemetry thud.
 */
export const playThud = () => {
  if (useUIStore.getState().soundIncomingEnabled) {
    playSynth('sine', 150, 40, 0.2, 0.3);
  }
};
