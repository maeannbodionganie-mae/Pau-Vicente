(() => {
  'use strict';
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    const closeMenu = (restoreFocus = false) => {
      toggle.setAttribute('aria-expanded', 'false');
      links.classList.remove('is-open');
      if (restoreFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      links.classList.toggle('is-open', open);
    });
    links.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.site-nav')) closeMenu();
    });
    const nav = document.querySelector('.site-nav');
    nav.addEventListener('focusout', (event) => {
      if (event.relatedTarget && !nav.contains(event.relatedTarget)) closeMenu();
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
      if (event.matches) closeMenu();
    });
    document.documentElement.classList.add('js');
  }
  const year = document.getElementById('copyright-year');
  if (year) year.textContent = String(new Date().getFullYear());
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window) {
    const targets = [...document.querySelectorAll('[data-reveal]')];
    const revealed = new WeakSet();
    let observer = null;
    function syncReveals(reduce) {
      if (observer) observer.disconnect();
      targets.forEach((element) => element.classList.remove('is-inview'));
      if (reduce) return;
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            revealed.add(entry.target);
            entry.target.classList.add('is-inview');
            observer.unobserve(entry.target);
          }
        }
      }, { rootMargin: '0px 0px -4% 0px', threshold: 0.04 });
      targets.forEach((element) => { if (!revealed.has(element)) observer.observe(element); });
    }
    syncReveals(motionPreference.matches);
    motionPreference.addEventListener('change', (event) => syncReveals(event.matches));
  }
  if ('IntersectionObserver' in window) {
    const navigation = [...document.querySelectorAll('.nav-links > a:not(.button)')];
    const activeSection = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (!visible.length) return;
      const id = visible[visible.length - 1].target.id;
      navigation.forEach((link) => {
        if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-15% 0px -55% 0px', threshold: 0 });
    navigation.forEach((link) => {
      const section = document.querySelector(link.getAttribute('href'));
      if (section) activeSection.observe(section);
    });
  }
})();
