(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const html = document.documentElement;
  html.classList.add('js');

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- storage (per-browser convenience only) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  /* ---------- HD image system ----------
     Every <img data-hd="path/name"> ships with a small original as its src so the page
     paints instantly. When the image is about to be seen, the AI-upscaled WebP that fits
     the screen (1920 or 3840 wide) is fetched, decoded off-thread, then swapped in. */
  const dpr = Math.min(devicePixelRatio || 1, 2);
  function pickSize(el) {
    const r = el.getBoundingClientRect();
    // the hero gets pushed to 3.6x on scroll, so it always takes the 4K file on larger screens
    if (el.hasAttribute('data-eager') && innerWidth >= 900) return 3840;
    const need = Math.max(r.width, r.height, innerWidth * 0.5) * dpr;
    return need > 1500 ? 3840 : 1920;
  }
  function loadHD(img) {
    if (img.dataset.hdDone) return;
    img.dataset.hdDone = '1';
    const url = `${img.dataset.hd}-${pickSize(img)}.webp`;
    const pre = new Image();
    pre.src = url;
    pre.decode().then(() => {
      img.src = url;
      img.classList.add('hd-in');
    }).catch(() => { /* keep the original if the HD file fails */ });
  }
  const hdImgs = $$('img[data-hd]');
  hdImgs.filter(i => i.hasAttribute('data-eager') || i.closest('#titlecard')).forEach(loadHD);
  const hdObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { loadHD(e.target); hdObserver.unobserve(e.target); } });
  }, { rootMargin: '150% 0px' });
  hdImgs.forEach(i => hdObserver.observe(i));
  // the six faces are a CSS background, so they swap through a custom property
  const facesHD = new Image();
  facesHD.src = `assets/img/hd/faces-${innerWidth * dpr > 1400 ? 3840 : 1920}.webp`;
  facesHD.decode().then(() => html.style.setProperty('--faces', `url(${facesHD.src})`)).catch(() => {});

  /* ---------- text splitting ---------- */
  const hasSeg = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
  const segG = hasSeg ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
  const graphemes = t => segG ? [...segG.segment(t)].map(s => s.segment) : Array.from(t);

  function splitWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const out = [];
    nodes.forEach(n => {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(w => {
        if (!w) return;
        if (/^\s+$/.test(w)) { frag.append(w); return; }
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w;
        frag.append(s);
        out.push(s);
      });
      n.replaceWith(frag);
    });
    return out;
  }

  function splitChars(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    return graphemes(text).map(g => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = g === ' ' ? ' ' : g;
      el.append(s);
      return s;
    });
  }
  $$('[data-split-chars]').forEach(splitChars);

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  const lockScroll = () => { document.body.classList.add('is-locked'); lenis && lenis.stop(); };
  const unlockScroll = () => {
    // the story always starts at the top, even if something scrolled the page while it was locked
    document.body.classList.remove('is-locked');
    window.scrollTo(0, 0);
    if (lenis) { lenis.start(); lenis.scrollTo(0, { immediate: true, force: true }); }
    ScrollTrigger.refresh();
  };
  const scrollToY = (y) => lenis ? lenis.scrollTo(y, { duration: 2.6 }) : window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });

  /* ---------- letterbox bars ---------- */
  const barH = (vh) => `${Math.round(innerHeight * vh / 100)}px`;
  const bars = (vh, duration = 1.2) => gsap.to(html, { '--bar': barH(vh), duration: reduce ? 0 : duration, ease: 'power3.inOut', overwrite: 'auto' });

  /* ---------- toasts: system messages ---------- */
  const toastBox = $('#toasts');
  function sysMsg(content, kind = '', sound = true) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.innerHTML = `<span class="toast__b">[</span> ${content} <span class="toast__b">]</span>`;
    toastBox.append(el);
    while (toastBox.children.length > 4) toastBox.firstElementChild.remove();
    if (sound) kind === 'danger' ? Sound.danger() : Sound.ping();
    gsap.fromTo(el,
      { clipPath: 'inset(0 0 0 100%)', x: 24 },
      { clipPath: 'inset(0 0 0 0%)', x: 0, duration: reduce ? 0 : 0.5, ease: 'expo.out' });
    gsap.to(el, {
      autoAlpha: 0, x: 16, delay: 4.6, duration: 0.5, ease: 'power2.in',
      onComplete: () => el.remove(),
    });
  }

  /* ---------- coins ---------- */
  let coins = store.get('orv.coins', 0);
  let sponsored = store.get('orv.sponsored', 0);
  const coinEls = [$('#coinCount'), $('#sponsorCoins')];
  const shown = { c: coins, s: sponsored };
  function renderCoins() {
    gsap.to(shown, {
      c: coins, s: sponsored, duration: 1.1, ease: 'power3.out', overwrite: true,
      onUpdate: () => {
        coinEls.forEach(el => el && (el.textContent = Math.round(shown.c).toLocaleString('en-US')));
        $('#sponsoredCount').textContent = Math.round(shown.s).toLocaleString('en-US');
      },
    });
  }
  function addCoins(n, reason) {
    coins += n;
    store.set('orv.coins', coins);
    renderCoins();
    sysMsg(`${reason} <b>+${n.toLocaleString('en-US')} coins</b>`, 'gold', false);
    Sound.coin();
  }
  coinEls.forEach(el => el && (el.textContent = coins.toLocaleString('en-US')));
  $('#sponsoredCount').textContent = sponsored.toLocaleString('en-US');

  /* ---------- soundtrack ---------- */
  const musicEl = new Audio('assets/audio/young-and-beautiful.mp3');
  musicEl.loop = true;
  musicEl.preload = 'auto';
  Sound.useMusic(musicEl);
  let musicAnnounced = false;
  document.addEventListener('visibilitychange', () => document.hidden ? Sound.pauseMusic() : Sound.resumeMusic());

  /* ---------- sound toggle ---------- */
  const soundBtn = $('#soundBtn');
  function setSound(onState) {
    onState ? Sound.enable() : Sound.disable();
    soundBtn.setAttribute('aria-pressed', String(onState));
    $('.hud__soundLabel').textContent = onState ? 'Sound on' : 'Sound off';
    if (onState && storyStarted && !musicAnnounced) announceMusic();
  }
  function announceMusic() {
    musicAnnounced = true;
    sysMsg('Now playing <b>Young and Beautiful</b>, Lana Del Rey', '', false);
  }
  soundBtn.addEventListener('click', () => setSound(!Sound.on));

  /* ---------- system window open animation ---------- */
  function sysOpen(el) {
    const rows = $$('.sys__head, .sys__lead, .sys__row, .sys__sub, .sys__actions, .quest__rank', el);
    const tl = gsap.timeline();
    if (reduce) {
      tl.set(el, { autoAlpha: 1 }).add(() => Sound.chime());
      return tl;
    }
    tl.set(el, { autoAlpha: 1, clipPath: 'inset(50% 50% 50% 50%)' })
      .add(() => Sound.chime())
      .to(el, { clipPath: 'inset(49.4% -4% 49.4% -4%)', duration: 0.3, ease: 'power3.out' })
      .to(el, { clipPath: 'inset(-6% -4% -6% -4%)', duration: 0.42, ease: 'power3.inOut' })
      .to(el, { opacity: 0.35, duration: 0.04, repeat: 3, yoyo: true, ease: 'none' })
      .set(el, { clearProps: 'clipPath', opacity: 1 })
      .from(rows, { autoAlpha: 0, x: -10, duration: 0.32, stagger: 0.045, ease: 'power2.out' }, '-=0.25');
    return tl;
  }

  /* ---------- starfield (global, fixed) ---------- */
  const Stars = (() => {
    const c = $('#stars');
    const ctx = c.getContext('2d');
    const N = innerWidth < 700 ? 240 : 560;
    let w, h, d, stars = [];
    const state = { warp: 0 };

    function star(z) {
      return { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: z ?? Math.random(), tw: Math.random() * 6.28, gold: Math.random() < 0.12 };
    }
    function resize() {
      d = Math.min(devicePixelRatio || 1, 1.5);
      w = c.width = Math.floor(innerWidth * d);
      h = c.height = Math.floor(innerHeight * d);
    }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, k = Math.max(w, h) * 0.42;
      const speed = reduce ? 0 : 0.00028 + state.warp * 0.022;
      for (const s of stars) {
        const pz = s.z;
        s.z -= speed;
        if (s.z <= 0.03) { Object.assign(s, star(1)); continue; }
        const sx = cx + (s.x / s.z) * k, sy = cy + (s.y / s.z) * k;
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) { Object.assign(s, star(1)); continue; }
        const near = 1 - s.z;
        const a = Math.min(1, near * 1.3) * (0.65 + 0.35 * Math.sin(t * 0.0016 + s.tw));
        const size = (near * 1.7 + 0.35) * d;
        ctx.strokeStyle = ctx.fillStyle = s.gold ? `rgba(240,215,154,${a})` : `rgba(236,230,218,${a})`;
        if (state.warp > 0.04) {
          const px = cx + (s.x / pz) * k, py = cy + (s.y / pz) * k;
          ctx.lineWidth = size;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
        } else {
          ctx.fillRect(sx, sy, size, size);
        }
      }
    }
    resize();
    stars = Array.from({ length: N }, () => star());
    addEventListener('resize', resize);
    if (reduce) { draw(0); addEventListener('resize', () => draw(0)); }
    else gsap.ticker.add(() => draw(performance.now()));
    return state;
  })();

  /* ---------- dust drifting through the carriage light ---------- */
  (function dust() {
    if (reduce) return;
    const c = $('.dust');
    const ctx = c.getContext('2d');
    let w, h, d, running = true;
    const motes = Array.from({ length: innerWidth < 700 ? 40 : 90 }, () => ({}));
    function reset(m, anywhere) {
      m.x = Math.random() * w;
      m.y = anywhere ? Math.random() * h : h + 10;
      m.r = (0.6 + Math.random() * 1.8) * d;
      m.vy = -(0.08 + Math.random() * 0.25) * d;
      m.ph = Math.random() * 6.28;
      m.a = 0.15 + Math.random() * 0.45;
    }
    function resize() {
      d = Math.min(devicePixelRatio || 1, 1.5);
      w = c.width = Math.floor(c.offsetWidth * d);
      h = c.height = Math.floor(c.offsetHeight * d);
      motes.forEach(m => reset(m, true));
    }
    resize();
    addEventListener('resize', resize);
    gsap.ticker.add(() => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.ph += 0.01;
        m.y += m.vy;
        m.x += Math.sin(m.ph) * 0.18 * d;
        if (m.y < -10) reset(m, false);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 3);
        g.addColorStop(0, `rgba(255,244,214,${m.a})`);
        g.addColorStop(1, 'rgba(255,244,214,0)');
        ctx.fillStyle = g;
        ctx.fillRect(m.x - m.r * 3, m.y - m.r * 3, m.r * 6, m.r * 6);
      }
    });
    ScrollTrigger.create({ trigger: '#hero', start: 'top bottom', end: 'bottom top', onToggle: s => { running = s.isActive; if (!running) ctx.clearRect(0, 0, w, h); } });
  })();

  /* ---------- live roman clock ---------- */
  (function buildClock() {
    const svg = $('#clock');
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent = svg) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      parent.append(n);
      return n;
    };
    const ring = el('g', { class: 'ck-outer' });
    el('circle', { r: 500, class: 'ck-ring', 'stroke-width': 2.5 }, ring);
    el('circle', { r: 486, class: 'ck-ring', 'stroke-width': 0.8 }, ring);
    el('circle', { r: 372, class: 'ck-ring', 'stroke-width': 0.8 }, ring);
    el('circle', { r: 318, class: 'ck-ring', 'stroke-width': 1.4 }, ring);
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      el('line', { x1: 0, y1: -486, x2: 0, y2: major ? -446 : -470, class: 'ck-ring', 'stroke-width': major ? 3.5 : 1.2, transform: `rotate(${i * 6})` }, ring);
    }
    ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((r, i) => {
      const t = el('text', { class: 'ck-num', transform: `rotate(${i * 30}) translate(0 -408)`, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, ring);
      t.textContent = r;
    });
    const script = el('g', { class: 'ck-script-ring' });
    el('path', { id: 'ckPath', d: 'M 0 -345 A 345 345 0 1 1 -0.1 -345', fill: 'none' }, script);
    const st = el('text', { class: 'ck-script' }, script);
    const tp = el('textPath', { href: '#ckPath' }, st);
    tp.textContent = 'The Oldest Dream  ✦  Demon King of Salvation  ✦  The One Reader  ✦  The Oldest Dream  ✦  Demon King of Salvation  ✦  The One Reader  ✦';

    const hh = el('path', { class: 'ck-hand', d: 'M -10 30 L -6 -150 L 0 -215 L 6 -150 L 10 30 Z' });
    const mh = el('path', { class: 'ck-hand', d: 'M -7 40 L -4 -250 L 0 -330 L 4 -250 L 7 40 Z' });
    const sh = el('g', {});
    el('line', { x1: 0, y1: 70, x2: 0, y2: -440, class: 'ck-sec' }, sh);
    el('circle', { cy: 50, r: 10, class: 'ck-hand' }, sh);
    el('circle', { r: 16, class: 'ck-hand' });
    el('circle', { r: 6, fill: '#040405' });

    function update(first) {
      const t = new Date();
      const s = t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds();
      const set = (node, rot, dur, ease) => first || reduce
        ? gsap.set(node, { rotation: rot, svgOrigin: '0 0' })
        : gsap.to(node, { rotation: rot, svgOrigin: '0 0', duration: dur, ease });
      set(sh, s * 6, 0.4, 'back.out(4)');
      set(mh, s * 0.1, 0.6, 'power2.out');
      set(hh, s / 120, 0.6, 'power2.out');
    }
    update(true);
    setInterval(() => update(false), 1000);
    if (!reduce) gsap.to(script, { rotation: -360, svgOrigin: '0 0', duration: 240, repeat: -1, ease: 'none' });
  })();

  /* ---------- gold paper confetti (chapter 1) ---------- */
  (function confetti() {
    if (reduce) return;
    const c = $('.confetti');
    const ctx = c.getContext('2d');
    const sec = $('#origin');
    let w, h, d, running = false;
    const pieces = Array.from({ length: innerWidth < 700 ? 28 : 56 }, () => ({}));
    function reset(p, top) {
      p.x = Math.random() * w;
      p.y = top ? -20 * d : Math.random() * h;
      p.vy = (0.35 + Math.random() * 0.9) * d;
      p.vx = (Math.random() - 0.5) * 0.4 * d;
      p.w = (5 + Math.random() * 9) * d;
      p.h = (2 + Math.random() * 3) * d;
      p.r = Math.random() * 6.28;
      p.vr = (Math.random() - 0.5) * 0.04;
      p.f = Math.random() * 6.28;
      p.vf = 0.02 + Math.random() * 0.05;
      p.c = ['#F0D79A', '#C9A35A', '#9C7A3C', '#FFF1C2'][Math.floor(Math.random() * 4)];
    }
    function resize() {
      d = Math.min(devicePixelRatio || 1, 1.5);
      w = c.width = Math.floor(sec.offsetWidth * d);
      h = c.height = Math.floor(sec.offsetHeight * d);
      pieces.forEach(p => reset(p, false));
    }
    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.y += p.vy; p.x += p.vx + Math.sin(p.f) * 0.3; p.r += p.vr; p.f += p.vf;
        if (p.y > h + 20) reset(p, true);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.scale(1, Math.cos(p.f));
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    resize();
    addEventListener('resize', resize);
    gsap.ticker.add(draw);
    ScrollTrigger.create({ trigger: sec, start: 'top bottom', end: 'bottom top', onToggle: self => { running = self.isActive; if (!running) ctx.clearRect(0, 0, w, h); } });
  })();

  /* ---------- custom cursor ---------- */
  if (finePointer && !reduce) {
    html.classList.add('has-cursor');
    const cur = $('.cursor');
    const ring = $('.cursor__ring'), dot = $('.cursor__dot');
    const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
    addEventListener('pointermove', e => {
      gsap.set(dot, { x: e.clientX, y: e.clientY });
      rx(e.clientX); ry(e.clientY);
    });
    document.addEventListener('pointerover', e => cur.classList.toggle('is-hover', !!e.target.closest('a, button, .watcher')));
  }

  /* ============================================================
     INTRO: prologue -> gate window -> title card -> hero
     ============================================================ */
  const prologue = $('#prologue');
  const gateWin = $('#gateWin');
  let skipped = false;
  let gateShown = false;

  const PROLOGUE = [
    'This is a story with only one reader.',
    'The writer never knew who would open it.',
    'But today, someone did.',
  ];

  async function typeLine(text) {
    const p = document.createElement('p');
    p.className = 'is-typing';
    prologue.append(p);
    for (const g of graphemes(text)) {
      if (skipped) break;
      p.textContent += g;
      if (g.trim()) Sound.tick();
      await wait(g === ',' || g === '.' ? 260 : g.trim() ? 48 : 90);
    }
    p.classList.remove('is-typing');
    return p;
  }

  async function runPrologue() {
    if (reduce) { showGate(); return; }
    bars(12, 2);
    await wait(900);
    for (const line of PROLOGUE) {
      if (skipped) return;
      const p = await typeLine(line);
      await wait(900);
      p.classList.add('is-past');
    }
    if (skipped) return;
    await wait(400);
    showGate();
  }

  function showGate() {
    if (gateShown) return;
    gateShown = true;
    bars(0, 0.8);
    gsap.to(prologue, { autoAlpha: 0, duration: 0.6 });
    gsap.to('#skipIntro', { autoAlpha: 0, duration: 0.4 });
    sysOpen(gateWin).add(() => $('#acceptSound').focus({ preventScroll: true }));
  }

  $('#skipIntro').addEventListener('click', () => { skipped = true; showGate(); });

  async function accept(withSound) {
    $$('#gateWin button').forEach(b => (b.disabled = true));
    // the song starts muffled under the title card and opens up when the story begins
    Sound.muffle(true, 0);
    if (withSound) setSound(true);
    await playTitle();
    startStory();
  }
  $('#acceptSound').addEventListener('click', () => accept(true));
  $('#acceptSilent').addEventListener('click', () => accept(false));

  function playTitle() {
    return new Promise(resolve => {
      const tc = $('#titlecard');
      if (reduce) {
        gsap.timeline({ onComplete: resolve })
          .to('#gate', { autoAlpha: 0, duration: 0.4 })
          .set('#gate', { display: 'none' });
        return;
      }
      const halos = $$('.halo', tc);
      halos.forEach(e => {
        const L = e.getTotalLength();
        gsap.set(e, { strokeDasharray: `${L * 0.42} ${L * 0.08} ${L * 0.06} ${L * 0.44}`, strokeDashoffset: L });
        gsap.to(e, { strokeDashoffset: 0, duration: e.classList.contains('halo--a') ? 7 : 5, repeat: -1, ease: 'none' });
      });
      const dot = $('.halo__dot', tc);
      const orbit = { a: 0 };
      gsap.to(orbit, {
        a: Math.PI * 2, duration: 4.5, repeat: -1, ease: 'none',
        onUpdate: () => { dot.setAttribute('cx', 200 + Math.cos(orbit.a) * 168); dot.setAttribute('cy', 200 + Math.sin(orbit.a) * 52); },
      });

      gsap.timeline({ onComplete: resolve })
        .add(() => Sound.close())
        .to(gateWin, { clipPath: 'inset(49.4% -4% 49.4% -4%)', duration: 0.32, ease: 'power3.in' })
        .to(gateWin, { clipPath: 'inset(49.4% 50% 49.4% 50%)', duration: 0.22, ease: 'power3.in' })
        .set(gateWin, { autoAlpha: 0 })
        .add(() => bars(13, 1.4))
        .set(tc, { autoAlpha: 1 })
        .fromTo('.tc__flash', { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.35, ease: 'expo.out' })
        .add(() => Sound.boom())
        .to('.tc__flash', { scaleY: 120, opacity: 0, duration: 0.9, ease: 'expo.out' })
        .fromTo('.tc__art', { autoAlpha: 0, scale: 1.3, filter: 'blur(16px) brightness(2.4)' },
          { autoAlpha: 1, scale: 1, filter: 'blur(0px) brightness(1)', duration: 2.4, ease: 'expo.out' }, '<')
        .fromTo('.tc__flare', { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.9, ease: 'expo.out' }, '<0.5')
        .to('.tc__flare', { scale: 0.75, duration: 1.4, yoyo: true, repeat: 1, ease: 'sine.inOut' })
        .from('.tc__kicker', { autoAlpha: 0, y: 12, duration: 0.9 }, '<-0.6')
        .from('.tc__name .ch', { autoAlpha: 0, y: 46, filter: 'blur(12px)', stagger: 0.09, duration: 1.1, ease: 'expo.out' }, '<0.2')
        .to({}, { duration: 1.1 })
        .add(() => Sound.whoosh())
        .to('.tc__art', { scale: 1.12, filter: 'blur(6px)', duration: 1.2, ease: 'power2.in' })
        .to(tc, { autoAlpha: 0, duration: 1.1, ease: 'power2.inOut' }, '<')
        .to('#gate', { autoAlpha: 0, duration: 1.2, ease: 'power2.inOut' }, '<0.3')
        .set('#gate', { display: 'none' })
        .add(() => gsap.killTweensOf([orbit, ...halos]));
    });
  }

  let storyStarted = false;
  function startStory() {
    storyStarted = true;
    unlockScroll();
    gsap.to(['#hud', '.progress'], { autoAlpha: 1, duration: 1, delay: 0.6 });

    const tl = gsap.timeline();
    if (!reduce) {
      tl.fromTo('.scene', { scale: 1.22 }, { scale: 1, duration: 3.6, ease: 'power3.out' })
        .fromTo('.scene__dim', { opacity: 1 }, { opacity: 0, duration: 2.6, ease: 'power2.out' }, 0)
        .add(() => bars(7, 2.2), 0.4)
        .from('.hero__name .ch', { yPercent: 115, stagger: 0.08, duration: 1.3, ease: 'expo.out' }, 0.7)
        .fromTo('.sweep', { xPercent: -120, autoAlpha: 1 }, { xPercent: 360, duration: 1.6, ease: 'power2.inOut' }, 1.6)
        .set('.sweep', { autoAlpha: 0 })
        .from(['.hero__kicker', '.hero__line'], { autoAlpha: 0, y: 14, stagger: 0.18, duration: 0.9 }, 1.3)
        .from('.led', { yPercent: 100, duration: 0.8, ease: 'power3.out' }, 1.5)
        .from('.hero__scroll', { autoAlpha: 0, duration: 0.8 }, 2.1);
    }
    tl.add(() => Sound.muffle(false, 3), 0.3);
    tl.add(() => addCoins(100, 'The reader received starting coins'), reduce ? 0 : 1.9);
    if (Sound.on) tl.add(announceMusic, reduce ? 0.5 : 3.2);
    if (new Date().getHours() === 3) {
      html.classList.add('oldest-dream');
      tl.add(() => sysMsg('The Oldest Dream is watching you'), '+=1.5');
    }
    startIdleWatch();
  }

  /* ============================================================
     SCROLL STORY
     ============================================================ */

  gsap.to('.progress i', { scaleY: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

  const rewarded = new Set();
  // the label follows chapter starts only: a pinned section's own trigger can't see its pin length
  const chapters = $$('[data-chapter]');
  const setLabel = i => ($('#hudChapter').textContent = chapters[Math.max(0, i)].dataset.chapter);
  chapters.forEach((sec, i) => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 55%',
      onLeaveBack: () => setLabel(i - 1),
      onEnter: () => {
        setLabel(i);
        const r = sec.dataset.reward;
        if (!storyStarted || !r || rewarded.has(r) || r === '6') return;
        rewarded.add(r);
        addCoins(150, `Reading reward, ${sec.dataset.chapter.split(' ').slice(0, 2).join(' ')}`);
      },
    });
  });

  // a slow weightless float, camera drift and a flickering light
  if (!reduce) {
    gsap.to('.scene img', { y: 10, rotation: 0.35, duration: 4.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.fromTo('.scene img', { scale: 1 }, { scale: 1.05, duration: 22, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    (function flicker() {
      gsap.delayedCall(4 + Math.random() * 7, () => {
        gsap.timeline({ onComplete: flicker })
          .to('.scene__dim', { opacity: 0.55, duration: 0.05 })
          .to('.scene__dim', { opacity: 0.1, duration: 0.07 })
          .to('.scene__dim', { opacity: 0.4, duration: 0.05 })
          .to('.scene__dim', { opacity: 0, duration: 0.3 });
      });
    })();
  }

  const mm = gsap.matchMedia();
  let originWords = null;

  // Pins add scroll space, so every trigger has to be measured in page order.
  // The triggers are created per feature rather than top to bottom, so rank them here.
  function orderTriggers() {
    const all = ScrollTrigger.getAll();
    const els = [...new Set(all.map(s => s.trigger).filter(Boolean))];
    els.sort((a, b) => a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    // on the same element, the pin goes first so the other triggers include its scroll space
    all.forEach(s => { s.refreshPriority = s.trigger ? -els.indexOf(s.trigger) * 2 + (s.pin ? 1 : 0) : 1; });
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
  }

  mm.add({ desktop: '(min-width: 900px)', mobile: '(max-width: 899px)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
    const { desktop, motion } = ctx.conditions;
    if (!motion) {
      $$('[data-sys]').forEach(w => gsap.set(w, { autoAlpha: 1 }));
      $$('.stat').forEach(s => s.style.setProperty('--fill', s.querySelector('b').dataset.count));
      $$('.stat b').forEach(b => (b.textContent = b.dataset.count));
      gsap.set('.book__cover', { autoAlpha: 1 });
      orderTriggers();
      return;
    }

    /* hero: push through the carriage window into the stars */
    gsap.timeline({
      scrollTrigger: { trigger: '#hero', start: 'top top', end: '+=130%', pin: true, scrub: 0.6 },
    })
      .to('.hero__copy', { autoAlpha: 0, y: -50, duration: 0.3 }, 0)
      .to(['.led', '.hero__scroll'], { autoAlpha: 0, duration: 0.2 }, 0)
      .to(html, { '--bar': () => barH(14), duration: 0.5, ease: 'power2.in' }, 0)
      .to('.scene', { scale: 3.6, duration: 1, ease: 'power2.in' }, 0)
      .to(Stars, { warp: 1, duration: 0.7, ease: 'power2.in' }, 0.25)
      .to('.scene', { autoAlpha: 0, duration: 0.3 }, 0.7)
      .to(html, { '--bar': '0px', duration: 0.3, ease: 'power2.out' }, 0.7)
      .to(Stars, { warp: 0, duration: 0.3, ease: 'power2.out' }, 0.95);

    /* chapter title cards, scrubbed like an opening credit */
    $$('.card').forEach(card => {
      const chars = $$('.card__title .ch', card);
      gsap.timeline({
        scrollTrigger: { trigger: card, start: 'top top', end: '+=90%', pin: true, scrub: 0.6 },
      })
        .fromTo($('.card__num', card), { autoAlpha: 0, letterSpacing: '0.9em' }, { autoAlpha: 1, letterSpacing: '0.3em', duration: 0.5 }, 0)
        .fromTo($('.card__rule', card), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, 0.1)
        .fromTo(chars, { autoAlpha: 0, y: 30, filter: 'blur(14px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', stagger: { each: 0.04, from: 'center' }, duration: 0.45 }, 0.2)
        .fromTo($('.card__line', card), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.55)
        .to({}, { duration: 0.35 })
        .to($('.card__inner', card), { autoAlpha: 0, scale: 1.08, filter: 'blur(10px)', duration: 0.4, ease: 'power2.in' });
      if (card.classList.contains('card--glitch')) {
        ScrollTrigger.create({ trigger: card, start: 'top 40%', onEnter: () => Sound.glitch() });
      }
    });

    /* chapter 1: words light up as you read */
    originWords ||= $$('#origin .reveal').flatMap(splitWords);
    gsap.set(originWords, { opacity: 0.12 });
    gsap.to(originWords, {
      opacity: 1, stagger: 0.06, ease: 'none',
      scrollTrigger: { trigger: '.novel', start: 'top 75%', end: 'bottom 50%', scrub: 0.4 },
    });
    gsap.fromTo('.ck-outer', { rotation: 20 }, { rotation: -25, svgOrigin: '0 0', ease: 'none', scrollTrigger: { trigger: '#origin', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from('.clock', { scale: 0.7, autoAlpha: 0, rotation: -20, duration: 2.4, ease: 'expo.out', scrollTrigger: { trigger: '#origin', start: 'top 80%' } });

    /* chapter 2: status window */
    ScrollTrigger.create({
      trigger: '.sys--status', start: 'top 75%', once: true,
      onEnter: () => {
        sysOpen($('.sys--status')).add(() => {
          $$('.stat').forEach((s, i) => {
            const v = +s.querySelector('b').dataset.count;
            const o = { v: 0 };
            gsap.to(o, {
              v, duration: 1.6, delay: i * 0.12, ease: 'power3.out',
              onUpdate: () => { s.style.setProperty('--fill', o.v); s.querySelector('b').textContent = Math.round(o.v); },
            });
          });
        }, '-=0.3').add(() => sysMsg('Skill <b>Teller of Horror</b> has been hidden by the system'), '+=1.2');
      },
    });

    /* chapter 3: scenarios, horizontal on desktop */
    const quests = $$('.quest');
    if (desktop) {
      const track = $('.sc__track');
      const dist = () => track.scrollWidth - innerWidth;
      const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: '#scenarios', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true },
      });
      quests.forEach(q => ScrollTrigger.create({
        trigger: q, containerAnimation: tween, start: 'left 88%', once: true,
        onEnter: () => questOpen(q),
      }));
    } else {
      quests.forEach(q => ScrollTrigger.create({ trigger: q, start: 'top 80%', once: true, onEnter: () => questOpen(q) }));
    }

    /* chapter 4: library drift */
    gsap.fromTo('.stars-sec__bg img', { yPercent: -10 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '#constellations', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from('.watcher', {
      autoAlpha: 0, y: 40, scale: 0.94, stagger: { each: 0.08, from: 'center' }, duration: 1, ease: 'expo.out',
      scrollTrigger: { trigger: '.watchers', start: 'top 78%' },
    });

    /* chapter 5: the fourth wall */
    const cracks = $$('.crack path');
    cracks.forEach(p => { const L = p.getTotalLength(); gsap.set(p, { strokeDasharray: L, strokeDashoffset: L }); });
    const lines = $$('.wl');
    gsap.set(lines, { autoAlpha: 0 });
    let glitched = false;
    const wtl = gsap.timeline({
      scrollTrigger: {
        trigger: '#wall', start: 'top top', end: '+=320%', pin: '.wall__pin', scrub: 0.5,
        onEnter: () => { bars(11); Sound.muffle(true); }, onEnterBack: () => { bars(11); Sound.muffle(true); },
        onLeave: () => { bars(0); Sound.muffle(false); }, onLeaveBack: () => { bars(0); Sound.muffle(false); },
        onUpdate: self => {
          if (self.progress > 0.6 && !glitched) {
            glitched = true;
            Sound.glitch();
            Sound.dropout();
            const pin = $('.wall__pin');
            pin.classList.add('is-glitch');
            setTimeout(() => pin.classList.remove('is-glitch'), 600);
          } else if (self.progress < 0.5) glitched = false;
        },
      },
    });
    lines.slice(0, 4).forEach((l, i) => {
      wtl.fromTo(l, { autoAlpha: 0, y: 20, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5 }, i * 1.1)
        .to(l, { autoAlpha: 0, y: -20, filter: 'blur(10px)', duration: 0.4 }, i * 1.1 + 0.8);
    });
    wtl.fromTo('.wall__bg img', { scale: 1.15 }, { scale: 1, duration: 4.5, ease: 'none' }, 0)
      .to(cracks, { strokeDashoffset: 0, duration: 0.5, stagger: 0.04, ease: 'power3.out' }, 3.3)
      .to('.wall__bg img', { scaleX: -1, opacity: 0.6, duration: 0.6, ease: 'power3.inOut' }, 3.7)
      .to(cracks, { opacity: 0, duration: 0.6 }, 4.4)
      .fromTo(lines[4], { autoAlpha: 0, scale: 1.1, filter: 'blur(14px)' }, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.7 }, 4.4)
      .to({}, { duration: 0.6 });

    /* epilogue: contact window + closing book */
    ScrollTrigger.create({ trigger: '.sys--contact', start: 'top 78%', once: true, onEnter: () => sysOpen($('.sys--contact')) });
    gsap.set('.book__cover', { autoAlpha: 0 });
    let cleared = false;
    gsap.timeline({
      scrollTrigger: {
        trigger: '.ending', start: 'top 85%', end: 'center 55%', scrub: 0.6,
        onLeave: () => {
          if (cleared) return;
          cleared = true;
          Sound.thud();
          addCoins(300, 'Main Scenario #1 Reading <b>cleared</b>');
          gsap.delayedCall(1.4, () => sysMsg('You obtained <b>one memory</b>'));
        },
      },
    })
      .fromTo('.book__page--l', { rotationY: -118 }, { rotationY: 0, ease: 'power2.in' }, 0)
      .fromTo('.book__page--r', { rotationY: 118 }, { rotationY: 0, ease: 'power2.in' }, 0)
      .to('.book__cover', { autoAlpha: 1, duration: 0.3 }, 0.75);

    orderTriggers();
  });

  function questOpen(q) {
    sysOpen(q).from($('.quest__rank', q), { scale: 2.4, autoAlpha: 0, rotation: -12, duration: 0.6, ease: 'back.out(2.5)' }, '-=0.2');
    if ($('.quest__rank', q).dataset.rank === 'S') gsap.delayedCall(0.9, () => sysMsg('Several constellations are watching this <b>S-rank</b> scenario'));
  }

  /* ---------- constellations ---------- */
  const lastMsg = new WeakMap();
  $$('.watcher').forEach(btn => {
    const speak = () => {
      const now = Date.now();
      if (now - (lastMsg.get(btn) || 0) < 3500) return;
      lastMsg.set(btn, now);
      sysMsg(`The constellation <b>'${btn.dataset.name}'</b> ${btn.dataset.msg}`);
    };
    btn.addEventListener('mouseenter', speak);
    btn.addEventListener('focus', speak);
    btn.addEventListener('click', () => {
      $$('.watcher.is-on').forEach(o => o !== btn && o.classList.remove('is-on'));
      btn.classList.toggle('is-on');
      speak();
    });
  });

  $('#sponsorBtn').addEventListener('click', (e) => {
    if (coins < 100) {
      sysMsg('Not enough coins. Read another chapter, then come back to sponsor.', 'danger');
      gsap.fromTo(e.currentTarget, { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, .3)' });
      return;
    }
    coins -= 100; sponsored += 100;
    store.set('orv.coins', coins); store.set('orv.sponsored', sponsored);
    renderCoins();
    Sound.coin();
    coinBurst(e.currentTarget);
    sysMsg('You sponsored the writer <b>100 coins</b>', 'gold', false);
    const ws = $$('.watcher');
    const pick = ws[Math.floor(Math.random() * ws.length)];
    gsap.delayedCall(1.3, () => sysMsg(`The constellation <b>'${pick.dataset.name}'</b> is pleased with your sponsorship`));
  });

  function coinBurst(from) {
    const r = from.getBoundingClientRect();
    const target = $('#sponsoredCount').getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
      const c = document.createElement('i');
      c.className = 'coin coin-fx';
      document.body.append(c);
      const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
      gsap.set(c, { x: sx, y: sy });
      gsap.timeline({ onComplete: () => c.remove() })
        .to(c, { x: sx + (Math.random() - 0.5) * 160, y: sy - 40 - Math.random() * 90, duration: 0.45, ease: 'power2.out' })
        .to(c, { x: target.left + target.width / 2, y: target.top + target.height / 2, scale: 0.4, duration: 0.55, ease: 'power3.in', delay: i * 0.03 });
    }
  }

  /* ---------- contact copy buttons ---------- */
  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      sysMsg(`Copied <b>${b.dataset.label}</b>: ${b.dataset.copy}`);
      const go = $('.channel__go', b);
      go.textContent = 'Copied';
      setTimeout(() => (go.textContent = 'Copy'), 1800);
    } catch {
      sysMsg(`Could not copy. The ${b.dataset.label} is <b>${b.dataset.copy}</b>`, 'danger');
    }
  }));

  $('#rereadBtn').addEventListener('click', () => scrollToY(0));

  /* ---------- easter eggs ---------- */
  let idleTimer, idleSaid = false;
  function startIdleWatch() {
    const reset = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (idleSaid) return;
        idleSaid = true;
        sysMsg('Some constellations are <b>getting bored</b> of waiting');
      }, 45000);
    };
    ['pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, () => { idleSaid = false; reset(); }, { passive: true }));
    reset();
  }

  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let kpos = 0;
  addEventListener('keydown', e => {
    kpos = e.key.toLowerCase() === KONAMI[kpos].toLowerCase() ? kpos + 1 : (e.key === 'ArrowUp' ? 1 : 0);
    if (kpos === KONAMI.length) {
      kpos = 0;
      html.classList.add('shatter');
      Sound.glitch();
      sysMsg('Warning: <b>the fourth wall</b> has been damaged', 'danger', false);
      setTimeout(() => html.classList.remove('shatter'), 1100);
    }
  });

  console.log('%c[ System ]%c You opened a window ordinary readers cannot see.\nThe constellation \'The One Who Laughs in the Last Chapter\' likes your curiosity.\nTry ↑ ↑ ↓ ↓ ← → ← → B A',
    'color:#7CC4FF;font-weight:bold;font-size:13px', 'color:#F0D79A;font-size:13px');

  /* ---------- go ---------- */
  lockScroll();
  scrollTo(0, 0);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  runPrologue();
})();
