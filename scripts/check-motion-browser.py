"""Real Chromium checks for scroll motion, readable fallbacks, and mobile layouts.

Run from a Git checkout after rendering dist/:
    python scripts/check-motion-browser.py

The server binds only to loopback. API routes are intercepted; no forms are sent.
Viewport JPEG proofs are saved under docs/review/cutouts-scroll/.
"""
from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
PROOFS = ROOT / "docs" / "review" / "cutouts-scroll"
VIEWS = [
    ("phone", 360, 740),
    ("phone-wide", 390, 844),
    ("phone-landscape", 844, 390),
    ("desktop-short", 1024, 620),
    ("desktop", 1440, 900),
]


@contextlib.contextmanager
def serve():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port),
         "--bind", "127.0.0.1", "--directory", str(DIST)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=flags,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("The loopback preview server exited early")
            try:
                with urllib.request.urlopen(base + "/index.html", timeout=1) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError, OSError):
                time.sleep(0.05)
        else:
            raise RuntimeError("The loopback preview server did not become ready")
        yield base
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def passed(label):
    print("PASS:", label, flush=True)


def make_page(browser, base, width, height, *, javascript=True, reduced=False):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        is_mobile=width <= 900, has_touch=width <= 900,
        java_script_enabled=javascript,
    )
    context.route(
        "**/api/**",
        lambda route: route.fulfill(
            status=503, content_type="application/json",
            body=json.dumps({"status": "unavailable", "code": "not_configured"}),
        ),
    )
    page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    writes = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: writes.append(request.url)
            if request.method not in ("GET", "HEAD") else None)
    page.emulate_media(reduced_motion="reduce" if reduced else "no-preference")
    page.goto(base + "/", wait_until="networkidle")
    if javascript:
        page.evaluate("async () => { if (document.fonts) await document.fonts.ready; }")
        page.wait_for_function(
            "(enabled) => document.documentElement.classList.contains('motion') === enabled",
            arg=not reduced,
        )
    return context, page, errors, writes


def assert_clean(errors, writes, label):
    assert not errors, (label, "JavaScript errors", errors)
    assert not writes, (label, "Unexpected non-read request", writes)


def assert_overflow(page, label):
    result = page.evaluate("""() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    })""")
    assert result["document"] <= result["viewport"] + 2, (label, result)
    assert result["body"] <= result["viewport"] + 2, (label, result)


def assert_finite_motion(page, label):
    failures = page.evaluate("""() => {
      const bad = [];
      for (const el of document.querySelectorAll('[data-layer], .page-inner, .moment, .moment img')) {
        const style = getComputedStyle(el);
        const values = [el.style.transform, el.style.opacity, el.style.getPropertyValue('--moment-dim')];
        if (values.some(value => /NaN|Infinity/.test(value))) bad.push(el.className + ': inline');
        if (style.transform !== 'none') {
          try {
            const matrix = new DOMMatrixReadOnly(style.transform);
            if (![...matrix.toFloat64Array()].every(Number.isFinite)) bad.push(el.className + ': matrix');
          } catch (_) { bad.push(el.className + ': transform'); }
        }
        const rect = el.getBoundingClientRect();
        if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) bad.push(el.className + ': bounds');
      }
      return bad;
    }""")
    assert not failures, (label, failures)


def assert_story_readable(page, label):
    result = page.evaluate("""() => {
      const stacked = document.documentElement.classList.contains('story-stacked');
      const height = document.documentElement.clientHeight;
      const bad = [];
      for (const article of document.querySelectorAll('.storybook > .page')) {
        const inner = article.querySelector('.page-inner');
        const position = getComputedStyle(article).position;
        if (stacked) {
          if (position !== 'sticky' || inner.scrollHeight > article.clientHeight + 1) bad.push(article.id + ': stacked overflow');
        } else {
          if (position === 'sticky') bad.push(article.id + ': static flow is sticky');
          const boundary = article.getBoundingClientRect();
          for (const text of article.querySelectorAll('.chapter-text p, .chapter-text h3')) {
            const rect = text.getBoundingClientRect();
            if (rect.top < boundary.top - 2 || rect.bottom > boundary.bottom + 2) bad.push(article.id + ': clipped text');
          }
        }
      }
      return {stacked, bad};
    }""")
    assert not result["bad"], (label, result)


def assert_static_motion(page, label):
    result = page.evaluate("""() => {
      const root = document.documentElement;
      const bad = [];
      for (const name of ['motion', 'cine', 'story-stacked']) {
        if (root.classList.contains(name)) bad.push(name);
      }
      for (const el of document.querySelectorAll('[data-layer], .page-inner, .moment, .moment img')) {
        if (el.style.transform || el.style.filter) bad.push(el.className + ': retained inline motion');
      }
      for (const el of document.querySelectorAll('.stage-figure')) {
        if (Number(getComputedStyle(el).opacity) < 0.95) bad.push('hidden stage portrait');
      }
      return bad;
    }""")
    assert not result, (label, result)
    assert_story_readable(page, label)


