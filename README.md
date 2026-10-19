# Pau Vicente — Speaker Portfolio

A buildless, responsive personal speaker website. The published files are in `dist/`.

## Editing

- Edit the semantic page in `src/index.html`.
- Edit `dist/assets/style.css` and `dist/assets/main.js` for presentation and navigation.
- Run `python3 scripts/render.py` after content edits. This inserts responsive image sources and the email inquiry link.
- `asset-map.json` maps the 15 supplied original filenames to optimized browser assets.

## Content and photographs

The full source document and all four Pinterest reference images were reviewed. Every story chapter, topic, subtopic, outcome, audience group, and session format is included. All photographs come from the Drive file links in the supplied document.

The golden studio photography informed the ivory, charcoal, and muted ochre palette. Instrument Serif and DM Sans are hosted locally. Design references informed the typography, spacing, and photographic compositions; their portraits, branding, decorative artwork, testimonials, and example claims are not reused.

The original `IMG_0315.CR3` remains unchanged at its supplied Drive source and was decoded with camera white balance into an sRGB JPEG, then optimized for the website. A byte-identical downloaded original is retained outside the web source. The RAW file is never served in `dist/` or included in the publication repository. All original photographs remain unchanged at their supplied Drive sources. WebP sizes and JPEG fallbacks preserve image proportions and use orientation-aware conversion.

## Contact

The final inquiry button opens an email with event details for the organizer to fill in and send. There is no submission form, backend, booking calendar, or delivery confirmation. The email address, phone number, and social profiles are the public contact details explicitly supplied in the brief. Private administrative information has not been included.

## Accessibility

Semantic landmarks, a skip link, descriptive alternative text, keyboard-visible focus, a mobile menu with an expanded state and Escape handling, and reduced-motion support are included. Content is visible without JavaScript, including all story chapters and speaking details.

## Validation

Validated the four story chapters, 19 speaking subtopics, nine audience categories, seven formats, six outcomes, all 15 photo assignments, local asset paths, anchors, inquiry fields, public contact details, image dimensions, and the unchanged RAW original before publication. JavaScript syntax and text contrast checks passed. Portrait crops were inspected directly. Desktop and mobile browser screenshot inspection was unavailable in this environment and remains unverified.
