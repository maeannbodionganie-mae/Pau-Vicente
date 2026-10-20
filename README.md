# Pau Vicente — Speaker Portfolio

A buildless, responsive personal speaker website. The published files are in `dist/`.

## Editing

- Edit the semantic page in `src/index.html`.
- Edit `dist/assets/style.css` and `dist/assets/main.js` for presentation and navigation.
- Run `python3 scripts/render.py` after content edits. This inserts responsive image sources and the email inquiry link.
- `asset-map.json` maps the 15 supplied original filenames to optimized browser assets.

## Editorial redesign

The `redesign/editorial-speaker` branch implements the “A Story Worth Sharing” redesign. It retains buildless HTML/CSS/JavaScript and the existing Vercel `dist/` root. Read `REDESIGN_NOTES.md` for the section compositions, asset treatment, and verification limits.

The hero now uses the `pau-hero-editorial-*` transparent WebP derivatives through the same asset map as the other photographs, with a transparent PNG fallback. The original hero JPEG and earlier derivatives remain available. Social sharing uses the original JPEG for a reliable opaque preview.

For local review after extracting the project, open `dist/index.html` in a browser. For an HTTP preview on your own computer, run `python3 -m http.server 8000 --directory dist` from the project root, then visit `http://localhost:8000`.

## Repeatable checks

```bash
python3 scripts/render.py
python3 -m pip install -r scripts/requirements-qa.txt
python3 scripts/validate.py
node --check dist/assets/main.js
node scripts/check-interactions.cjs
node scripts/check-pau-api.cjs
node scripts/check-pau-ui.cjs
git diff --check
```

The Python validator uses Git history at `a15d58d` to verify story and list preservation, so run it from a Git checkout. The JavaScript harness exercises menu behavior without claiming browser testing. QA dependencies are development-only and are never shipped to visitors.

## Content and photographs

The full source document and all four Pinterest reference images were reviewed. Every story chapter, topic, subtopic, outcome, audience group, and session format is included. All photographs come from the Drive file links in the supplied document.

The current palette follows the owner-supplied October 20 screenshot: deep espresso `#2B201A` as the main and hero background, warm ivory `#E8DFD0` text, muted cream `#EADECE` buttons, and related dark brown section surfaces. The chat shares the same palette. The studio photography and white blazer remain unchanged. Instrument Serif and DM Sans are hosted locally. Design references informed the typography, spacing, and photographic compositions; their portraits, branding, decorative artwork, testimonials, and example claims are not reused.

The original `IMG_0315.CR3` remains unchanged at its supplied Drive source and was decoded with camera white balance into an sRGB JPEG, then optimized for the website. A byte-identical downloaded original is retained outside the web source. The RAW file is never served in `dist/` or included in the publication repository. All original photographs remain unchanged at their supplied Drive sources. WebP sizes and JPEG fallbacks preserve image proportions and use orientation-aware conversion.

## Contact

The final inquiry button opens an email with event details for the organizer to fill in and send. There is no inquiry-delivery integration, booking calendar, or delivery confirmation. The email address, phone number, and social profiles are the public contact details explicitly supplied in the brief. Private administrative information has not been included.

## Pau assistant

The draggable lower-right illustrated avatar opens a portfolio guide. It uses only reviewed public facts and declines unrelated questions. A server-side Gemini routing integration is ready for configuration; without a key it is explicitly a deterministic portfolio guide. Graphify is not connected pending identification of the intended service. See `PAU_ASSISTANT.md` for setup, safeguards, asset provenance, and verification limits.

## Accessibility

Semantic landmarks, a skip link, descriptive alternative text, keyboard-visible focus, a mobile menu with an expanded state and Escape handling, and reduced-motion support are included. Content is visible without JavaScript, including all story chapters and speaking details.

## Validation

The editorial redesign passes checks for all four complete story chapters, 19 speaking subtopics, nine audience categories, seven formats, six outcomes, all 15 photo assignments, local asset paths, anchors, inquiry fields, public contacts, image dimensions, CSS parsing, JavaScript syntax, and the current palette's text/background contrast pairs. A DOM harness checks the mobile menu, focus return, responsive reset, reveal behavior, reduced motion, and active navigation.

The processed hero and assistant avatar were visually inspected. Real-browser page screenshots at 320, 390, 768, 1024, and 1440 pixels could not be captured because the supported browser-preview plugin is unavailable in this environment. Those viewport layouts and real browser keyboard behavior still need visual inspection. Core Web Vitals and actual email delivery have not been measured. The editorial redesign was deployed to the existing public GitHub/Vercel site; assistant release status is tracked in Git history and Vercel deployment checks.
