/* Progressive 3D motion: native scrolling, layered portraits, and readable storybook pages.
   The document stays complete without JavaScript or when reduced motion is requested. */
(() => {
  'use strict';
  const root = document.documentElement;
  if (!('IntersectionObserver' in window)) return;

  // Share the actual CSS viewport between sticky offsets and animation progress.
  const viewportProbe = document.createElement('div');
  viewportProbe.setAttribute('aria-hidden', 'true');
  viewportProbe.setAttribute('data-motion-viewport', '');
  viewportProbe.inert = true;
  viewportProbe.style.cssText = 'position:fixed;inset:0 auto auto 0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none;contain:strict;';
  document.body.appendChild(viewportProbe);
  let viewportHeight = 0;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 901px) and (min-height: 620px)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const ease = (value) => 1 - Math.pow(1 - value, 3);
  const settle = (current, target, amount) =>
    Math.abs(target - current) < 0.001 ? target : current + (target - current) * amount;

  const stages = [...document.querySelectorAll('[data-stage]')].map((el) => ({
    el, layers: [...el.querySelectorAll('[data-layer]')].map((layer) => ({
      el: layer, depth: Number(layer.dataset.layer) || 0, x: 0, y: 0
    }))
  }));
  const book = document.querySelector('[data-storybook]');
  const pages = book ? [...book.querySelectorAll('.page')].map((el) => ({
    el, inner: el.querySelector('.page-inner'), next: el.nextElementSibling, covered: 0
  })) : [];
  const cinema = document.querySelector('[data-cinema]');
  const shots = cinema ? [...cinema.querySelectorAll('.moment')].map((el) => ({
    el, image: el.querySelector('img'), caption: el.querySelector('figcaption')
  })) : [];
  const cinemaHeading = cinema && cinema.querySelector('.moments-head');
  const curtains = [...document.querySelectorAll('.chapter-media .media-stack > .photo, [data-stage]')];
  const active = new Set();
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let enabled = false;
  let frame = 0;
  let lastTime = 0;
  let cinemaProgress = 0;
  let cinemaEntered = false;
  let fallbackTimer = 0;

  const reveal = new IntersectionObserver((entries) => {
    if (!enabled) return;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        reveal.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });

  const watch = new IntersectionObserver((entries) => {
    if (!enabled) return;
    for (const entry of entries) {
      if (entry.isIntersecting) active.add(entry.target);
      else active.delete(entry.target);
    }
    schedule();
  }, { rootMargin: '15% 0px' });

  function write(el, property, value) {
    if (el && el.style[property] !== value) el.style[property] = value;
  }

  function schedule() {
    if (enabled && !document.hidden && !frame) frame = requestAnimationFrame(apply);
  }

  function resetStage(stage) {
    stage.el.classList.remove('is-motion-active');
    for (const layer of stage.layers) {
      layer.x = layer.y = 0;
      write(layer.el, 'transform', '');
    }
  }

  function resetPage(page) {
    page.covered = 0;
    write(page.inner, 'transform', '');
    write(page.inner, 'filter', '');
    write(page.inner, 'opacity', '');
  }

  function resetCinema() {
    cinemaProgress = 0;
    cinemaEntered = false;
    for (const shot of shots) {
      for (const property of ['transform', 'clipPath', 'filter']) write(shot.el, property, '');
      shot.el.style.removeProperty('--moment-dim');
      write(shot.image, 'transform', '');
      write(shot.caption, 'opacity', '');
    }
    write(cinemaHeading, 'opacity', '');
  }

  function apply(time) {
    frame = 0;
    if (!enabled || document.hidden) return;
    const elapsed = lastTime ? clamp(time - lastTime, 1, 50) : 16;
    lastTime = time;
    const amount = 1 - Math.exp(-elapsed / 70);
    const height = viewportProbe.getBoundingClientRect().height || document.documentElement.clientHeight || window.innerHeight;
    viewportHeight = height;
    const isDesktop = desktop.matches;
    const usePointer = isDesktop && finePointer.matches;

    // Measure all geometry before applying classes or writing transforms.
    const canStack = pages.length > 0 && pages.every((page) => page.inner);
    const useCinema = isDesktop && shots.length > 0;
    const stageMeasurements = stages.map((stage) => ({
      stage, box: active.has(stage.el) ? stage.el.getBoundingClientRect() : null
    }));
    const pageMeasurements = pages.map((page) => ({
      page, stickyTop: Math.min(0, height - page.el.offsetHeight), box: canStack && active.has(page.el) && page.next ?
        page.next.getBoundingClientRect() : null
    }));
    const cinemaBox = cinema && active.has(cinema) ? cinema.getBoundingClientRect() : null;

    const layoutChanged = root.classList.contains('story-stacked') !== Boolean(canStack) ||
      root.classList.contains('cine') !== useCinema;
    if (layoutChanged) {
      root.classList.toggle('story-stacked', Boolean(canStack));
      root.classList.toggle('cine', useCinema);
      pages.forEach(resetPage);
      resetCinema();
      schedule();
      return; // Re-measure after layout changes; do not animate stale coordinates.
    }

    pointer.x = settle(pointer.x, usePointer ? pointer.targetX : 0, amount);
    pointer.y = settle(pointer.y, usePointer ? pointer.targetY : 0, amount);
    let moving = Math.abs(pointer.x - (usePointer ? pointer.targetX : 0)) > 0.001 ||
      Math.abs(pointer.y - (usePointer ? pointer.targetY : 0)) > 0.001;

    for (const { stage, box } of stageMeasurements) {
      if (!box) { resetStage(stage); continue; }
      stage.el.classList.add('is-motion-active');
      const progress = clamp((box.top + box.height / 2 - height / 2) / height, -1, 1);
      for (const layer of stage.layers) {
        const x = pointer.x * layer.depth * 18;
        const y = pointer.y * layer.depth * 12 - progress * layer.depth * (isDesktop ? 60 : 22);
        layer.x = settle(layer.x, x, amount);
        layer.y = settle(layer.y, y, amount);
        moving = moving || Math.abs(layer.x - x) > 0.001 || Math.abs(layer.y - y) > 0.001;
        write(layer.el, 'transform',
          'translate3d(' + layer.x.toFixed(2) + 'px,' + layer.y.toFixed(2) + 'px,0)');
      }
    }

    for (const { page, box, stickyTop } of pageMeasurements) {
      // A tall chapter scrolls normally until its bottom reaches the viewport,
      // then recedes behind the next chapter. No content is forced into one screen.
      const top = stickyTop.toFixed(2) + 'px';
      if (page.el.style.getPropertyValue('--page-stick-top') !== top) page.el.style.setProperty('--page-stick-top', top);
      if (!box || !page.inner) { resetPage(page); continue; }
      const target = clamp(1 - box.top / height);
      page.covered = settle(page.covered, target, amount);
      moving = moving || Math.abs(page.covered - target) > 0.001;
      const covered = page.covered;
      write(page.inner, 'transform', covered > 0.001 ?
        'perspective(1600px) rotateX(' + (covered * (isDesktop ? 9 : 5)).toFixed(2) + 'deg) scale(' +
        (1 - covered * (isDesktop ? 0.08 : 0.04)).toFixed(4) + ') translateY(' + (-covered * (isDesktop ? 5 : 2)).toFixed(2) + '%)' : '');
      write(page.inner, 'opacity', covered > 0.001 ? (1 - covered * 0.32).toFixed(3) : '');
      write(page.inner, 'filter', '');
    }

    if (useCinema && cinemaBox && cinemaBox.bottom >= 0 && cinemaBox.top <= height) {
      const target = clamp(-cinemaBox.top / Math.max(1, cinemaBox.height - height));
      // Arrive at the correct state immediately after an anchor jump or restored scroll position.
      if (!cinemaEntered) { cinemaProgress = target; cinemaEntered = true; }
      cinemaProgress = settle(cinemaProgress, target, amount);
      moving = moving || Math.abs(cinemaProgress - target) > 0.001;
      const states = shots.map((_, index) => {
        const start = index / shots.length + (index === 0 ? 0.02 : -0.04);
        const end = (index + 1) / shots.length - 0.06;
        const local = clamp((cinemaProgress - start) / Math.max(0.01, end - start));
        return {
          rise: index === 0 ? 1 : ease(clamp(local / 0.45)),
          open: ease(clamp((local - (index === 0 ? 0 : 0.3)) / (index === 0 ? 1 : 0.7)))
        };
      });
      shots.forEach((shot, index) => {
        const { rise, open } = states[index];
        const recede = states[index + 1] ? states[index + 1].open : 0;
        const y = (1 - rise) * 105 + (1 - open) * (index === 0 ? 16 : 10);
        const scale = (0.46 + 0.54 * open) * (1 - recede * 0.08);
        // Use pixels from the same viewport measurement as progress, avoiding vh/svh drift.
        write(shot.el, 'transform', 'translate3d(0,' + (y * height / 100).toFixed(2) +
          'px,0) rotateX(' + ((1 - open) * 22).toFixed(2) + 'deg) scale(' + scale.toFixed(4) + ')');
        shot.el.style.setProperty('--moment-dim', (recede * 0.55).toFixed(3));
        write(shot.image, 'transform', 'scale(' + (1.18 - 0.18 * open).toFixed(4) + ')');
        write(shot.caption, 'opacity', clamp((open - 0.7) / 0.3 - recede * 2).toFixed(3));
      });
      write(cinemaHeading, 'opacity', (1 - clamp(states[0].open * 1.6)).toFixed(3));
    } else {
      cinemaEntered = false;
      // Touch layouts keep their swipeable prints, with visible scroll-linked depth.
      if (!useCinema && cinemaBox) {
        const entry = clamp((height - cinemaBox.top) / Math.max(1, height * 0.8));
        shots.forEach((shot) => write(shot.el, 'transform',
          'perspective(1200px) rotateX(' + ((1 - entry) * 14).toFixed(2) +
          'deg) scale(' + (0.92 + entry * 0.08).toFixed(4) + ')'));
      }
    }

    if (moving) schedule();
  }

  function syncMotion() {
    enabled = !preference.matches;
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    clearTimeout(fallbackTimer);
    watch.disconnect();
    reveal.disconnect();
    active.clear();
    pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0;
    root.classList.toggle('motion', enabled);
    root.classList.remove('cine', 'story-stacked');
    stages.forEach(resetStage);
    pages.forEach(resetPage);
    resetCinema();

    if (!enabled) {
      curtains.forEach((el) => {
        el.classList.add('is-revealed');
        el.removeAttribute('data-curtain');
      });
      return;
    }

    for (const el of curtains) {
      el.setAttribute('data-curtain', '');
      if (!el.classList.contains('is-revealed')) reveal.observe(el);
    }
    stages.forEach((stage) => watch.observe(stage.el));
    pages.forEach((page) => watch.observe(page.el));
    if (cinema && shots.length) watch.observe(cinema);

    fallbackTimer = setTimeout(() => {
      const visible = curtains.filter((el) => {
        const box = el.getBoundingClientRect();
        return box.top < window.innerHeight && box.bottom > 0;
      });
      visible.forEach((el) => { el.classList.add('is-revealed'); reveal.unobserve(el); });
    }, 1800);
    schedule();
  }

  function resetPointer() {
    pointer.targetX = pointer.targetY = 0;
    schedule();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pointermove', (event) => {
    if (!enabled || !desktop.matches || !finePointer.matches || event.pointerType === 'touch') return;
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = viewportHeight || document.documentElement.clientHeight || window.innerHeight;
    pointer.targetX = clamp(event.clientX / Math.max(1, width) * 2 - 1, -1, 1);
    pointer.targetY = clamp(event.clientY / Math.max(1, height) * 2 - 1, -1, 1);
    schedule();
  }, { passive: true });
  window.addEventListener('pointerout', (event) => { if (!event.relatedTarget) resetPointer(); }, { passive: true });
  window.addEventListener('blur', resetPointer);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (!document.hidden) schedule();
  });
  preference.addEventListener('change', syncMotion);
  desktop.addEventListener('change', () => { resetPointer(); schedule(); });
  finePointer.addEventListener('change', resetPointer);
  document.querySelectorAll('img').forEach((image) => image.addEventListener('load', schedule, { once: true }));
  if ('ResizeObserver' in window) {
    const contentSize = new window.ResizeObserver(schedule);
    pages.forEach((page) => { if (page.inner) contentSize.observe(page.inner); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  syncMotion();
})();
