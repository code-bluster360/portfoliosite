// Classic (non-module) script so the site also works when index.html is opened straight from disk.
(() => {
'use strict';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)').matches;
const motionOK = !reduced.matches;
let paused = reduced.matches;
const loops = []; // infinite GSAP tweens/timelines that obey the motion toggle

gsap.registerPlugin(ScrollTrigger);
gsap.defaults({ ease: 'power3.out' });
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------------- motion toggle ---------------- */
const motionBtn = $('#motion');
function updateMotion() {
  motionBtn.textContent = paused ? 'Enable motion' : 'Pause motion';
  motionBtn.setAttribute('aria-pressed', String(paused));
  root.classList.toggle('motion-paused', paused);
  loops.forEach(t => t.paused(paused));
}
motionBtn.addEventListener('click', () => { paused = !paused; updateMotion(); });
reduced.addEventListener('change', () => { paused = reduced.matches; updateMotion(); });

/* ---------------- clock ---------------- */
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false });
const updateTime = () => { $('#time').textContent = fmt.format(new Date()) + ' BST'; };
updateTime(); setInterval(updateTime, 30000);

/* ---------------- text splitting ---------------- */
function splitInto(rootEl, mode) {
  const out = [];
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const s = document.createElement('span');
          s.className = 'word';
          s.setAttribute('aria-hidden', 'true');
          if (mode === 'chars') {
            // letters stay inside their word box, so lines can only break between words
            [...part].forEach(ch => {
              const c = document.createElement('span');
              c.className = 'char'; c.textContent = ch;
              s.append(c); out.push(c);
            });
          } else { s.textContent = part; out.push(s); }
          frag.append(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.matches('[aria-hidden="true"]')) walk(n);
    });
  };
  walk(rootEl);
  return out;
}
function labelFrom(el, text) { el.setAttribute('aria-label', text ?? el.textContent.replace(/\s+/g, ' ').trim()); }

/* ---------------- word rotator (starts once the hero intro has landed) ---------------- */
let rotator;
function startRotator() {
  if (rotator) return;
  const words = $$('.rotator span');
  rotator = gsap.timeline({ repeat: -1, paused });
  words.forEach((w, i) => {
    const next = words[(i + 1) % words.length];
    rotator.to(w, { yPercent: -110, opacity: 0, duration: .7, ease: 'expo.in' }, '+=2.2')
      .fromTo(next, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .9, ease: 'expo.out', immediateRender: false }, '-=.15');
  });
  loops.push(rotator);
}

/* ---------------- loader + hero intro ---------------- */
const loader = $('.loader');
const heroChars = [];
if (motionOK) {
  labelFrom($('.hero-title'), 'Engineering what’s next.');
  $$('.hero-title .split').forEach(el => heroChars.push(...splitInto(el, 'chars')));
}

let introPlayed = false;
function heroIntro() {
  if (introPlayed) return;
  introPlayed = true;
  if (!motionOK) { startRotator(); return; }
  const tl = gsap.timeline({ onComplete: startRotator });
  tl.from(heroChars, { yPercent: 115, rotate: 6, duration: 1.1, stagger: .028, ease: 'expo.out' })
    .from('.rotator span:first-child', { yPercent: 115, duration: 1, ease: 'expo.out' }, '-=.8')
    .from('.eyebrow, .hero-sub p, .hero-actions > *', { y: 24, opacity: 0, duration: .9, stagger: .08 }, '-=.8')
    .from('.hero-top > *, .hero-bottom', { opacity: 0, duration: 1 }, '<')
    .from('.site-header', { opacity: 0, duration: 1 }, '<');
  // Same safety net as the loader: never leave the hero hidden if frames stall.
  setTimeout(() => tl.progress(1), 4000);
}

