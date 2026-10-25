/* Every sound is synthesized with Web Audio, so the site ships no audio files. */
window.Sound = (() => {
  let ctx, master, drone;
  let on = false;
  // soundtrack: <audio> -> lowpass (for muffled "underwater" moments) -> gain
  let musicEl = null, music = null;
  let muffled = false;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }

  // attack/decay envelope from node into master
  function env(node, t, attack, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    g.connect(master);
    return g;
  }

  function tone(freq, type, attack, peak, decay, when = 0) {
    if (!on) return null;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    env(o, t, attack, peak, decay);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return { o, t };
  }

  function noise(dur, filterType, freq, q, peak, when = 0) {
    if (!on) return null;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    src.connect(f);
    env(f, t, 0.005, peak, dur);
    src.start(t);
    return { src, f, t };
  }

  function startDrone() {
    if (drone) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    f.connect(g);
    const oscs = [55, 82.41, 110.6].map((fr, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = fr;
      o.detune.value = (i - 1) * 7;
      o.connect(f);
      o.start();
      return o;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(f.frequency);
    lfo.start();
    g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 5);
    drone = { g, oscs, lfo };
  }

  function stopDrone() {
    if (!drone) return;
    const { g, oscs, lfo } = drone;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => { oscs.forEach(o => o.stop()); lfo.stop(); }, 700);
    drone = null;
  }

  const MUSIC_VOL = 0.6;
  function startMusic() {
    if (!music) {
      const src = ctx.createMediaElementSource(musicEl);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = muffled ? 650 : 20000;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      music = { filter, gain };
    }
    const t = ctx.currentTime;
    music.gain.gain.cancelScheduledValues(t);
    music.gain.gain.setValueAtTime(music.gain.gain.value, t);
    music.gain.gain.linearRampToValueAtTime(MUSIC_VOL, t + 4);
    musicEl.play().catch(() => {});
  }
  function stopMusic() {
    if (!music) return;
    const t = ctx.currentTime;
    music.gain.gain.cancelScheduledValues(t);
    music.gain.gain.setValueAtTime(music.gain.gain.value, t);
    music.gain.gain.linearRampToValueAtTime(0, t + 0.8);
    setTimeout(() => { if (!on) musicEl.pause(); }, 850);
  }

  return {
    get on() { return on; },
    useMusic(el) { musicEl = el; },
    enable() {
      init(); ctx.resume(); on = true;
      musicEl ? startMusic() : startDrone();
    },
    disable() { if (ctx) { stopDrone(); stopMusic(); } on = false; },
    // lowpass the soundtrack, as if heard through a wall or under water
    muffle(state, seconds = 1.2) {
      muffled = state;
      if (!music) return;
      music.filter.frequency.setTargetAtTime(state ? 650 : 20000, ctx.currentTime, seconds / 3);
    },
    // a brief drop-out, for glitches
    dropout(ms = 450) {
      if (!music) return;
      const g = music.gain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.02, t + 0.03);
      g.setValueAtTime(0.02, t + ms / 1000);
      g.linearRampToValueAtTime(on ? MUSIC_VOL : 0, t + ms / 1000 + 0.6);
    },
    pauseMusic() { if (musicEl && on) musicEl.pause(); },
    resumeMusic() { if (musicEl && on) musicEl.play().catch(() => {}); },

    tick() { tone(2300 + Math.random() * 300, 'square', 0.001, 0.01, 0.02); },
    ping() { tone(1568, 'sine', 0.004, 0.05, 0.45); tone(2349, 'sine', 0.004, 0.02, 0.3, 0.05); },
    chime() {
      tone(880, 'sine', 0.005, 0.12, 1.4);
      tone(1318.5, 'sine', 0.005, 0.06, 1.1, 0.07);
      tone(1760, 'triangle', 0.005, 0.03, 0.8, 0.14);
    },
    close() { tone(1318.5, 'sine', 0.005, 0.05, 0.4); tone(880, 'sine', 0.005, 0.06, 0.6, 0.08); },
    coin() { tone(1975, 'square', 0.002, 0.035, 0.07); tone(2637, 'square', 0.002, 0.035, 0.3, 0.07); },
    boom() {
      const r = tone(140, 'sine', 0.01, 0.5, 1.9);
      if (r) r.o.frequency.exponentialRampToValueAtTime(30, r.t + 1.7);
      noise(1.4, 'lowpass', 380, 0.7, 0.25);
      tone(440, 'sine', 0.3, 0.04, 2.5, 0.1);
      tone(659.3, 'sine', 0.4, 0.03, 2.5, 0.2);
    },
    whoosh() {
      const n = noise(1.1, 'bandpass', 260, 1.2, 0.16);
      if (n) n.f.frequency.exponentialRampToValueAtTime(3400, n.t + 1);
    },
    glitch() {
      for (let i = 0; i < 6; i++) noise(0.03 + Math.random() * 0.06, 'bandpass', 400 + Math.random() * 4200, 4, 0.28, i * 0.065);
      tone(55, 'sawtooth', 0.005, 0.14, 0.35);
    },
    thud() { const r = tone(90, 'sine', 0.005, 0.4, 0.6); if (r) r.o.frequency.exponentialRampToValueAtTime(40, r.t + 0.5); noise(0.25, 'lowpass', 600, 0.6, 0.12); },
    danger() { tone(196, 'sawtooth', 0.005, 0.05, 0.25); tone(185, 'sawtooth', 0.005, 0.05, 0.3, 0.12); },
  };
})();
