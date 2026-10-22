"""Validate content preservation, publication assets, and accessibility contracts.

These are static checks, not a substitute for real browser viewport inspection.
"""
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import json
import re
import subprocess

from bs4 import BeautifulSoup
from PIL import Image
import tinycss2

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
page = (DIST / 'index.html').read_text()
soup = BeautifulSoup(page, 'html.parser')
baseline = BeautifulSoup(subprocess.check_output(
    ['git', 'show', 'a15d58d:dist/index.html'], cwd=ROOT, text=True
), 'html.parser')
css = (DIST / 'assets/style.css').read_text()
assistant_css = (DIST / 'assets/pau-assistant.css').read_text()
manifest = json.loads((ROOT / 'asset-map.json').read_text())

def normalized(element):
    return ' '.join(element.stripped_strings)

def passed(label):
    print('PASS:', label)

assert '{{' not in page
assert len(soup.select('h1')) == 1
ids = [tag['id'] for tag in soup.select('[id]')]
assert len(ids) == len(set(ids))
for tag in soup.select('[aria-labelledby]'):
    for ident in tag['aria-labelledby'].split():
        assert ident in ids, ident
assert len(soup.select('.chapter')) == 4
for before, after in zip(baseline.select('.chapter-copy'), soup.select('.chapter-copy')):
    for paragraph in before.select('p'):
        assert normalized(paragraph) in normalized(after)
for cls in ['about-copy', 'style-copy']:
    before = baseline.select_one('.' + cls)
    after = soup.select_one('.' + cls)
    for paragraph in before.find_all('p', recursive=False):
        if 'eyebrow' not in paragraph.get('class', []):
            assert normalized(paragraph) in normalized(after)
passed('complete four-chapter story, introduction, and speaking-style copy preserved')

for selector, counts in [('.topic-list', [6, 6, 7]), ('.outcome-list', [6]),
                         ('.audience-list', [9]), ('.format-index ul', [7])]:
    found = soup.select(selector)
    assert [len(x.find_all('li', recursive=False)) for x in found] == counts
    old_selector = '.formats ul' if selector == '.format-index ul' else selector
    old_items = [normalized(x) for block in baseline.select(old_selector) for x in block.select('li')]
    new_items = [normalized(x) for block in found for x in block.select('li')]
    assert old_items == new_items, selector
passed('19 topic subpoints, 6 outcomes, 9 audiences, and 7 formats match the baseline exactly')

for link in soup.select('a'):
    href = link.get('href', '')
    assert href and href != '#'
    if href.startswith('#'):
        assert href[1:] in ids, href
    if link.get('target') == '_blank':
        assert 'noopener' in link.get('rel', [])
inquiry = [x['href'] for x in soup.select('a[href^="mailto:"]') if '?' in x['href']]
assert len(inquiry) == 1
query = parse_qs(urlsplit(inquiry[0]).query)
for field in ['Name:', 'Organization:', 'Email:', 'Event type:', 'Preferred date:',
              'Location or online platform:', 'Message:']:
    assert field in query['body'][0]
assert soup.select_one('a[href="tel:+639153412728"]')
for href in ['https://www.facebook.com/paulinemelissar.v/',
             'https://www.linkedin.com/in/pauline-vicente-b86849234/',
             'https://www.instagram.com/pau.melissaa/']:
    assert soup.find('a', href=href)
