// Exercise actual navigation JS with a minimal DOM harness, without claiming browser QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../dist/assets/main.js'), 'utf8');
function node(attributes = {}) {
  const classes = new Set();
  return {
    attributes, listeners: {}, textContent: '', focused: false,
    classList: { add: x => classes.add(x), remove: x => classes.delete(x),
      toggle: (x, value) => value ? classes.add(x) : classes.delete(x), contains: x => classes.has(x) },
    getAttribute(name) { return this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    fire(type, event) { (this.listeners[type] || []).forEach(fn => fn(event)); },
    focus() { this.focused = true; }, contains(target) { return target?.insideNav === true; }
  };
}
function setup(reducedMotion) {
  const toggle = node({ 'aria-expanded': 'false' });
  const links = node(), nav = node(), year = node(), html = node();
  const reveal = node();
  const sections = ['about','my-story','speaking-topics','why-pau','contact'].map(id => Object.assign(node(), { id }));
  const navigation = sections.map(x => node({href: '#' + x.id}));
  const observers = [], media = {};
  const document = Object.assign(node(), {
    documentElement: html,
    querySelector(selector) { return ({'.nav-toggle':toggle,'.nav-links':links,'.site-nav':nav})[selector] || sections.find(x => '#' + x.id === selector); },
    querySelectorAll(selector) { return selector === '[data-reveal]' || selector === '.is-inview' ? [reveal] : navigation; },
    getElementById() { return year; }
  });
  class Observer {
    constructor(callback) { this.callback = callback; this.observed = []; observers.push(this); }
    observe(element) { this.observed.push(element); }
    unobserve(element) { this.observed = this.observed.filter(x => x !== element); }
    disconnect() { this.disconnected = true; }
  }
  const window = { IntersectionObserver: Observer, matchMedia(query) {
    if (!media[query]) media[query] = Object.assign(node(), { matches: query.includes('reduced-motion') && reducedMotion });
    return media[query];
  }};
  vm.runInNewContext(code, {document, window, IntersectionObserver: Observer, Date});
  return {toggle, links, nav, html, document, reveal, observers, media, navigation, sections};
}
const s = setup(false);
assert(s.html.classList.contains('js'));
s.toggle.fire('click', {});
assert.equal(s.toggle.getAttribute('aria-expanded'), 'true');
assert(s.links.classList.contains('is-open'));
s.document.fire('keydown', {key:'Escape'});
assert.equal(s.toggle.getAttribute('aria-expanded'), 'false');
assert(s.toggle.focused);
s.toggle.fire('click', {});
s.links.fire('click', {target:{closest: () => ({})}});
assert.equal(s.toggle.getAttribute('aria-expanded'), 'false');
s.toggle.fire('click', {});
s.document.fire('click', {target:{closest: () => null}});
assert.equal(s.toggle.getAttribute('aria-expanded'), 'false');
s.toggle.fire('click', {});
s.nav.fire('focusout', {relatedTarget:{insideNav:false}});
assert.equal(s.toggle.getAttribute('aria-expanded'), 'false');
s.toggle.fire('click', {});
s.media['(min-width: 901px)'].fire('change', {matches:true});
assert.equal(s.toggle.getAttribute('aria-expanded'), 'false');
s.observers[0].callback([{isIntersecting:true,target:s.reveal}]);
assert(s.reveal.classList.contains('is-inview'));
s.media['(prefers-reduced-motion: reduce)'].fire('change', {matches:true});
assert(!s.reveal.classList.contains('is-inview'));
assert(s.observers[0].disconnected);
s.observers[1].callback([{isIntersecting:true,target:s.sections[2]}]);
assert.equal(s.navigation[2].getAttribute('aria-current'), 'location');
assert.equal(s.navigation[0].getAttribute('aria-current'), undefined);
assert.equal(setup(true).observers.length, 1);
console.log('PASS: menu toggle, Escape/focus return, anchor/outside/focus-exit close, resize reset, reveal, reduced motion, and active-section navigation.');
console.log('DOM harness only; real-browser visual and keyboard inspection is still required.');

const live = setup(true);
assert.equal(live.observers.length, 1);
live.media['(prefers-reduced-motion: reduce)'].fire('change', {matches:false});
assert.equal(live.observers.length, 2);
assert.equal(live.observers[1].observed.length, 1);
live.observers[1].callback([{isIntersecting:true,target:live.reveal}]);
assert(live.reveal.classList.contains('is-inview'));
live.media['(prefers-reduced-motion: reduce)'].fire('change', {matches:true});
assert(!live.reveal.classList.contains('is-inview'));
live.media['(prefers-reduced-motion: reduce)'].fire('change', {matches:false});
assert.equal(live.observers[2].observed.length, 0);
console.log('PASS: initially reduced motion can re-enable reveal; seen content does not replay.');
