/**
 * Audio feedback system using Web Audio API
 * No external audio files needed
 */

let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

// Success chime - pleasant double beep
export function playSuccess() {
  playTone(880, 0.15, 'sine', 0.25);
  setTimeout(() => playTone(1320, 0.25, 'sine', 0.2), 150);
}

// Duplicate warning - low double buzz
export function playDuplicate() {
  playTone(330, 0.2, 'square', 0.15);
  setTimeout(() => playTone(330, 0.3, 'square', 0.15), 250);
}

// Error alert - descending buzz
export function playError() {
  playTone(440, 0.15, 'sawtooth', 0.15);
  setTimeout(() => playTone(220, 0.3, 'sawtooth', 0.15), 150);
}

// Initialize audio context (must be called on user interaction)
export function initAudio() {
  try {
    getAudioContext();
    // Play a silent tone to unlock audio
    playTone(1, 0.01, 'sine', 0.001);
  } catch (e) {
    console.warn('Audio init failed:', e);
  }
}
