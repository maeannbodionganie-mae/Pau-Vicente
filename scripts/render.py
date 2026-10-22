"""Render the buildless portfolio from src/ into dist/.

Inputs (authoritative):
  src/index.html            homepage template
  src/event.html            event page template
  src/404.html              not-found page template
  src/content/events.json   single source for public events
  asset-map.json            responsive photo derivatives

Outputs (generated, do not edit by hand):
  dist/index.html
  dist/events/<slug>/index.html
  dist/404.html
  the "event" and "registration" facts inside dist/assets/pau-knowledge.json
"""
from pathlib import Path
from html import escape
from urllib.parse import urlencode, quote
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
DIST = ROOT / 'dist'
TBA = 'To be announced'
INQUIRY_EMAIL = 'pauline.vicente14@gmail.com'

photos = json.loads((ROOT / 'asset-map.json').read_text())
events_doc = json.loads((SRC / 'content/events.json').read_text())
events = events_doc['events']


def e(value):
    return escape(str(value), quote=True)


def validate_events():
    slugs = set()
    for event in events:
        for key in ['slug', 'status', 'statusLabel', 'title', 'shortTitle', 'topic', 'summary',
                    'audience', 'subjects', 'takeaways', 'format', 'date', 'time', 'venue', 'registration']:
            assert key in event, f'event missing {key}'
        assert re.fullmatch(r'[a-z0-9-]+', event['slug']), event['slug']
        assert event['slug'] not in slugs, f'duplicate slug {event["slug"]}'
        slugs.add(event['slug'])
        assert event['status'] in {'sample', 'confirmed'}, event['status']
        reg = event['registration']
        assert reg['mode'] in {'preview', 'live', 'closed'}, reg['mode']
        if reg['mode'] == 'live':
            assert reg.get('url', '').startswith('https://'), 'live registration needs an https url'
        if event['status'] == 'sample':
            assert reg['mode'] != 'live', 'a sample event cannot take live registrations'
        if event.get('image'):
            assert event['image'] in photos, f'unknown image {event["image"]}'


def picture(match):
    key, alt, sizes, cls = match.group(1).split('|')
    p = photos[key]
    hero = key in ('pau-hero', 'pau-hero-cut')
    srcset = ', '.join(f"{v['src']} {v['width']}w" for v in p['webp'])
    loading = 'fetchpriority="high" loading="eager"' if hero else 'loading="lazy"'
    return (f'<picture class="{e(cls)}" data-photo="{key}">'
            f'<source type="image/webp" srcset="{srcset}" sizes="{e(sizes)}">'
            f'<img src="{p["fallback"]}" width="{p["width"]}" height="{p["height"]}" '
            f'alt="{e(alt)}" {loading} decoding="async"></picture>')


def styled_title(title):
    """Render 'Main: Subtitle' with the subtitle in the display italic."""
    if ': ' in title:
        main, sub = title.split(': ', 1)
        return f'{e(main)}: <em>{e(sub)}</em>'
    return e(title)


def time_value(event):
    if event['time'] != TBA and event.get('timezone'):
        return f"{event['time']} ({event['timezone']})"
    return event['time']


def registration_value(event):
    mode = event['registration']['mode']
    if mode == 'live':
        return 'Open'
    if mode == 'closed':
        return 'Closed'
    return 'Not yet open (preview only)'


def details(event):
    rows = [('Audience', event['audience']), ('Format', event['format']), ('Date', event['date']),
            ('Time', time_value(event)), ('Venue or platform', event['venue']),
            ('Registration', registration_value(event))]
    tba_class = ' class="is-tba"'
    items = ''.join(
        f'<div><dt>{e(k)}</dt><dd{tba_class if v == TBA else ""}>{e(v)}</dd></div>'
        for k, v in rows)
    return f'<dl class="event-details">{items}</dl>'


def status_labels(event):
    labels = [f'<span class="status-{e(event["status"])}">{e(event["statusLabel"])}</span>']
    reg_label = event['registration'].get('statusLabel')
    if reg_label:
        labels.append(f'<span>{e(reg_label)}</span>')
    separator = '<span class="status-sep" aria-hidden="true">·</span>'
    return f'<p class="event-status">{separator.join(labels)}</p>'


