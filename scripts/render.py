"""Render the buildless portfolio with responsive, locally hosted photographs."""
from pathlib import Path
import json
import re
from html import escape
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
photos = json.loads((ROOT / 'asset-map.json').read_text())
template = (ROOT / 'src/index.html').read_text()

def picture(match):
    key, alt, sizes, cls = match.group(1).split('|')
    p = photos[key]
    hero = key in {'pau-hero', 'pau-hero-cutout'}
    srcset = ', '.join(f"{e['src']} {e['width']}w" for e in p['webp'])
    loading = 'fetchpriority="high" loading="eager"' if hero else 'loading="lazy"'
    return (f'<picture class="{escape(cls)}" data-photo="{key}">'
            f'<source type="image/webp" srcset="{srcset}" sizes="{escape(sizes)}">'
            f'<img src="{p["fallback"]}" width="{p["width"]}" height="{p["height"]}" '
            f'alt="{escape(alt)}" {loading} decoding="async"></picture>')

template = re.sub(r'\{\{image:([^}]+)\}\}', picture, template)
inquiry = 'mailto:pauline.vicente14@gmail.com?' + urlencode({
    'subject': 'Speaking inquiry for Pau Vicente',
    'body': 'Hello Pau,\n\nI would like to invite you to our event.\n\nName: \nOrganization: \nEmail: \nEvent type: \nPreferred date: \nLocation or online platform: \nMessage: \n\nThank you!'
}, quote_via=__import__('urllib.parse', fromlist=['quote']).quote)
template = template.replace('{{inquiry}}', escape(inquiry, quote=True))
(ROOT / 'dist/index.html').write_text(template)
print('Rendered complete portfolio with 15 responsive photographs.')