function runLoader() {
  if (!loader) { heroIntro(); return; }
  let seen = false;
  try { seen = sessionStorage.getItem('fr-loaded') === '1'; sessionStorage.setItem('fr-loaded', '1'); } catch (e) {}
  if (!motionOK || seen) { loader.remove(); heroIntro(); return; }
  // The intro must never hold the page hostage: if frames stall (background tab,
  // slow device, an error mid-timeline) the timer finishes it anyway.
  let tl;
  const finish = () => { clearTimeout(failsafe); tl?.kill(); loader.remove(); heroIntro(); };
  const failsafe = setTimeout(finish, 4500);
  const count = { v: 0 };
  const num = $('.loader-count');
  tl = gsap.timeline({ onComplete: finish })
    .from('.loader-name span', { yPercent: 110, duration: 1, stagger: .1, ease: 'expo.out' })
    .to(count, { v: 100, duration: 1.4, ease: 'power2.inOut', onUpdate: () => { num.textContent = String(Math.round(count.v)).padStart(3, '0'); } }, 0)
    .to('.loader-bar i', { scaleX: 1, duration: 1.4, ease: 'power2.inOut' }, 0)
    .to('.loader-name span', { yPercent: -110, duration: .7, stagger: .06, ease: 'power3.in' }, '+=.1')
    .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: .9, ease: 'expo.inOut' }, '-=.3')
    .add(heroIntro, '-=.5');
}
runLoader();

/* ---------------- WebGL particle field (plain WebGL, no module imports) ---------------- */
const canvas = $('.hero-canvas');
const heroState = { morph: 0 };
const VERT = `
  attribute vec3 aPos; attribute vec3 aTarget; attribute float aRnd;
  uniform float uTime, uMorph, uSize, uPR, uAspect, uF, uScale, uTilt;
  uniform vec2 uOffset, uMouse;
  varying float vAlpha; varying float vHeat;
  void main(){
    vec3 a = aPos;
    float n = sin(a.x*2.2+uTime*.9)*sin(a.y*2.4+uTime*.7)*sin(a.z*2.0+uTime*.8);
    a += normalize(a) * n * .22;
    float ang = uTime*.12;
    a.xz = mat2(cos(ang),-sin(ang),sin(ang),cos(ang)) * a.xz;
    vec3 b = aTarget;
    b.y += sin(b.x*.8+uTime*.8)*.45 + cos(b.z*1.1+uTime*.6)*.35;
    float m = smoothstep(0., 1., clamp(uMorph*1.6 - aRnd*.6, 0., 1.));
    vec3 p = mix(a, b, m);
    p.yz = mat2(cos(uTilt),-sin(uTilt),sin(uTilt),cos(uTilt)) * p.yz;
    vec3 w = p * uScale + vec3(uOffset, 0.);
    vec2 d = w.xy - uMouse;
    float f = 1. - smoothstep(0., 1.3, length(d));
    w.xy += normalize(d + 1e-4) * f * .55;
    w.z += f * .6;
    vec3 v = w - vec3(0., 0., 7.);                 // camera at z = 7, looking down -z
    gl_Position = vec4(v.x * uF / uAspect, v.y * uF, (v.z * 100.1 + 20.) / -99.9, -v.z);
    gl_PointSize = uSize * (.35 + aRnd*.9) * uPR / -v.z;
    vAlpha = smoothstep(-11., -4.5, v.z) * (.35 + aRnd*.65);
    vHeat = clamp(f*1.4 + n*.8 + (aRnd > .93 ? 1. : 0.), 0., 1.);
  }`;
const FRAG = `
  precision mediump float;
  uniform vec3 uA, uB; varying float vAlpha; varying float vHeat;
  void main(){
    float d = length(gl_PointCoord - .5);
    if (d > .5) discard;
    gl_FragColor = vec4(mix(uA*.75, uB, vHeat), (1. - smoothstep(.1, .5, d)) * vAlpha);
  }`;

// Swap the canvas for the lightweight CSS globe (no WebGL, software GL, or too slow).
function fallbackToCSS(gl) {
  gl?.getExtension('WEBGL_lose_context')?.loseContext(); // free the GPU context straight away
  canvas.remove();
  $('.hero').classList.add('no-webgl');
}

function startParticles() {
  // Refuse software renderers (SwiftShader, llvmpipe, WARP): they would drag every
  // animation on the page down to a few frames per second.
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
  try { initParticles(gl); } catch (e) { fallbackToCSS(gl); }
}

