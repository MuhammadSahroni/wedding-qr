'use client';

/**
 * Audio system for Display App (Welcome Screen)
 * Plays "sfx greetings.mp3" when a guest checks in
 */

const WELCOME_SOUND_URL = '/sfx/sound-welcome.mp3';
const WELCOME_SOUND_FALLBACK_URL = '/sfx/sfx-greetings.mp3';

let welcomeAudio: HTMLAudioElement | null = null;
let isAudioUnlocked = false;

function getWelcomeAudio(): HTMLAudioElement | null {
  if (!welcomeAudio && typeof Audio !== 'undefined') {
    welcomeAudio = new Audio(WELCOME_SOUND_URL);
    welcomeAudio.preload = 'auto';
    welcomeAudio.onerror = () => {
      console.warn('[Display] Primary sound-welcome failed, switching to fallback');
      if (welcomeAudio) {
        welcomeAudio.src = WELCOME_SOUND_FALLBACK_URL;
        welcomeAudio.load();
      }
    };
  }
  return welcomeAudio;
}

export function playWelcomeSound() {
  try {
    const audio = getWelcomeAudio();
    if (audio) {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            isAudioUnlocked = true;
          })
          .catch((err) => {
            console.warn('[Display] Autoplay blocked by browser policy:', err);
          });
      }
    }
  } catch (e) {
    console.warn('[Display] Welcome sound error:', e);
  }
}

export function unlockAudio(): boolean {
  if (isAudioUnlocked) return true;
  try {
    const audio = getWelcomeAudio();
    if (audio) {
      audio.load();
      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
          isAudioUnlocked = true;
        }).catch(() => {});
      }
    }
    return true;
  } catch (e) {
    console.warn('[Display] Audio unlock error:', e);
    return false;
  }
}

export function initDisplayAudio(onUnlockedCallback?: () => void) {
  const handler = () => {
    unlockAudio();
    if (onUnlockedCallback) onUnlockedCallback();
    window.removeEventListener('click', handler);
    window.removeEventListener('touchstart', handler);
    window.removeEventListener('keydown', handler);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
  }
}