assert not soup.select('iframe, video')
assert len(soup.select('form')) == 2 and soup.select_one('form#pau-form') and soup.select_one('form#inquiry-form')
assert set(re.findall(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', page)) == {'pauline.vicente14@gmail.com'}
assert not re.search(r'(?:password|passcode|api[_-]?key|secret)\s*[:=]', page, re.I)
passed('all anchors, public contacts, safe external links, and prefilled email fallback')

assert len(manifest) >= 15
used = [pic['data-photo'] for pic in soup.select('picture[data-photo]')]
assert len(used) == len(set(used)) >= 15, used
assert {k for k in manifest if not k.endswith('-cut')} - {'pau-about', 'pau-speaking-style', 'pau-why', 'pau-contact', 'cross-core-team'} <= set(used), 'every documentary photograph is shown'
assert set(used) <= set(manifest)
assert len(soup.select('img')) == len(used)
assert len(soup.select('img[fetchpriority="high"][loading="eager"]')) == 1
assert soup.select_one('picture[data-photo="pau-hero"] img[fetchpriority="high"]')
assert len(soup.select('img[loading="lazy"]')) == len(used) - 1
for key, photo in manifest.items():
    for variant in photo['webp']:
        with Image.open(DIST / variant['src']) as asset:
            assert asset.size == (variant['width'], variant['height']), variant['src']
    with Image.open(DIST / photo['fallback']) as asset:
        assert asset.size == (photo['fallback_width'], photo['fallback_height'])
for key in used:
    image = soup.select_one(f'picture[data-photo="{key}"] img')
    assert image.get('alt') and len(image['alt']) > 15
    assert int(image['width']) > 0 and int(image['height']) > 0
    assert image.get('decoding') == 'async'
    assert image.find_previous_sibling('source').get('srcset')
for tag, attr in [('img', 'src'), ('script', 'src'), ('link', 'href')]:
    for element in soup.select(tag):
        ref = element.get(attr, '')
        if ref and not urlsplit(ref).scheme and not ref.startswith('#'):
            assert (DIST / ref).is_file(), ref
for sheet in (DIST / 'assets/fonts').glob('*.css'):
    for url in re.findall(r'url\(([^)]+)\)', sheet.read_text()):
        assert (sheet.parent / url).exists(), url
for path in DIST.rglob('*'):
    assert path.suffix.lower() != '.cr3'
passed(f'{len(used)} curated photos (yellow studio backgrounds replaced by cutouts), responsive sources, dimensions, local assets, and RAW-safe delivery')

def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in [0, 2, 4]]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(v * weight for v, weight in zip(linear, [.2126, .7152, .0722]))

palette = dict(re.findall(r'--([a-z-]+):#([0-9a-f]{6})\b', css))
assert palette['paper'] == '2b201a' and palette['ink'] == 'e8dfd0', 'espresso and ivory foundation'
dark_grounds = [palette['paper'], palette['oat'], palette['espresso-deep']]
light_grounds = [palette['cream'], palette['sand'], palette['card']]
contrast_pairs = {(palette[t], bg) for t in ['ink', 'body', 'accent', 'error-dark'] for bg in dark_grounds}
contrast_pairs |= {(palette[t], bg) for t in ['cream-ink', 'cream-muted', 'cream-accent', 'error-light'] for bg in light_grounds}
contrast_pairs |= {(palette['button-ink'], palette['button']), (palette['cream'], palette['paper'])}
for foreground, background in contrast_pairs:
    light, dark = sorted([luminance(foreground), luminance(background)], reverse=True)
    ratio = (light + .05) / (dark + .05)
    assert ratio >= 4.5, (foreground, background, ratio)
for bg in light_grounds:
    light_l, dark_l = sorted([luminance(palette['field-line']), luminance(bg)], reverse=True)
    assert (light_l + .05) / (dark_l + .05) >= 3, 'form field boundaries need 3:1'
passed(f'{len(contrast_pairs)} text/background pairs meet WCAG AA on espresso and cream; field borders meet 3:1')

errors = []
def inspect_rules(rules):
    for rule in rules:
        if rule.type == 'error':
            errors.append(rule)
        elif rule.type == 'qualified-rule':
            errors.extend(x for x in tinycss2.parse_declaration_list(rule.content) if x.type == 'error')
        elif rule.type == 'at-rule' and rule.content is not None:
            inspect_rules(tinycss2.parse_rule_list(rule.content))
inspect_rules(tinycss2.parse_stylesheet(css + '\n' + assistant_css, skip_whitespace=True, skip_comments=True))
assert not errors, errors
assert 'prefers-reduced-motion:reduce' in css
assert '.skip-link:focus' in css and ':focus-visible' in css
assert not re.search(r'opacity\s*:\s*0(?:[;}\s])', css)
assert 'max-width:600px' in css and 'max-width:900px' in css
assert soup.select_one('.nav-toggle[aria-controls="navigation-links"][aria-expanded="false"]')
passed('CSS parses, reduced motion/focus support, visible content, and mobile navigation contract')

assert soup.select_one('#pau-launcher[aria-controls="pau-chat"][aria-expanded="false"]')
assert soup.select_one('#pau-chat[role="dialog"][aria-modal="false"][hidden]')
assert soup.select_one('#pau-messages[role="log"][aria-live="polite"]')
assert soup.select_one('#pau-question[maxlength="1000"]')
assert soup.select_one('#pau-launcher .pau-launcher-label').get_text(strip=True) == 'Ask Pau'
knowledge = json.loads((DIST / 'assets/pau-knowledge.json').read_text())
for fact in knowledge['facts']:
    assert fact['href'][1:] in ids
assert 'prefers-reduced-motion:reduce' in assistant_css
passed('assistant dialog/log/input contracts, text launcher, knowledge links, and reduced motion')

# Inquiry form: visible labels, described errors, topic context, honest fallback
form = soup.select_one('#inquiry-form')
assert form.get('novalidate') is not None and form.get('data-endpoint') == '/api/inquiry' and not form.get('action')
controls = form.select('input, select, textarea')
for control in controls:
    if control['name'] == 'website':
        assert control.find_parent(class_='hp-field') and control.get('tabindex') == '-1'
        continue
    assert form.select_one(f'label[for="{control["id"]}"]'), control['id']
for name in ['name', 'email', 'inquiryType', 'message']:
    control = form.select_one(f'[name="{name}"]')
    assert control.has_attr('required')
    described = control['aria-describedby'].split()
    assert any(d.endswith('-error') and soup.find(id=d) for d in described), name
topics = [o.get_text() for o in form.select('#inq-topic option')]
triggers = [a['data-topic'] for a in soup.select('a[data-topic]')]
assert len(triggers) == 3 and set(triggers) <= set(topics) and 'Not sure yet' in topics
assert soup.select_one('#inquiry-status[role="status"][aria-live="polite"]')
assert 'does' in normalized(soup.select_one('.contact-lede')) and 'booking' in normalized(soup.select_one('.contact-lede'))
passed('inquiry form labels, required-field errors, topic preselection targets, and booking disclaimer')

# Events: one source renders the homepage feature, event page and assistant facts
events_source = json.loads((ROOT / 'src/content/events.json').read_text())['events']
feature = soup.select('#events .event-card')
assert len(feature) == len(events_source) == 1
event = events_source[0]
assert event['status'] == 'sample' and event['statusLabel'] in normalized(feature[0])
assert soup.select_one('.hero a[href="#events"]') and soup.select_one('.nav-links a[href="#events"]')
event_page = BeautifulSoup((DIST / 'events' / event['slug'] / 'index.html').read_text(), 'html.parser')
assert '{{' not in str(event_page) and len(event_page.select('h1')) == 1
assert event_page.select_one('meta[name="robots"][content="noindex"]'), 'sample events stay out of search results'
reg = event_page.select_one('#registration-form[data-mode="preview"]')
assert reg and not reg.get('action') and 'no seat will be reserved' in normalized(event_page.select_one('.registration .notice'))
assert 'Nothing was sent' in normalized(event_page.select_one('#registration-complete'))
for value in [event['date'], event['time'], event['venue'], event['format']]:
    assert value in normalized(event_page.select_one('.event-details'))
for tag, attr in [('script', 'src'), ('link', 'href'), ('a', 'href')]:
    for element in event_page.select(tag):
        ref = element.get(attr, '')
        if ref.startswith('/') and not ref.startswith('//'):
            target = ref.split('#')[0]
            assert target == '/' or (DIST / target.lstrip('/')).exists(), ref
        if ref.startswith('/#'):
            assert ref[2:] in ids, ref
notfound = BeautifulSoup((DIST / '404.html').read_text(), 'html.parser')
assert '{{' not in str(notfound) and notfound.select_one('meta[name="robots"][content="noindex"]') and notfound.select_one('a[href="/"]')
facts = {f['id']: f for f in json.loads((DIST / 'assets/pau-knowledge.json').read_text())['facts']}
assert event['title'] in facts['event']['text'] and 'not a confirmed session' in facts['event']['text']
assert 'no seat is reserved' in facts['registration']['text']
assert not re.search(r'countdown|sold out|limited seats|hurry', page + str(event_page), re.I)
passed('sample event labelled everywhere, preview registration is local-only, event page links resolve, 404 page, and matching assistant facts')

print('Static checks only. Run scripts/check-browser.py for real-browser viewport and interaction checks.')