function initParticles(gl) {
  if (!gl) throw new Error('No hardware-accelerated WebGL');
  let renderer = String(gl.getParameter(gl.RENDERER));
  if (/^webkit webgl$/i.test(renderer)) { // Chrome/Safari mask RENDERER; ask the debug extension instead
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  }
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) throw new Error('Software WebGL: ' + renderer);
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  let pr = Math.min(devicePixelRatio, 1.75);
  const small = innerWidth < 700;
  const COUNT = small ? 4500 : 11000;
  let drawCount = COUNT;
  const pos = new Float32Array(COUNT * 3), target = new Float32Array(COUNT * 3), rnd = new Float32Array(COUNT);
  // Store particles in shuffled order so any prefix is an even sample (used when thinning out).
  const slot = Array.from({ length: COUNT }, (_, i) => i);
  for (let i = COUNT - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slot[i], slot[j]] = [slot[j], slot[i]]; }
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const k = slot[i];
    // Fibonacci sphere with a thin shell
    const y = 1 - (i / (COUNT - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const R = 2.1 + (Math.random() - .5) * .12;
    pos.set([Math.cos(th) * r * R, y * R, Math.sin(th) * r * R], k * 3);
    // flowing terrain grid
    const gx = (i % 150) / 149, gz = Math.floor(i / 150) / Math.ceil(COUNT / 150);
    target.set([(gx - .5) * 14, -1.4, (gz - .5) * 9], k * 3);
    rnd[k] = Math.random();
  }
  [['aPos', pos, 3], ['aTarget', target, 3], ['aRnd', rnd, 1]].forEach(([name, data, size]) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  });

  const u = {};
  ['uTime', 'uMorph', 'uSize', 'uPR', 'uAspect', 'uF', 'uScale', 'uTilt', 'uOffset', 'uMouse', 'uA', 'uB']
    .forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
  const F = 1 / Math.tan(20 * Math.PI / 180); // 40° vertical field of view
  gl.uniform1f(u.uSize, small ? 26 : 30);
  gl.uniform1f(u.uPR, pr);
  gl.uniform1f(u.uF, F);
  gl.uniform3f(u.uA, .863, .807, .716); // #efe8dc, linear
  gl.uniform3f(u.uB, 1, .147, .036);    // #ff6b35, linear
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow
  gl.clearColor(0, 0, 0, 0);

  let aspect = 1;
  const layout = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * pr); canvas.height = Math.round(h * pr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    aspect = w / h;
    const narrow = w < 900;
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform2f(u.uOffset, narrow ? 0 : 2.7, narrow ? .9 : .2);
    gl.uniform1f(u.uScale, narrow ? .78 : .86);
  };
  const ro = new ResizeObserver(layout);
  ro.observe(canvas); layout();

  const mouse = { x: 99, y: 99, tx: 99, ty: 99 };
  addEventListener('pointermove', e => {
    const hh = 7 / F, hw = hh * aspect; // half-extent of the z = 0 plane in view
    const r = canvas.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width * 2 - 1) * hw;
    mouse.ty = -((e.clientY - r.top) / r.height * 2 - 1) * hh;
    if (mouse.x === 99) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
  }, { passive: true });

  let visible = true, stopped = false, raf = 0, t = 0, last = performance.now();
  const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); ro.disconnect(); fallbackToCSS(gl); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  canvas.addEventListener('webglcontextlost', stop);

  // Frame-time watchdog (after a short warm-up):
  //  - 4 frames in a row slower than 120 ms: hopeless, switch to the CSS globe;
  //  - median of 20 frames slower than ~24 fps: halve the particles at 1x, then give up if still slow.
  let warm = 0, slowRun = 0, samples = [], degraded = false;
  const watch = gap => {
    if (++warm <= 5) return;
    if (gap > 2000) { slowRun = 0; return; } // tab switch or debugger pause, not a real frame
    slowRun = gap > 120 ? slowRun + 1 : 0;
    if (slowRun >= 4) { stop(); return; }
    samples.push(gap);
    if (samples.length < 20) return;
    const median = samples.sort((a, b) => a - b)[10];
    samples = [];
    if (median <= 42) return;
    if (degraded) { stop(); return; }
    degraded = true; warm = 0;
    pr = 1; drawCount = Math.round(COUNT * .45);
    gl.uniform1f(u.uPR, pr); layout();
  };

  const tick = now => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    const gap = now - last; last = now;
    if (!visible || document.hidden) return;
    watch(gap);
    if (stopped) return;
    if (!paused) t += Math.min(gap / 1000, .05);
    mouse.x += (mouse.tx - mouse.x) * .08; mouse.y += (mouse.ty - mouse.y) * .08;
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uMorph, heroState.morph);
    gl.uniform2f(u.uMouse, mouse.x, mouse.y);
    gl.uniform1f(u.uTilt, mouse.y === 99 ? 0 : mouse.y * .04);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, drawCount);
  };
  raf = requestAnimationFrame(tick);
  gsap.from(canvas, { opacity: 0, duration: 2.5, delay: .3, ease: 'power2.out' });
}
// Start after the loader has painted, so creating the context never delays first paint.
requestAnimationFrame(() => setTimeout(startParticles, 0));