def list_items(items, cls):
    return f'<ul class="{cls}">' + ''.join(f'<li>{e(x)}</li>' for x in items) + '</ul>'


def events_feature():
    heading = ('<header class="row-head container" data-reveal><div><p class="eyebrow">Events</p>'
               '<h2 id="events-title">Upcoming <em>sessions.</em></h2></div>'
               '<p>Public sessions are listed here once confirmed. Until then, the session below is a sample '
               'that shows how events and registration will work.</p></header>')
    if not events:
        body = ('<div class="event-empty container" data-reveal><p>No public sessions are listed right now.</p>'
                '<a class="text-link" href="#contact">Ask about bringing a session to your group</a></div>')
        return f'<section class="events panel anchored tone-light" id="events" aria-labelledby="events-title">{heading}{body}</section>'
    cards = []
    for event in events:
        tid = f'event-{event["slug"]}-title'
        action = 'View details &amp; preview registration' if event['registration']['mode'] == 'preview' else 'View details &amp; register'
        image = ''
        if event.get('image'):
            image = ('<div class="stage stage-sand event-stage" data-stage><div class="stage-panel" data-layer="0.35" aria-hidden="true"></div>'
                     '<div class="stage-line" data-layer="0.6" aria-hidden="true"></div>'
                     f'<figure class="stage-figure" data-layer="1">{{{{image:{event["image"]}|{e(event.get("imageAlt", "Pau Vicente"))}|'
                     '(max-width: 900px) 80vw, 30vw|cutout}}</figure></div>')
        cards.append(
            f'<article class="event-card container" aria-labelledby="{tid}" data-reveal>{image}'
            f'<div class="event-body">{status_labels(event)}'
            f'<h3 id="{tid}">{styled_title(event["title"])}</h3>'
            f'<p class="event-summary">{e(event["summary"])}</p>'
            f'<h4 class="event-subhead">What you’ll take away</h4>{list_items(event["takeaways"], "event-takeaways")}'
            f'{details(event)}'
            f'<div class="actions"><a class="button" href="events/{e(event["slug"])}/">{action}</a></div></div></article>')
    return f'<section class="events panel anchored tone-light" id="events" aria-labelledby="events-title">{heading}{"".join(cards)}</section>'


def registration_section(event):
    reg = event['registration']
    if reg['mode'] == 'live':
        return ('<section class="registration tone-sand section" id="register" aria-labelledby="register-title"><div class="container registration-grid">'
                '<div class="registration-intro"><p class="eyebrow">Registration</p>'
                '<h2 id="register-title">Registration is open.</h2>'
                '<p>Registration is handled on an external page. Submitting there reserves a seat according to its own confirmation.</p>'
                f'<div class="actions"><a class="button" href="{e(reg["url"])}" target="_blank" rel="noopener noreferrer">Register for this session</a></div>'
                '</div></div></section>')
    if reg['mode'] == 'closed':
        return ('<section class="registration tone-sand section" id="register" aria-labelledby="register-title"><div class="container registration-grid">'
                '<div class="registration-intro"><p class="eyebrow">Registration</p>'
                '<h2 id="register-title">Registration is closed.</h2>'
                '<div class="actions"><a class="button" href="/#contact">Ask Pau about future sessions</a></div>'
                '</div></div></section>')
    return f'''<section class="registration tone-sand section" id="register" aria-labelledby="register-title"><div class="container registration-grid">
      <div class="registration-intro"><p class="eyebrow">Registration preview</p><h2 id="register-title">Try the <em>registration form.</em></h2>
        <div class="notice" role="note"><p><strong>This is a preview, not a live registration.</strong> Registration for this session isn’t open yet. You can try the form, but no seat will be reserved and nothing you type is sent or saved.</p></div></div>
      <div class="registration-panel">
        <form class="registration-form" id="registration-form" novalidate data-mode="preview" aria-describedby="register-required-note">
          <p class="form-note" id="register-required-note">Fields marked <span aria-hidden="true">*</span><span class="sr-only">with an asterisk</span> are required.</p>
          <div class="form-summary" id="register-summary" role="alert" tabindex="-1" hidden></div>
          <div class="field-grid">
            <div class="field"><label for="reg-name">Full name <span class="req" aria-hidden="true">*</span></label><input id="reg-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="reg-name-error"><p class="field-error" id="reg-name-error" hidden></p></div>
            <div class="field"><label for="reg-email">Email <span class="req" aria-hidden="true">*</span></label><input id="reg-email" name="email" type="email" autocomplete="email" maxlength="160" required aria-describedby="reg-email-error"><p class="field-error" id="reg-email-error" hidden></p></div>
            <div class="field field-wide"><label for="reg-stage">Which best describes you?</label><select id="reg-stage" name="stage"><option>Prefer not to say</option><option>College student</option><option>Fresh graduate</option><option>Career shifter</option><option>Aspiring freelancer</option><option>Virtual assistant</option><option>Other</option></select></div>
            <div class="field field-wide"><label for="reg-hopes">What do you hope to learn?</label><textarea id="reg-hopes" name="hopes" rows="4" maxlength="1000"></textarea></div>
          </div>
          <div class="form-actions"><button class="button" type="submit"><span class="button-label">Complete preview</span></button></div>
        </form>
        <div class="registration-complete" id="registration-complete" tabindex="-1" hidden>
          <p class="eyebrow">Preview complete</p><h3>Nothing was sent.</h3>
          <p>No seat has been reserved, and the details you entered were not saved or shared. When a real session is confirmed, registration will open on this page.</p>
          <div class="actions"><a class="button" href="/#contact">Ask Pau about this session</a><button class="text-link" type="button" id="registration-restart">Try the preview again</button></div>
        </div>
      </div>
    </div></section>'''


