/**
 * Audio system for Display App (Welcome Screen)
 * Plays "sfx greetings.mp3" when a guest checks in
 */

const WELCOME_SOUND_URL = '/sfx/sound-welcome.mp3';
const WELCOME_SOUND_FALLBACK_URL = '/sfx/sfx%20greetings.mp3';

let welcomeAudio = null;
let isAudioUnlocked = false;

function getWelcomeAudio() {
  if (!welcomeAudio && typeof Audio !== 'undefined') {
    welcomeAudio = new Audio(WELCOME_SOUND_URL);
    welcomeAudio.preload = 'auto';
    welcomeAudio.onerror = () => {
      console.warn('[Display] Primary sound-welcome failed, switching to sfx greetings');
      welcomeAudio.src = WELCOME_SOUND_FALLBACK_URL;
      welcomeAudio.load();
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

export function unlockAudio() {
  if (isAudioUnlocked) return true;
  try {
    const audio = getWelcomeAudio();
    if (audio) {
      audio.load();
      // Play and pause quickly to unlock on modern browsers
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

// Global user interaction listener to unlock audio on first interaction
export function initAudio(onUnlockedCallback) {
  const handler = () => {
    unlockAudio();
    if (onUnlockedCallback) onUnlockedCallback();
    window.removeEventListener('click', handler);
    window.removeEventListener('touchstart', handler);
    window.removeEventListener('keydown', handler);
  };

  window.addEventListener('click', handler, { once: true });
  window.addEventListener('touchstart', handler, { once: true });
  window.addEventListener('keydown', handler, { once: true });
}
