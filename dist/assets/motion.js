/* Minimal 3D motion. Everything here is an enhancement: without JavaScript, or with reduced motion,
   the page is complete and static.
   - Stage: Pau steps out of her frame; the panel, outline and portrait sit at different depths and
     shift with the pointer and with scroll.
   - Storybook: chapter pages stack; each page settles back in 3D as the next one arrives.
   - Photographs open like a curtain; the Moments prints fan out when they come into view. */
(() => {
  'use strict';
  const root = document.documentElement;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const desktop = window.matchMedia('(min-width: 901px) and (min-height: 620px)');
  if (still || !('IntersectionObserver' in window)) return;
  root.classList.add('motion');

  /* Reveal on entry: photographs, stages and the Moments deck */
  const revealTargets = document.querySelectorAll('.chapter-media .media-stack > .photo, .deck-card .photo, [data-stage], [data-deck]');
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

  function apply() {
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