def event_page(event):
    return f'''<article class="event-page" aria-labelledby="event-title">
      <header class="event-hero tone-dark">
        <div class="container">
          <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/#events">All events</a></nav>
          {status_labels(event)}<h1 id="event-title">{styled_title(event["title"])}</h1><p class="event-summary">{e(event["summary"])}</p>
        </div>
      </header>
      <div class="event-content tone-light section">
        <div class="container event-page-layout">
          <div class="event-page-copy">
            <section aria-labelledby="event-audience-title"><h2 class="event-h2" id="event-audience-title">Who it’s for</h2><p>{e(event["audience"])}</p></section>
            <section aria-labelledby="event-covers-title"><h2 class="event-h2" id="event-covers-title">What the session covers</h2>{list_items(event["subjects"], "topic-list")}</section>
            <section aria-labelledby="event-takeaways-title"><h2 class="event-h2" id="event-takeaways-title">What you’ll take away</h2>{list_items(event["takeaways"], "event-takeaways")}<p class="event-disclaimer">These are learning goals. The session does not guarantee clients, income, or employment.</p></section>
          </div>
          <aside class="event-page-aside" aria-label="Event details">{details(event)}</aside>
        </div>
      </div>
      {registration_section(event)}
    </article>'''


def subpage_chrome(index_template):
    """Reuse the homepage header and footer, pointing in-page links back to the homepage."""
    header = re.search(r'<header class="site-header">.*?</header>', index_template, re.S).group(0)
    footer = re.search(r'<footer class="site-footer[^"]*">.*?</footer>', index_template, re.S).group(0)
    fix = lambda html: re.sub(r'href="#', 'href="/#', html)
    footer = fix(footer).replace('href="/#home">Back to top', 'href="#main">Back to top')
    return fix(header), footer