def assert_visible_reveals(page, label):
    failures = page.evaluate("""() => {
      const bad = [];
      for (const el of document.querySelectorAll('[data-curtain]')) {
        const rect = el.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, innerHeight * 0.9) - Math.max(rect.top, 0);
        if (visibleHeight < 16 || !rect.width || !rect.height) continue;
        if (!el.classList.contains('is-revealed')) bad.push(el.className + ': not revealed');
        const portrait = el.querySelector('.stage-figure');
        if (portrait && Number(getComputedStyle(portrait).opacity) < 0.9) bad.push('portrait opacity');
      }
      return bad;
    }""")
    assert not failures, (label, failures)


def scroll_to(page, selector, offset=0):
    page.evaluate("""({selector, offset}) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error('Missing review target: ' + selector);
      scrollTo({top: el.getBoundingClientRect().top + scrollY + offset, behavior: 'instant'});
    }""", {"selector": selector, "offset": offset})
    page.wait_for_timeout(1150)


def capture(page, name):
    broken = page.evaluate("""async () => {
      const images = [...document.images].filter(img => {
        const r = img.getBoundingClientRect();
        return r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      });
      await Promise.all(images.map(img => img.decode ? img.decode().catch(() => undefined) : Promise.resolve()));
      return images.filter(img => !img.naturalWidth).map(img => img.currentSrc || img.src);
    }""")
    assert not broken, ("Broken visible images", name, broken)
    PROOFS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(PROOFS / f"motion-{name}.jpg"), type="jpeg", quality=82, full_page=False)


def check_anchor(page):
    if page.locator(".nav-toggle").is_visible():
        if page.locator(".nav-toggle").get_attribute("aria-expanded") != "true":
            page.locator(".nav-toggle").click()
    page.locator('.nav-links a[href="#speaking-topics"]').click()
    page.wait_for_timeout(1150)
    header = page.locator(".site-header").bounding_box()
    heading = page.locator("#topics-title").bounding_box()
    assert header and heading
    assert heading["y"] >= header["y"] + header["height"] - 3, ("Anchor under header", heading, header)
    assert page.evaluate("location.hash") == "#speaking-topics"
    if page.locator(".nav-toggle").is_visible():
        assert page.locator(".nav-toggle").get_attribute("aria-expanded") == "false"


def check_runtime_preferences(page, label):
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_function("!document.documentElement.classList.contains('motion')")
    page.wait_for_timeout(100)
    assert_static_motion(page, label + " reduced")
    page.emulate_media(reduced_motion="no-preference")
    page.wait_for_function("document.documentElement.classList.contains('motion')")
    page.wait_for_timeout(450)
    assert_finite_motion(page, label + " re-enabled")
    assert_story_readable(page, label + " re-enabled")
    assert_visible_reveals(page, label + " re-enabled")



def check_print_layout(page):
    page.emulate_media(media="print")
    page.wait_for_timeout(350)
    failures = page.evaluate("""() => {
      const bad = [];
      for (const article of document.querySelectorAll('.storybook > .page')) {
        const inner = article.querySelector('.page-inner');
        const outerStyle = getComputedStyle(article);
        const innerStyle = getComputedStyle(inner);
        if (outerStyle.position !== 'static' || outerStyle.overflowY !== 'visible') bad.push(article.id + ': pinned print page');
        if (innerStyle.transform !== 'none' || Number(innerStyle.opacity) < 0.99) bad.push(article.id + ': transformed print content');
        if (article.clientHeight + 2 < inner.scrollHeight) bad.push(article.id + ': cropped print content');
      }
      return bad;
    }""")
    assert not failures, ("Print story fallback", failures)
    page.emulate_media(media="screen")
    page.evaluate("dispatchEvent(new Event('resize'))")
    page.wait_for_timeout(450)
    assert_story_readable(page, "after print preview")
    passed("print preview uses full-height static story content without transforms")


def check_long_story_and_resize(page):
    original = page.evaluate("document.documentElement.classList.contains('story-stacked')")
    page.evaluate("""() => {
      window.__motionStackTransitions = [];
      let prior = document.documentElement.classList.contains('story-stacked');
      window.__motionStackObserver = new MutationObserver(() => {
        const next = document.documentElement.classList.contains('story-stacked');
        if (next !== prior) window.__motionStackTransitions.push(next);
        prior = next;
      });
      window.__motionStackObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
      const copy = document.querySelector('#chapter-1 .chapter-copy');
      const extra = document.createElement('p');
      extra.id = 'motion-qa-long-content';
      extra.textContent = copy.querySelector('p').textContent.repeat(10);
      copy.append(extra);
      dispatchEvent(new Event('resize'));
    }""")
    page.wait_for_function("!document.documentElement.classList.contains('story-stacked')")
    page.wait_for_timeout(850)
    assert_story_readable(page, "injected long chapter")
    transitions = page.evaluate("window.__motionStackTransitions")
    assert len(transitions) <= 1, ("Story fit oscillates after overflow", transitions)
    page.evaluate("""() => {
      window.__motionStackObserver.disconnect();
      document.querySelector('#motion-qa-long-content').remove();
      dispatchEvent(new Event('resize'));
    }""")
    page.wait_for_function(
        "(expected) => document.documentElement.classList.contains('story-stacked') === expected",
        arg=original,
    )
    for width in (900, 901, 1440):
        page.set_viewport_size({"width": width, "height": 900})
        page.wait_for_function(
            "(expected) => document.documentElement.classList.contains('cine') === expected",
            arg=width >= 901,
        )
        page.wait_for_timeout(450)
        assert_story_readable(page, f"resize {width}")
        assert_overflow(page, f"resize {width}")
        assert_finite_motion(page, f"resize {width}")
    passed("long chapters remain readable; story fit does not oscillate; resize crosses 900/901 safely")


