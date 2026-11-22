// Sound, synthesised with WebAudio — no audio files, no network. Guard
// footsteps are short low thumps whose volume follows the guard's distance
// from the courier, so you can hear where a guard is. Everything else is a
// small oscillator or filtered-noise blip: the coin's clink, the alarm sting,
// a parcel pickup, and the win and lose phrases. The context is created on
// the first user gesture; until then every call is a safe no-op.

export function createAudio() {
  let context = null;
  let master = null;
  let ambient = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && context.state === 'suspended') {
      context.resume().catch(() => {});
    }
  }

  function tone(freq, dur, type, volume, when = 0) {
    if (!context || !master) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  function noiseBurst(dur, volume, cutoff) {
    if (!context || !master) return;
    const start = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    /** Call on the first key or click so the browser lets sound start. */
    unlock() {
      resume();
      if (!context || ambient) return;
      try {
        // A very quiet low drone under the game: the night hum.
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 55;
        const gain = context.createGain();
        gain.gain.value = 0.03;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        ambient = osc;
      } catch {
        // Silence is fine: the game never depends on sound.
      }
    },
    /** A guard's footstep; `distance` in pixels sets how loud it is. */
    footstep(distance) {
      if (!context) return;
      const volume = Math.max(0, 0.22 * (1 - distance / 520));
      if (volume < 0.02) return;
      noiseBurst(0.07, volume, 320);
    },
    /** The courier's own running step, softer than a guard's. */
    ownStep() {
      if (!context) return;
      noiseBurst(0.05, 0.08, 260);
    },
    /** A thrown coin landing: a bright ping. */
    clink() {
      tone(2093, 0.18, 'sine', 0.16);
      tone(2637, 0.12, 'sine', 0.1, 0.03);
    },
    /** A parcel picked up: two rising notes. */
    pickup() {
      tone(660, 0.12, 'triangle', 0.16);
      tone(990, 0.16, 'triangle', 0.16, 0.08);
    },
    /** A guard turns suspicious: a short questioning note. */
    suspicious() {
      tone(440, 0.2, 'square', 0.07);
    },
    /** The alarm: a rising two-tone sting. */
    alarm() {
      tone(392, 0.16, 'sawtooth', 0.12);
      tone(587, 0.28, 'sawtooth', 0.12, 0.14);
    },
    /** Caught: a falling phrase. */
    caught() {
      tone(330, 0.2, 'sawtooth', 0.12);
      tone(220, 0.34, 'sawtooth', 0.12, 0.16);
    },
    /** A level cleared: a short arpeggio. */
    levelClear() {
      tone(523, 0.12, 'triangle', 0.16);
      tone(659, 0.12, 'triangle', 0.16, 0.1);
      tone(784, 0.22, 'triangle', 0.16, 0.2);
    },
    /** All three deliveries made. */
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => tone(freq, 0.2, 'triangle', 0.16, i * 0.12));
    },
  };
}
