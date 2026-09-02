// ------------------------------------------------------------------
// Lightweight sound effects for key gamification moments (achievement
// earned, goal completed, scholarship won). Uses the Web Audio API to
// generate simple tones directly rather than needing external audio
// files — keeps this dependency-free and instant-loading.
//
// Respects a mute preference stored in localStorage (this is a real
// production website, not a chat artifact, so localStorage is the
// right tool here). Defaults to on for new visitors.
// ------------------------------------------------------------------

const ScholarSound = (function () {
  let ctx = null;
  function getContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function isMuted() {
    return localStorage.getItem('sb_sound_muted') === 'true';
  }
  function setMuted(muted) {
    localStorage.setItem('sb_sound_muted', muted ? 'true' : 'false');
  }

  // A short sequence of tones, each { freq, duration, delay, gain }.
  function playTones(tones) {
    if (isMuted()) return;
    try {
      const audioCtx = getContext();
      const now = audioCtx.currentTime;
      tones.forEach(({ freq, duration, delay = 0, gain = 0.12 }) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gainNode.gain.setValueAtTime(0, now + delay);
        gainNode.gain.linearRampToValueAtTime(gain, now + delay + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + duration);
      });
    } catch (err) {
      // Some browsers require a user gesture before audio can play —
      // fail silently rather than surface an error for a nice-to-have.
    }
  }

  return {
    isMuted,
    setMuted,
    // A gentle two-note rise — used for achievement badges and streak milestones.
    achievement() {
      playTones([
        { freq: 523.25, duration: 0.18, delay: 0 },
        { freq: 783.99, duration: 0.28, delay: 0.1 },
      ]);
    },
    // A slightly bigger three-note fanfare — used for completing a goal.
    goalComplete() {
      playTones([
        { freq: 523.25, duration: 0.15, delay: 0 },
        { freq: 659.25, duration: 0.15, delay: 0.1 },
        { freq: 987.77, duration: 0.35, delay: 0.2, gain: 0.14 },
      ]);
    },
    // A bright single chime — used when a scholarship is marked won.
    won() {
      playTones([{ freq: 880, duration: 0.3, gain: 0.13 }]);
    },
  };
})();