/* ---------------- marquee (scroll-velocity reactive) ---------------- */
{
  const track = $('.marquee-track');
  track.append(...[...track.children].map(n => n.cloneNode(true)));
  const tl = gsap.to(track, { xPercent: -50, duration: 38, ease: 'none', repeat: -1, paused });
  loops.push(tl);
  let dir = 1;
  ScrollTrigger.create({
    onUpdate(self) {
      if (paused) return;
      dir = self.direction;
      const boost = gsap.utils.clamp(1, 7, 1 + Math.abs(self.getVelocity()) / 250);
      gsap.to(tl, { timeScale: boost * dir, duration: .2, overwrite: true, onComplete: () => gsap.to(tl, { timeScale: dir, duration: 1.2, ease: 'power2.out' }) });
    }
  });
}

/* ---------------- header, progress, nav ---------------- */
{
  const header = $('.site-header');
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate(self) {
      gsap.set('.progress', { scaleX: self.progress });
      header.classList.toggle('is-scrolled', self.scroll() > 40);
      header.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 400 && !header.matches(':focus-within'));
    }
  });
  $$('nav a').forEach(a => {
    const sec = $(a.getAttribute('href'));
    ScrollTrigger.create({ trigger: sec, start: 'top 50%', end: 'bottom 50%', onToggle: s => a.classList.toggle('is-active', s.isActive) });
  });
}

