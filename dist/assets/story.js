/* Header state and "story time" progress. Pure enhancement: the page reads fully without it. */
(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  if (header && !document.body.classList.contains('subpage')) {
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  const story = document.querySelector('.story');
  const chapters = story ? [...story.querySelectorAll('.chapter')] : [];
  if (!chapters.length || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('story-enhanced');
  const count = story.querySelector('.story-count b');
  const bar = story.querySelector('.story-bar i');
  const links = [...story.querySelectorAll('.chapter-index a')];
  const total = chapters.length;

  function activate(index) {
    if (count) count.textContent = String(index + 1).padStart(2, '0');
    if (bar) bar.style.width = `${((index + 1) / total) * 100}%`;
    links.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) activate(Number(entry.target.dataset.chapter) || 0);
    }
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  chapters.forEach((chapter) => observer.observe(chapter));
  activate(0);
})();