def knowledge_facts():
    """Event facts for the assistant, generated from the same event source as the pages."""
    if not events:
        return [
            {"id": "event", "title": "Upcoming events", "href": "#events",
             "text": "No public sessions are listed on the website right now. Contact Pau to ask about bringing a session to your group."},
            {"id": "registration", "title": "Registration", "href": "#events",
             "text": "There is no open public registration on the website right now."}]
    event = events[0]
    unknown = [label for label, value in [('date', event['date']), ('time', event['time']),
                                          ('format', event['format']), ('venue', event['venue'])] if value == TBA]
    status = ('It is a sample listing that shows how events will be published, not a confirmed session.'
              if event['status'] == 'sample' else 'It is a confirmed session.')
    tba = f" Its {', '.join(unknown[:-1]) + ' and ' + unknown[-1] if len(unknown) > 1 else unknown[0]} {'are' if len(unknown) > 1 else 'is'} to be announced." if unknown else ''
    event_text = (f"The website lists {event['title']}. {status} It is for {event['audience'][0].lower() + event['audience'][1:]} "
                  f"Takeaways include: {', '.join(t[0].lower() + t[1:] for t in event['takeaways'])}.{tba} "
                  "No fee, capacity, or certificate has been announced.")
    mode = event['registration']['mode']
    if mode == 'preview':
        reg_text = ("Registration on the event page is a preview only. Visitors can try the form, but no seat is reserved and "
                    "nothing is sent or saved. Registration will open on the event page when a real session is confirmed. "
                    "Visitors can contact Pau with questions.")
    elif mode == 'live':
        reg_text = "Registration is open through the link on the event page. That page's own confirmation determines whether a seat is reserved."
    else:
        reg_text = "Registration for the listed session is closed. Visitors can contact Pau about future sessions."
    return [{"id": "event", "title": "Upcoming events", "href": "#events", "text": event_text},
            {"id": "registration", "title": "Registration", "href": "#events", "text": reg_text}]


def write_knowledge():
    path = DIST / 'assets/pau-knowledge.json'
    data = json.loads(path.read_text())
    generated = {f['id']: f for f in knowledge_facts()}
    facts = [f for f in data['facts'] if f['id'] not in generated]
    insert_at = next((i for i, f in enumerate(facts) if f['id'] == 'contact'), len(facts))
    facts[insert_at:insert_at] = list(generated.values())
    data['facts'] = facts
    compact = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    lines = ['{', f'  "version": {json.dumps(data["version"])},', f'  "provenance": {json.dumps(data["provenance"], ensure_ascii=False)},',
             '  "facts": [', ',\n'.join('    ' + compact(f) for f in facts), '  ],',
             '  "relationships": [', ',\n'.join('    ' + compact(r) for r in data['relationships']), '  ]', '}']
    path.write_text('\n'.join(lines) + '\n')


validate_events()
template = (SRC / 'index.html').read_text()
header, footer = subpage_chrome(template)

page = template.replace('{{events_feature}}', events_feature())
page = re.sub(r'\{\{image:([^}]+)\}\}', picture, page)
inquiry = f'mailto:{INQUIRY_EMAIL}?' + urlencode({
    'subject': 'Speaking inquiry for Pau Vicente',
    'body': 'Hello Pau,\n\nI would like to invite you to our event.\n\nName: \nOrganization: \nEmail: \nEvent type: \nPreferred date: \nLocation or online platform: \nMessage: \n\nThank you!'
}, quote_via=quote)
page = page.replace('{{inquiry}}', escape(inquiry, quote=True))
assert '{{' not in page
(DIST / 'index.html').write_text(page)

event_template = (SRC / 'event.html').read_text()
for event in events:
    html = (event_template
            .replace('{{site_header}}', header).replace('{{site_footer}}', footer)
            .replace('{{event_page}}', event_page(event))
            .replace('{{page_title}}', e(event['shortTitle'] + (' (sample event)' if event['status'] == 'sample' else '')))
            .replace('{{meta_description}}', e(event['summary']))
            .replace('{{robots}}', '<meta name="robots" content="noindex">' if event['status'] == 'sample' else '')
            .replace('{{slug}}', e(event['slug'])))
    html = re.sub(r'\{\{image:([^}]+)\}\}', picture, html).replace('src="assets/', 'src="/assets/').replace('srcset="assets/', 'srcset="/assets/')
    assert '{{' not in html
    out = DIST / 'events' / event['slug'] / 'index.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)

notfound = (SRC / '404.html').read_text().replace('{{site_header}}', header).replace('{{site_footer}}', footer)
assert '{{' not in notfound
(DIST / '404.html').write_text(notfound)

write_knowledge()
print(f'Rendered homepage with {len(photos)} responsive photographs, {len(events)} event page(s), 404 page, and event knowledge.')
