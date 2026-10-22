/* Minimal 3D motion: curtain reveals, scroll depth, gentle tilt, and the Moments ring.
   Everything is an enhancement. Without JavaScript, or with reduced motion, the content is static and complete. */
(() => {
  'use strict';
  const root = document.documentElement;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasIO = 'IntersectionObserver' in window;

  /* 1. Curtain reveal for photographs */
  if (!still && hasIO) {
    root.classList.add('motion');
    const targets = document.querySelectorAll('.chapter-media .media-stack > .photo, .chapter-media > .photo, .about-portrait, .event-image, .contact-photo');
    targets.forEach((el) => el.setAttribute('data-curtain', ''));
    const reveal = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); reveal.unobserve(entry.target); }
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    targets.forEach((el) => reveal.observe(el));
    // Never leave a photograph covered: reveal anything still hidden after a while.
    setTimeout(() => targets.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-revealed'); }), 2500);
  }

  /* 2. Scroll depth: chapter photographs turn gently toward the reader; layered images drift apart */
  const depth = [...document.querySelectorAll('[data-depth]')];
  const parallax = [...document.querySelectorAll('[data-parallax]')];
  if (!still && hasIO && (depth.length || parallax.length)) {
    const active = new Set();
    const watch = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.isIntersecting ? active.add(entry.target) : active.delete(entry.target);
      schedule();
    }, { rootMargin: '10% 0px' });
    [...depth, ...parallax].forEach((el) => watch.observe(el));
    let ticking = false;
    function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }
    function apply() {
      ticking = false;
      const vh = innerHeight;
      for (const el of active) {
        const box = el.getBoundingClientRect();
        const progress = Math.max(-1, Math.min(1, (box.top + box.height / 2 - vh / 2) / vh));
        if (el.hasAttribute('data-depth')) {
          if (innerWidth <= 900) { el.style.transform = ''; continue; }
          const side = el.closest('li') && [...el.closest('ol').children].indexOf(el.closest('li')) % 2 ? -1 : 1;
          el.style.transform = `perspective(1400px) rotateY(${(side * progress * 7).toFixed(2)}deg) rotateX(${(progress * 3).toFixed(2)}deg) translateZ(${(-Math.abs(progress) * 40).toFixed(1)}px)`;
        } else {
          const factor = Number(el.dataset.parallax) || 0;
          el.style.transform = `translate3d(0, ${(progress * factor * vh).toFixed(1)}px, 0)`;
        }
      }
    }
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
  }

  /* 3. Gentle tilt on framed portraits (mouse and trackpad only) */
  if (!still && finePointer) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (event) => {
        const box = el.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        el.style.setProperty('--tilt-x', `${(-y * 6).toFixed(2)}deg`);
        el.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--tilt-x', '0deg'); el.style.setProperty('--tilt-y', '0deg'); });
    });
  }

  /* 4. Moments ring: a slow 3D carousel of the supporting photographs */
  const stage = document.querySelector('[data-ring]');
  if (stage) {
    const ring = stage.querySelector('.ring');
    const items = [...ring.children];
    const caption = document.querySelector('.ring-caption');
    const count = items.length;
    const step = 360 / count;
    let rotation = 0, target = null, dragging = null, hovering = false, inView = false, raf = 0, radius = 0;
    root.classList.add('ring-ready');

    function layout() {
      const width = items[0].offsetWidth || 300;
      radius = Math.round(width / 2 / Math.tan(Math.PI / count) + width * 0.18);
      items.forEach((item, i) => { item.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`; });
      stage.style.setProperty('--ring-depth', `${radius}px`);
      render();
    }
    function front() { return ((Math.round(-rotation / step) % count) + count) % count; }
    function render() {
      ring.style.transform = `translateZ(${-radius}px) rotateY(${rotation}deg)`;
      items.forEach((item, i) => {
        const angle = ((i * step + rotation) % 360 + 360) % 360;
        const facing = Math.cos(angle * Math.PI / 180);
        item.style.opacity = (0.28 + 0.72 * Math.max(0, facing)).toFixed(3);
        item.classList.toggle('is-front', i === front());
        item.setAttribute('aria-hidden', String(i !== front()));
      });
      const figure = items[front()].querySelector('figcaption');
      if (caption && figure && caption.textContent !== figure.textContent) caption.textContent = figure.textContent;
    }
    function loop() {
      raf = 0;
      if (target !== null) {
        const diff = target - rotation;
        rotation += diff * (still ? 1 : 0.12);
        if (Math.abs(diff) < 0.05) { rotation = target; target = null; }
      } else if (!still && !hovering && !dragging && inView && !document.hidden) {
        rotation -= 0.06;
      }
      render();
      if (target !== null || (!still && inView && !hovering && !dragging && !document.hidden)) raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }
    function go(direction) { const base = target ?? rotation; target = Math.round(base / step) * step - direction * step; kick(); }

    document.querySelector('[data-ring-next]')?.addEventListener('click', () => go(1));
    document.querySelector('[data-ring-prev]')?.addEventListener('click', () => go(-1));
    stage.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    });
    stage.addEventListener('pointerenter', () => { hovering = true; });
    stage.addEventListener('pointerleave', () => { hovering = false; kick(); });
    stage.addEventListener('pointerdown', (event) => {
      dragging = { x: event.clientX, start: rotation, moved: false };
      target = null;
      stage.setPointerCapture(event.pointerId);
    });
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const dx = event.clientX - dragging.x;
      if (Math.abs(dx) > 4) dragging.moved = true;
      rotation = dragging.start + dx * 0.25;
      render();
    });
    const release = () => {
      if (!dragging) return;
      dragging = null;
      target = Math.round(rotation / step) * step;
      kick();
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    if (hasIO) new IntersectionObserver((entries) => { inView = entries.some((e) => e.isIntersecting); if (inView) kick(); }).observe(stage);
    else inView = true;
    document.addEventListener('visibilitychange', kick);
    addEventListener('resize', layout);
    layout();
    kick();
  }
})();