with serve() as base, sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    for label, width, height in VIEWS:
        context, page, errors, writes = make_page(browser, base, width, height)
        page.wait_for_timeout(2050)  # Complete the existing hero headline/proof entrance.
        assert_overflow(page, label + " hero")
        assert_finite_motion(page, label + " hero")
        assert_story_readable(page, label + " initial")
        if label == "desktop":
            capture(page, "desktop-hero")
        elif label == "phone":
            capture(page, "mobile-hero")
        elif label == "phone-landscape":
            capture(page, "mobile-landscape")

        scroll_to(page, "#about")
        assert_visible_reveals(page, label + " about")
        assert_overflow(page, label + " about")
        if label == "desktop":
            capture(page, "desktop-about")
        elif label == "phone":
            capture(page, "mobile-about")

        scroll_to(page, "#chapter-2")
        assert_story_readable(page, label + " story")
        assert_visible_reveals(page, label + " story")
        assert_finite_motion(page, label + " story")
        assert_overflow(page, label + " story")
        if label == "desktop":
            capture(page, "desktop-story")
        elif label == "desktop-short":
            capture(page, "desktop-short-story")

        if width >= 901 and height >= 620:
            page.wait_for_function("document.documentElement.classList.contains('cine')")
            track = page.evaluate("""() => {
              const el = document.querySelector('[data-cinema]');
              return {top: el.getBoundingClientRect().top + scrollY,
                      range: Math.max(1, el.offsetHeight - document.documentElement.clientHeight)};
            }""")
            page.evaluate("(t) => scrollTo({top: t.top + t.range * 0.30, behavior: 'instant'})", track)
            page.wait_for_timeout(700)
            large = page.locator(".moment").first.bounding_box()
            assert large and large["width"] >= width * 0.88, (label, "Moments did not open", large)
            assert_finite_motion(page, label + " cinema")
            assert_overflow(page, label + " cinema")
            if label == "desktop":
                capture(page, "desktop-moments")
            page.evaluate("(t) => scrollTo({top: t.top + t.range * 0.02, behavior: 'instant'})", track)
            page.wait_for_timeout(700)
            small = page.locator(".moment").first.bounding_box()
            assert small and small["width"] <= width * 0.75, (label, "Moments did not recede", small)
        else:
            assert not page.evaluate("document.documentElement.classList.contains('cine')")
            scroll_to(page, ".moments")
            assert_overflow(page, label + " moments")
            if label == "phone":
                capture(page, "mobile-moments")

        scroll_to(page, "#events")
        assert_visible_reveals(page, label + " event")
        assert_overflow(page, label + " event")
        if label == "desktop":
            capture(page, "desktop-event")
        check_anchor(page)
        if label in ("desktop", "phone-wide"):
            check_runtime_preferences(page, label)
        if label == "desktop":
            check_long_story_and_resize(page)
            check_print_layout(page)
        assert_clean(errors, writes, label)
        context.close()
        passed(f"{label} {width}x{height}: scroll, reveals, finite transforms, story flow, anchors and overflow")

    context, page, errors, writes = make_page(browser, base, 1440, 900, reduced=True)
    assert_static_motion(page, "initial reduced preference")
    check_runtime_preferences(page, "initial reduced preference")
    assert_clean(errors, writes, "initial reduced preference")
    context.close()
    passed("initial and runtime reduced-motion preferences preserve visible, readable content")

    for width, height in ((1440, 900), (390, 844)):
        context, page, errors, writes = make_page(browser, base, width, height, javascript=False)
        assert_static_motion(page, f"no JavaScript {width}")
        assert_overflow(page, f"no JavaScript {width}")
        scroll_to(page, "#chapter-2")
        assert_story_readable(page, f"no JavaScript story {width}")
        assert_overflow(page, f"no JavaScript story {width}")
        if width == 1440:
            capture(page, "static-story")
        assert_clean(errors, writes, f"no JavaScript {width}")
        context.close()
    browser.close()

passed("desktop/mobile static flow remains readable without JavaScript")
print(f"Viewport JPEG proofs: {PROOFS.relative_to(ROOT)}", flush=True)
print("No live inquiry, registration, Sheet or email submission was performed.", flush=True)
