"""Real-browser checks with Playwright (development only; never shipped).

Serves dist/ locally, intercepts /api/* with scripted responses, and checks layout overflow at five widths,
mobile navigation, topic context, inquiry form states, duplicate-click safety, the registration preview,
assistant placement and keyboard entry. Optionally saves full-page screenshots.

  python3 -m pip install playwright && python3 -m playwright install chromium
  python3 scripts/check-browser.py [screenshot-directory]
"""
import contextlib
import functools
import http.server
import json
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parents[1] / 'dist'
WIDTHS = [360, 390, 768, 1024, 1440]
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def passed(label):
    print('PASS:', label)


@contextlib.contextmanager
def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(DIST))
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as httpd:
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{httpd.server_address[1]}'
        finally:
            httpd.shutdown()


def settle(page):
    page.evaluate("""async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); }""")
    page.wait_for_load_state('networkidle')


def fill_inquiry(page):
    page.fill('#inq-name', 'Maria Santos')
    page.fill('#inq-email', 'maria@example.org')
    page.select_option('#inq-type', 'Speaking invitation')
    page.fill('#inq-message', 'We would like a session on getting started with freelancing.')


with serve() as base, sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. Layout at representative widths
    for width in WIDTHS:
        for path in ['/', '/events/freelance-101/', '/404.html']:
            page = browser.new_page(viewport={'width': width, 'height': 860})
            page.emulate_media(reduced_motion='reduce')
            page.goto(base + path, wait_until='networkidle')
            settle(page)
            overflow = page.evaluate('document.documentElement.scrollWidth - innerWidth')
            assert overflow <= 0, (width, path, overflow)
            if path == '/':
                hidden = page.evaluate("""[...document.querySelectorAll('h1,h2,h3,p,a,button,label,input,select,textarea')]
                  .filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.hp-field,.skip-link,.sr-only,.pau-sr-only'); })
                  .map(e => e.outerHTML.slice(0, 80))""")
                assert not hidden, (width, hidden[:3])
                if width <= 390:
                    cta = page.locator('.hero .button').bounding_box()
                    assert cta['y'] + cta['height'] <= 860, 'primary hero action is visible without scrolling on mobile'
            if SHOTS:
                SHOTS.mkdir(parents=True, exist_ok=True)
                name = {'/': 'home', '/events/freelance-101/': 'event', '/404.html': '404'}[path]
                page.screenshot(path=str(SHOTS / f'{name}-{width}.png'), full_page=True)
            page.close()
    passed(f'no horizontal overflow or clipped controls at {", ".join(map(str, WIDTHS))}px; mobile hero action above the fold')

    # 2. Mobile navigation and anchor offsets
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.goto(base + '/', wait_until='networkidle')
    page.keyboard.press('Tab')
    assert page.evaluate('document.activeElement.className') == 'skip-link'
    toggle = page.locator('.nav-toggle')
    toggle.click()
    assert toggle.get_attribute('aria-expanded') == 'true'
    page.keyboard.press('Escape')
    assert toggle.get_attribute('aria-expanded') == 'false'
    assert page.evaluate("document.activeElement.classList.contains('nav-toggle')")
    toggle.click()
    page.locator('.nav-links a[href="#events"]').click()
    page.wait_for_timeout(300)
    assert toggle.get_attribute('aria-expanded') == 'false'
    header = page.locator('.site-header').bounding_box()
    heading = page.locator('#events-title').bounding_box()
    assert heading['y'] >= header['height'] - 2, 'anchor target is not hidden under the sticky header'
    passed('skip link first, menu open/Escape/focus return, closes after navigation, anchors clear the sticky header')

    # 3. Topic context, validation, states and duplicate safety
    requests = []
    mode = {'next': 'unavailable'}

    def inquiry_route(route):
        body = json.loads(route.request.post_data)
        requests.append(body)
        page.wait_for_timeout(400)
        if mode['next'] == 'unavailable':
            route.fulfill(status=503, content_type='application/json', body=json.dumps({'status': 'unavailable', 'code': 'not_configured'}))
        elif mode['next'] == 'error':
            route.fulfill(status=502, content_type='application/json', body=json.dumps({'status': 'not_recorded', 'code': 'not_recorded'}))
        else:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'status': 'received', 'id': 'PV-TEST-2345', 'notification': 'sent'}))

    page.route('**/api/inquiry', inquiry_route)
    page.locator('a[data-topic="Inspirational Leadership"]').click()
    assert page.input_value('#inq-topic') == 'Inspirational Leadership'
    assert page.input_value('#inq-type') == 'Speaking invitation'
    page.select_option('#inq-type', '')
    page.click('#inquiry-submit')
    assert page.locator('#inquiry-summary').is_visible()
    assert page.evaluate("document.activeElement.id") == 'inquiry-summary'
    assert page.locator('[aria-invalid="true"]').count() == 4
    assert not requests
    page.locator('#inquiry-summary a').first.click()
    assert page.evaluate("document.activeElement.id") == 'inq-name'

    fill_inquiry(page)
    page.locator('.pau-launcher').wait_for(state='attached')
    page.focus('#inq-name')
    assert page.evaluate("getComputedStyle(document.querySelector('.pau-launcher')).visibility") == 'hidden'
    page.click('#inquiry-submit')
    page.click('#inquiry-submit', force=True)  # second click while the first request is in flight
    page.locator('#inquiry-status .notice').wait_for()
    assert len(requests) == 1, 'a repeated click does not send a second request'
    assert 'isn’t available yet' in page.inner_text('#inquiry-status')
    assert page.input_value('#inq-name') == 'Maria Santos' and page.locator('#inquiry-status a[href^="mailto:"]').count() == 1

    mode['next'] = 'error'
    page.click('#inquiry-submit')
    page.wait_for_function("document.querySelector('#inquiry-status').innerText.includes('couldn’t confirm')")
    assert page.input_value('#inq-message').startswith('We would like')
    assert requests[0]['submissionKey'] == requests[1]['submissionKey'], 'retries reuse the same submission key'

    mode['next'] = 'ok'
    page.click('#inquiry-submit')
    page.wait_for_function("document.querySelector('#inquiry-status').innerText.includes('PV-TEST-2345')")
    status = page.inner_text('#inquiry-status')
    assert 'does not confirm' in status and page.input_value('#inq-name') == ''
    assert requests[2]['submissionKey'] == requests[0]['submissionKey']
    page.close()
    passed('topic preselection, error summary and focus, assistant tucks during form use, single in-flight request, not-configured/failure states keep data, reference ID on success')

    # 4. Registration preview never sends data
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    sent = []
    page.on('request', lambda r: sent.append(r.url) if r.method != 'GET' else None)
    page.goto(base + '/events/freelance-101/', wait_until='networkidle')
    assert 'sample event' in page.inner_text('.event-hero').lower()
    page.click('#registration-form button[type="submit"]')
    assert page.locator('#register-summary').is_visible() and page.locator('[aria-invalid="true"]').count() == 2
    page.fill('#reg-name', 'Juan Dela Cruz')
    page.fill('#reg-email', 'juan@example.org')
    page.click('#registration-form button[type="submit"]')
    assert page.locator('#registration-complete').is_visible()
    assert page.evaluate('document.activeElement.id') == 'registration-complete'
    assert 'No seat has been reserved' in page.inner_text('#registration-complete')
    assert not sent, sent
    page.click('#registration-restart')
    assert page.locator('#registration-form').is_visible() and page.input_value('#reg-name') == ''
    page.close()
    passed('registration preview validates, completes truthfully, clears entries and makes no network submission')

    # 5. Storybook pages, stage depth and the Moments deck (desktop)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto(base + '/', wait_until='networkidle')
    assert page.evaluate("getComputedStyle(document.querySelector('.page')).position") == 'sticky'
    page.evaluate("document.getElementById('chapter-3').scrollIntoView({block:'start', behavior:'instant'})")
    page.wait_for_timeout(600)
    assert page.locator('.chapter-index a[aria-current="step"]').get_attribute('href') == '#chapter-three'
    page.evaluate("scrollBy({top: -300, behavior: 'instant'})")
    page.wait_for_timeout(400)
    assert 'rotateX' in page.evaluate("document.querySelector('#chapter-2 .page-inner').style.transform"), 'the previous page settles back in 3D'
    page.evaluate("document.querySelector('[data-deck]').scrollIntoView({block:'center', behavior:'instant'})")
    page.wait_for_function("document.querySelector('[data-deck]').classList.contains('is-revealed')", timeout=5000)
    page.wait_for_timeout(1600)
    spread = page.evaluate("(() => { const r = [...document.querySelectorAll('.deck-card')].map(c => c.getBoundingClientRect().left); return Math.max(...r) - Math.min(...r); })()")
    assert spread > 300, spread
    page.mouse.move(1300, 200)
    page.evaluate("document.querySelector('.hero').scrollIntoView({behavior:'instant'})")
    page.wait_for_timeout(300)
    assert 'translate3d' in page.evaluate("document.querySelector('.hero .stage-figure').style.transform")
    assert page.evaluate("document.querySelector('.site-header').classList.contains('is-scrolled')") is False
    page.close()
    passed('storybook pages stack and turn in 3D, chapter index follows, stage layers move in depth, Moments prints fan out')

    browser.close()
print('Browser checks use intercepted API responses; live Apps Script, Sheet and email delivery are verified separately.')