/* ---------------- scroll choreography ---------------- */
if (motionOK) {
  // hero: particles flow into a terrain, copy drifts away
  gsap.to(heroState, { morph: 1, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero-copy', { yPercent: -18, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: '20% top', end: 'bottom top', scrub: true } });

  // generic reveals
  $$('.section-head, .split-head, .about-copy > p, .human-copy > *, .contact .label, .contact-row').forEach(el => {
    gsap.from(el, { y: 50, opacity: 0, duration: 1.1, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  // statement: word-by-word ink-in
  const words = splitInto($('.statement'), 'words');
  labelFrom($('.statement'), $('.statement').textContent);
  gsap.to(words, { opacity: 1, stagger: .5, ease: 'none', scrollTrigger: { trigger: '.statement', start: 'top 80%', end: 'bottom 40%', scrub: true } });

  // portrait: curtain reveal + settle
  gsap.fromTo('.portrait-frame', { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: '.portrait', start: 'top 80%', once: true } });
  gsap.to('.portrait-frame img', { scale: 1, ease: 'none', scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'bottom top', scrub: true } });

  // stats: roll numbers
  $$('[data-count]').forEach(el => {
    const end = +el.dataset.count, pad = +(el.dataset.pad || 0), o = { v: 0 };
    el.textContent = String(0).padStart(pad, '0');
    gsap.to(o, { v: end, duration: 2, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true }, onUpdate: () => { el.textContent = String(Math.round(o.v)).padStart(pad, '0'); } });
  });

  // work: horizontal scroll on large screens, stacked reveals elsewhere
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1001px)', () => {
    const track = $('.work-track');
    const dist = () => track.scrollWidth - innerWidth;
    const h = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.work', pin: true, start: 'top top', end: () => '+=' + dist(), scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 } });
    $$('.project').forEach(p => {
      gsap.from(p.querySelector('.project-art'), { scale: .86, rotate: 2, ease: 'none', scrollTrigger: { trigger: p, containerAnimation: h, start: 'left right', end: 'center center', scrub: true } });
      gsap.from(p.querySelector('.project-info'), { y: 40, opacity: 0, ease: 'none', scrollTrigger: { trigger: p, containerAnimation: h, start: 'left 85%', end: 'left 45%', scrub: true } });
    });
    gsap.from('.work-intro > *', { y: 50, opacity: 0, duration: 1, stagger: .1, scrollTrigger: { trigger: '.work', start: 'top 70%', once: true } });
  });
  mm.add('(max-width: 1000px)', () => {
    $$('.work-intro, .project').forEach(el => gsap.from(el, { y: 70, opacity: 0, duration: 1.1, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));
  });

  // toolkit cards
  gsap.from('.card', { y: 80, opacity: 0, duration: 1.1, stagger: .12, scrollTrigger: { trigger: '.cards', start: 'top 85%', once: true } });

  // journey: rail draws, nodes light up
  gsap.to('.timeline-rail i', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.timeline-wrap', start: 'top 65%', end: 'bottom 65%', scrub: true } });
  $$('.role').forEach(r => {
    ScrollTrigger.create({ trigger: r, start: 'top 65%', toggleClass: 'is-on' });
    gsap.from(r.children, { y: 30, opacity: 0, duration: .9, stagger: .08, scrollTrigger: { trigger: r, start: 'top 88%', once: true } });
  });

  // human: parallax photo with wipe-in
  gsap.fromTo('.human-media', { clipPath: 'inset(12% 12% 12% 12% round 6px)' }, { clipPath: 'inset(0% 0% 0% 0% round 6px)', ease: 'none', scrollTrigger: { trigger: '.human', start: 'top bottom', end: 'center center', scrub: true } });
  gsap.fromTo('.human-media img', { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.human', start: 'top bottom', end: 'bottom top', scrub: true } });

  // contact: letter cascade + spinning asterisk
  const contactTitle = $('.contact-title');
  labelFrom(contactTitle);
  const cChars = $$('.split', contactTitle).flatMap(el => splitInto(el, 'chars'));
  gsap.from(cChars, { yPercent: 115, duration: 1, stagger: .018, ease: 'expo.out', scrollTrigger: { trigger: contactTitle, start: 'top 80%', once: true } });
  gsap.to('.asterisk', { rotate: 360, ease: 'none', scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'bottom top', scrub: 1 } });

  // footer wordmark
  const fChars = splitInto($('.footer-big'), 'chars');
  gsap.from(fChars, { yPercent: 100, opacity: 0, duration: 1.2, stagger: .04, ease: 'expo.out', scrollTrigger: { trigger: '.site-footer', start: 'top 95%', once: true } });
}
loops.push(gsap.to('.asterisk', { rotation: '+=360', duration: 30, repeat: -1, ease: 'none', paused }));

/* ---------------- cursor + magnetic ---------------- */
if (finePointer && motionOK) {
  root.classList.add('has-cursor');
  const cursor = $('.cursor'), dot = $('.cursor-dot'), ring = $('.cursor-ring'), label = $('.cursor-ring b');
  gsap.set([dot, ring], { x: innerWidth / 2, y: innerHeight / 2 });
  const dx = gsap.quickTo(dot, 'x', { duration: .1 }), dy = gsap.quickTo(dot, 'y', { duration: .1 });
  const rx = gsap.quickTo(ring, 'x', { duration: .45 }), ry = gsap.quickTo(ring, 'y', { duration: .45 });
  addEventListener('pointermove', e => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); }, { passive: true });
  document.addEventListener('pointerover', e => {
    const lab = e.target.closest('[data-cursor]');
    const link = e.target.closest('a, button, summary');
    cursor.classList.toggle('is-label', !!lab);
    cursor.classList.toggle('is-link', !lab && !!link);
    if (lab) label.textContent = lab.dataset.cursor;
  });
  document.addEventListener('pointerleave', () => gsap.to(cursor, { opacity: 0, duration: .3 }));
  document.addEventListener('pointerenter', () => gsap.to(cursor, { opacity: 1, duration: .3 }));

  $$('.magnetic').forEach(el => {
    const xTo = gsap.quickTo(el, 'x', { duration: .6, ease: 'elastic.out(1,.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: .6, ease: 'elastic.out(1,.4)' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * .35); yTo((e.clientY - r.top - r.height / 2) * .45);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });

  // project cards tilt toward pointer
  $$('.project').forEach(p => {
    const art = p.querySelector('.project-art');
    p.addEventListener('pointermove', e => {
      const r = art.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      gsap.to(art, { rotateY: px * 8, rotateX: -py * 8, transformPerspective: 900, duration: .6, overwrite: 'auto' });
    });
    p.addEventListener('pointerleave', () => gsap.to(art, { rotateY: 0, rotateX: 0, duration: .9, ease: 'elastic.out(1,.5)' }));
  });
}

/* ---------------- portrait colour spotlight ---------------- */
{
  const frame = $('.portrait-frame');
  const setXY = e => {
    const r = frame.getBoundingClientRect();
    frame.style.setProperty('--x', (e.clientX - r.left) + 'px');
    frame.style.setProperty('--y', (e.clientY - r.top) + 'px');
  };
  if (finePointer) {
    frame.addEventListener('pointerenter', e => { setXY(e); gsap.to(frame, { '--r': '170px', duration: .6 }); });
    frame.addEventListener('pointermove', setXY);
    frame.addEventListener('pointerleave', () => gsap.to(frame, { '--r': '0px', duration: .6 }));
  } else {
    // touch: tap to flip between duotone and full colour
    let on = false;
    frame.addEventListener('click', () => { on = !on; frame.style.setProperty('--x', '50%'); frame.style.setProperty('--y', '40%'); gsap.to(frame, { '--r': on ? '900px' : '0px', duration: .9, ease: 'power2.inOut' }); });
  }
}

/* ---------------- card glow follows pointer ---------------- */
$$('.card').forEach(c => c.addEventListener('pointermove', e => {
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  c.style.setProperty('--my', (e.clientY - r.top) + 'px');
}));

/* ---------------- live telemetry readout ---------------- */
{
  const temp = $('.iot-temp');
  setInterval(() => { if (!paused && !document.hidden) temp.textContent = (3.9 + Math.random() * .7).toFixed(1); }, 1400);
}

/* ---------------- copy email ---------------- */
{
  const toast = $('.toast');
  let timer;
  const show = msg => { toast.textContent = msg; toast.classList.add('is-on'); clearTimeout(timer); timer = setTimeout(() => toast.classList.remove('is-on'), 2200); };
  $('.copy').addEventListener('click', async e => {
    try { await navigator.clipboard.writeText(e.currentTarget.dataset.copy); show('Email copied ✳'); }
    catch { show('Copy failed — select the address instead'); }
  });
}

/* ---------------- project dialog ---------------- */
const projects = [
  { tag: 'Fahad’s Tutorial / Education', title: 'One connected learning ecosystem.', description: 'Four integrated products—an LMS, doubt-solving platform, e-commerce platform, and exam portal—built around a shared user and data model. Together, they serve 25,000 active students, connecting course delivery, mentor-led support, book sales, and online assessment.', role: 'Led product and engineering across architecture, team recruitment and mentorship, full-stack development, deployment, scaling, and security. Built Power BI dashboards for revenue, engagement, and business reporting.', stack: ['Laravel', 'Node.js', 'Flutter', 'Power BI', 'Product leadership'] },
  { tag: 'Trip Sync / Mobile', title: 'Keep the whole group in sync.', description: 'An open-source group travel app designed for real-time trip management. Trip Sync combines battery-optimised live convoy tracking, instant group alerts, and shared-expense management.', role: 'Developed a mobile experience with one-tap group alerts, lock-screen emergency bypass, and an expense-splitting engine with database-enforced settlement verification.', stack: ['Flutter', 'Firebase', 'Real-time location', 'Mobile engineering'] },
  { tag: 'Planet X Inc / Connected hardware', title: 'Visibility where temperature matters.', description: 'A sensor-based monitoring device designed to help prevent vaccine spoilage in vaccination facilities and cold-storage units through real-time temperature tracking and automated alerts.', role: 'Led end-to-end product development spanning hardware, firmware, backend telemetry, and a monitoring dashboard.', stack: ['IoT', 'Embedded systems', 'Telemetry', 'Backend engineering'] }
];
{
  const dialog = $('#project-dialog');
  let opener;
  $$('[data-project]').forEach(btn => btn.addEventListener('click', () => {
    opener = btn;
    const p = projects[+btn.dataset.project];
    $('#modal-tag').textContent = p.tag;
    $('#modal-title').textContent = p.title;
    $('#modal-description').textContent = p.description;
    $('#modal-role').textContent = p.role;
    $('#modal-chips').replaceChildren(...p.stack.map(t => Object.assign(document.createElement('span'), { textContent: t })));
    dialog.setAttribute('aria-labelledby', 'modal-title');
    dialog.showModal();
    document.body.classList.add('modal-open');
    if (motionOK) {
      gsap.fromTo(dialog, { y: 60, opacity: 0, scale: .96 }, { y: 0, opacity: 1, scale: 1, duration: .7, ease: 'expo.out' });
      gsap.from(dialog.querySelectorAll(':scope > *:not(.close), #modal-chips span'), { y: 20, opacity: 0, duration: .6, stagger: .04, delay: .1 });
    }
  }));
  $('.close', dialog).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { document.body.classList.remove('modal-open'); opener?.focus(); });
}

updateMotion();
addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
})();
