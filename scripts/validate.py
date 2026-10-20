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
assert len(soup.select('form')) == 1 and soup.select_one('form#pau-form')
assert set(re.findall(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', page)) == {'pauline.vicente14@gmail.com'}
assert not re.search(r'(?:password|passcode|api[_-]?key|secret)\s*[:=]', page, re.I)
passed('all anchors, public contacts, safe external links, and prefilled email inquiry')

assert len(manifest) == 15
assert len(soup.select('picture[data-photo] img')) == 15
assert len(soup.select('img')) == 16
assert len(soup.select('img[loading="lazy"]')) == 14
assert len(soup.select('img[fetchpriority="high"][loading="eager"]')) == 1
for key, photo in manifest.items():
    pictures = soup.select(f'picture[data-photo="{key}"]')
    assert len(pictures) == 1, key
    image = pictures[0].img
    assert image.get('alt') and len(image['alt']) > 15
    assert int(image['width']) > 0 and int(image['height']) > 0
    assert image.get('decoding') == 'async'
    assert pictures[0].source.get('srcset') and pictures[0].source.get('sizes')
    for variant in photo['webp']:
        path = DIST / variant['src']
        with Image.open(path) as asset:
            assert asset.size == (variant['width'], variant['height']), path
    with Image.open(DIST / photo['fallback']) as asset:
        assert asset.size == (photo['fallback_width'], photo['fallback_height'])
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
passed('all 15 intended photos, responsive sources, dimensions, local assets, and RAW-safe delivery')

def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in [0, 2, 4]]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(v * weight for v, weight in zip(linear, [.2126, .7152, .0722]))

for foreground, background in [('25241f','f7f3ec'),('535248','f7f3ec'),
        ('6f4c20','f7f3ec'),('6f4c20','eee8de'),('6f4c20','e4d8c8'),
        ('6f4c20','d5c5b2'),('535248','d5c5b2'),('514a40','e0d1bd'),
        ('705036','e4d8c8'),('f7f3ec','25241f'),('f7f3ec','6f4c20'),
        ('d8d5cb','33352e'),('d8bd94','33352e'),('e3cdb0','33352e')]:
    light, dark = sorted([luminance(foreground), luminance(background)], reverse=True)
    ratio = (light + .05) / (dark + .05)
    assert ratio >= 4.5, (foreground, background, ratio)
passed('14 text/background contrast pairs meet WCAG AA for normal text')

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
with Image.open(DIST / 'assets/pau-avatar.webp') as avatar:
    assert max(avatar.size) == 192 and avatar.mode == 'RGBA'
knowledge = json.loads((DIST / 'assets/pau-knowledge.json').read_text())
for fact in knowledge['facts']:
    assert fact['href'][1:] in ids
assert 'prefers-reduced-motion:reduce' in assistant_css
passed('assistant dialog/log/input contracts, transparent avatar, knowledge links, and reduced motion')

print('LIMITATION: real-browser screenshots at 320/390/768/1024/1440px were unavailable; visual viewport QA is not claimed.')
