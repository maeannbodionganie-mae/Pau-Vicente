/* Minimal 3D motion. Everything here is an enhancement: without JavaScript, or with reduced motion,
   the page is complete and static.
   - Stage: Pau steps out of her frame; the panel, outline and portrait sit at different depths and
     shift with the pointer and with scroll.
   - Storybook: chapter pages stack; each page settles back in 3D as the next one arrives.
   - Photographs open like a curtain.
   - Moments: on desktop each photograph rises as a tilted print and opens to fill the screen. */
(() => {
  'use strict';
  const root = document.documentElement;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const desktop = window.matchMedia('(min-width: 901px) and (min-height: 620px)');
  if (still || !('IntersectionObserver' in window)) return;
  root.classList.add('motion');

  /* Reveal on entry: photographs and stages */
  const revealTargets = document.querySelectorAll('.chapter-media .media-stack > .photo, [data-stage]');
  revealTargets.forEach((el) => el.setAttribute('data-curtain', ''));
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); reveal.unobserve(entry.target); }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  revealTargets.forEach((el) => reveal.observe(el));
  // Never leave anything covered.
  setTimeout(() => revealTargets.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-revealed'); }), 2200);

  /* Scroll-linked work, done once per frame for visible elements only */
  const stages = [...document.querySelectorAll('[data-stage]')];
  const book = document.querySelector('[data-storybook]');
  const pages = book ? [...book.querySelectorAll('.page')] : [];
  const active = new Set();
  const watch = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.isIntersecting ? active.add(entry.target) : active.delete(entry.target);
    schedule();
  }, { rootMargin: '15% 0px' });
  stages.forEach((el) => watch.observe(el));
  pages.forEach((el) => watch.observe(el));

  const pointer = { x: 0, y: 0 };
  let ticking = false;
  function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }

  let apply = function () {
    ticking = false;
    const vh = innerHeight;
    for (const el of active) {
      if (el.hasAttribute('data-stage')) {
        const box = el.getBoundingClientRect();
        const progress = Math.max(-1, Math.min(1, (box.top + box.height / 2 - vh / 2) / vh));
        el.querySelectorAll('[data-layer]').forEach((layer) => {
          const depth = Number(layer.dataset.layer) || 0;
          const x = pointer.x * depth * 18;
          const y = pointer.y * depth * 12 + progress * depth * -60;
          layer.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        });
      } else if (el.classList.contains('page')) {
        const inner = el.querySelector('.page-inner');
        const next = el.nextElementSibling;
        if (!desktop.matches || !next || !inner) { if (inner) { inner.style.transform = ''; inner.style.filter = ''; } continue; }
        const covered = Math.max(0, Math.min(1, 1 - next.getBoundingClientRect().top / vh));
        inner.style.transform = covered ? `perspective(1600px) rotateX(${(covered * 9).toFixed(2)}deg) scale(${(1 - covered * 0.08).toFixed(3)}) translateY(${(-covered * 5).toFixed(2)}%)` : '';
        inner.style.filter = covered ? `brightness(${(1 - covered * 0.45).toFixed(3)})` : '';
      }
    }
  }
  /* Moments: pinned cinematic reveal. Each photograph rises as a tilted print, then opens to fill the screen;
     the one before it recedes and dims. */
  const cinema = document.querySelector('[data-cinema]');
  const shots = cinema ? [...cinema.querySelectorAll('.moment')] : [];
  const cineHead = cinema && cinema.querySelector('.moments-head');
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function cineSetup() {
    const on = Boolean(cinema) && desktop.matches;
    root.classList.toggle('cine', on);
    if (!on) shots.forEach((el) => { el.style.transform = ''; el.style.clipPath = ''; el.style.filter = ''; const c = el.querySelector('figcaption'); if (c) c.style.opacity = ''; const i = el.querySelector('img'); if (i) i.style.transform = ''; });
    if (!on && cineHead) cineHead.style.opacity = '';
  }
  function cineApply() {
    if (!cinema || !root.classList.contains('cine')) return;
    const box = cinema.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) return;
    const total = clamp01(-box.top / (box.height - innerHeight));
    const n = shots.length;
    const states = shots.map((_, i) => {
      const start = i / n + (i === 0 ? 0.02 : -0.04), end = (i + 1) / n - 0.06;
      const local = clamp01((total - start) / (end - start));
      const rise = i === 0 ? 1 : ease(clamp01(local / 0.45));
      const open = ease(clamp01((local - (i === 0 ? 0 : 0.3)) / (i === 0 ? 1 : 0.7)));
      return { rise, open };
    });
    shots.forEach((el, i) => {
      const { rise, open } = states[i];
      const next = states[i + 1];
      const recede = next ? next.open : 0;
      const y = (1 - rise) * 105 + (1 - open) * (i === 0 ? 16 : 10);
      const scale = (0.46 + 0.54 * open) * (1 - recede * 0.08);
      const tilt = (1 - open) * 22;
      el.style.transform = `translate3d(0, ${y.toFixed(2)}vh, 0) rotateX(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      const inset = (1 - open) * 4;
      el.style.clipPath = `inset(${inset.toFixed(2)}% round ${((1 - open) * 18).toFixed(1)}px)`;
      el.style.filter = recede ? `brightness(${(1 - recede * 0.55).toFixed(3)})` : '';
      const img = el.querySelector('img');
      if (img) img.style.transform = `scale(${(1.18 - 0.18 * open).toFixed(4)})`;
      const cap = el.querySelector('figcaption');
      if (cap) cap.style.opacity = clamp01((open - 0.7) / 0.3 - recede * 2).toFixed(3);
    });
    if (cineHead) cineHead.style.opacity = (1 - clamp01(states[0].open * 1.6)).toFixed(3);
  }
  cineSetup();
  desktop.addEventListener('change', () => { cineSetup(); schedule(); });
  const baseApply = apply;
  apply = function () { baseApply(); cineApply(); };

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  desktop.addEventListener('change', schedule);

  if (finePointer) {
    addEventListener('pointermove', (event) => {
      pointer.x = event.clientX / innerWidth * 2 - 1;
      pointer.y = event.clientY / innerHeight * 2 - 1;
      schedule();
    }, { passive: true });
  }
  schedule();
})();
