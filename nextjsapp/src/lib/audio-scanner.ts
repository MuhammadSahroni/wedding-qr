'use client';

/**
 * Audio feedback system for Scanner App
 */

const SUCCESS_SOUND_URL = '/sfx/sound-success.mp3';
const ERROR_SOUND_URL = '/sfx/sound-error.mp3';

let successAudio: HTMLAudioElement | null = null;
let errorAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

function getSuccessAudio(): HTMLAudioElement | null {
  if (!successAudio && typeof Audio !== 'undefined') {
    successAudio = new Audio(SUCCESS_SOUND_URL);
    successAudio.preload = 'auto';
  }
  return successAudio;
}

function getErrorAudio(): HTMLAudioElement | null {
  if (!errorAudio && typeof Audio !== 'undefined') {
    errorAudio = new Audio(ERROR_SOUND_URL);
    errorAudio.preload = 'auto';
  }
  return errorAudio;
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!audioContext && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
    }
  }
  return audioContext;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
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
    console.warn('Audio tone playback failed:', e);
  }
}

function playSynthSuccess() {
  playTone(880, 0.15, 'sine', 0.25);
  setTimeout(() => playTone(1320, 0.25, 'sine', 0.2), 150);
}

function playSynthError() {
  playTone(440, 0.15, 'sawtooth', 0.15);
  setTimeout(() => playTone(220, 0.3, 'sawtooth', 0.15), 150);
}

export function playSuccess() {
  try {
    const audio = getSuccessAudio();
    if (audio) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Success MP3 play failed, falling back to synth:', err);
          playSynthSuccess();
        });
      }
    } else {
      playSynthSuccess();
    }
  } catch (e) {
    console.warn('Success audio error, using synth:', e);
    playSynthSuccess();
  }
}

export function playError() {
  try {
    const audio = getErrorAudio();
    if (audio) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Error MP3 play failed, falling back to synth:', err);
          playSynthError();
        });
      }
    } else {
      playSynthError();
    }
  } catch (e) {
    console.warn('Error audio failed, using synth:', e);
    playSynthError();
  }
}

export function playDuplicate() {
  playError();
}

export function initAudio() {
  if (audioUnlocked) return;
  try {
    const unlock = () => {
      audioUnlocked = true;
      const successA = getSuccessAudio();
      if (successA) successA.load();
      const errorA = getErrorAudio();
      if (errorA) errorA.load();

      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  } catch (e) {
    console.warn('Audio init failed:', e);
  }
}
