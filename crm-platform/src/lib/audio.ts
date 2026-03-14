/**
 * Nodal Point Forensic Audio System
 * Uses Web Audio API to synthesize sounds dynamically.
 * Zero dependencies, no MP3 files to load, zero network latency.
 */

// Synthesizer utility
const playSynth = (
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  vol: number = 0.5
) => {
  if (typeof window === 'undefined' || !window.AudioContext) return;

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
  playSynth('sine', 880, 440, 0.4, 0.2);
};

/**
 * Forensic Click
 * Used for UI interactions like clicking buttons or toggles.
 */
export const playClick = () => {
  playSynth('square', 300, 50, 0.05, 0.1);
};

/**
 * Critical Alert (Klaxon)
 * Used for high-priority alerts (e.g. Demand ratchet exposure spike).
 */
export const playAlert = () => {
  playSynth('sawtooth', 200, 200, 0.8, 0.3);
  // Double pulse
  setTimeout(() => playSynth('sawtooth', 200, 200, 0.8, 0.3), 1000);
};

/**
 * Subtle Notification
 * Standard low-frequency background telemetry thud.
 */
export const playThud = () => {
  playSynth('sine', 150, 40, 0.2, 0.3);
};
