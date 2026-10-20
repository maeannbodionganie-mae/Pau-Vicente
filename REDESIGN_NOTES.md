# Pau Vicente — A Story Worth Sharing

## What changed

The presentation now follows a speaker’s invitation journey: meet Pau, understand her experience, explore the program, see participant value, and discuss an event. The existing narrative and program lists were retained. The previous repeated chapter introductions and large photo galleries have been replaced with composed reading sections, smaller documentary evidence, and an explicit story index.

| Section | Composition |
|---|---|
| Cover | Beige ground, strong typographic message, integrated cutout portrait, and a compact speaking-area index |
| About | Editorial profile spread with portrait, readable personal introduction, and a small marginal statement |
| Corporate beginning | Career retrospective with primary event photo, reading column, and smaller supporting photographs |
| Freelancing leap | Turning-point feature with first-client meeting, personal early-work image, and the full narrative |
| Becoming a mentor | Statement-led introduction and connected meeting images at different sizes |
| Cross Core | Deeper taupe culmination with a team portrait, mission copy, and community evidence |
| Speaking topics | Featured Freelance 101 program followed by two complementary topic columns; all details remain visible |
| Speaking style | Muted charcoal-olive statement spread with a compact portrait and personal approach |
| Participant outcomes | Six numbered learning outcomes in two columns, becoming one column on mobile |
| Free coaching | Understated warm feature band explaining participant support |
| Audience and formats | Numbered audience index and a separate compact format list |
| Why Pau | Three grounded strengths beside a portrait: real experience, practical guidance, purposeful encouragement |
| Contact | Warm editorial closing invitation, portrait, public contacts, and prefilled email inquiry |

## Color and typography

- Ivory `#F7F3EC`, oat `#EEE8DE`, beige `#E4D8C8`, and deeper taupe `#D5C5B2` create section rhythm.
- Charcoal `#25241F`, dark taupe `#535248`, and a restrained caramel `#6F4C20` maintain text contrast.
- Instrument Serif and DM Sans remain locally hosted; no new visitor-facing dependencies were added.
- Main story paragraphs use 15px text with generous line spacing on desktop and small mobile screens. Documentary images retain their proportions.

## Reference review

Direct retrieval of the four Pinterest pages was unavailable during this redesign. All four saved reference images already present in the workspace were opened and inspected:

- `1125968743683255`: fine frame/rules, restrained navigation, and contrast between portrait and content sections.
- `709105903877094389`: expressive serif hierarchy, portrait integration, and small editorial labels. Its maroon palette, ornamental details, logos, awards, and example claims were not adopted.
- `213217363603727408`: asymmetric image/text balance and breathing room between editorial features.
- `1091982240928141616`: warm neutrals, image scale variation, and understated transitions.

The original source content and supplied photographs guided the actual copy and image assignments. The references provide design principles rather than another person’s identity or claims.

## Image accounting

| Assigned original | Page use |
|---|---|
| `01-24 CCA_2006.jpg` | Hero, using a new transparent derivative |
| `01-24 CCA_2050.jpg` | About |
| `50091154_2306624319349027_4347052703701008384_n.jpg` | Corporate primary |
| `79005072_2902199466458173_7132310373494947840_n.jpg` | Corporate supporting group |
| `490246748_10021347164543332_4215346027297310950_n.jpg` | Corporate personal image |
| `Meeting Paul and Brynne.jpg` | First client |
| `156246081_4111134105564697_8182093901843224702_n.jpg` | Freelance beginnings |
| `Meet with Kylee.jpg` | Mentoring conversation |
| `Meet with Taylin.jpeg` | Mentoring conversation |
| `01-24 CCA_2511.jpg` | Cross Core team |
| `IMG_9013.jpg` | Cross Core gathering |
| `IMG_0315.CR3` | Cross Core community, using the existing browser-compatible derivative |
| `01-24 CCA_2013.jpg` | Speaking style |
| `01-24 CCA_2078.jpg` | Why invite Pau |
| `01-24 CCA_2042.jpg` | Contact |

The new hero asset was created with the built-in image tool from the high-resolution assigned original. Its instruction was background extraction only, preserving identity, pose, clothing, tattoo, natural skin texture, and proportions. The output was inspected against the actual beige ground, stripped of bulky metadata, and converted to transparent WebP at 480, 800, and 1024px. The largest WebP is approximately 86KB, with smaller 26KB and 55KB variants. A transparent PNG fallback is approximately 1.7MB and is only selected where WebP is unsupported. No original photograph was overwritten. No new generated scenes, people, testimonials, or event photos were introduced.

Image-editing prompt used: “Remove only the golden yellow studio background from this exact original photograph of Pau Vicente. Produce the same portrait on genuine transparent alpha background. Keep the face, identity, pose, hairstyle, clothing, crossed arms, tattoo, proportions, shadows, natural skin texture, and skin color as photographed. Preserve the original 2:3 framing. No beautification, restyling, replacement backdrop, text, golden remnants, halo, or white outline.” Responsive conversion was performed with ImageMagick after background removal.

## Validation results

- Exact baseline narrative preservation: four chapters, the full introduction, and speaking-style copy passed.
- Exact list preservation: 19 topic subpoints, six outcomes, nine audiences, and seven formats passed.
- Photo mapping, responsive source paths, dimensions, 14 lazy images and one eager/high-priority hero passed.
- All section anchors and public email, phone, Facebook, LinkedIn, and Instagram destinations passed static checks.
- The email inquiry retains all seven organizer fields. No backend, fake success state, or booking service was added.
- Fourteen text/background pairs pass WCAG AA normal-text contrast.
- CSS parsing, JavaScript syntax, Git whitespace, visible content without animation, focus styles, and reduced-motion rules passed.
- Navigation DOM harness passed: open/close, Escape and focus return, links, outside clicks, focus exit, the 901px desktop reset, animation stop for reduced motion, and active section updates.
- The generated page is reproducible through `scripts/render.py`.

## Remaining verification

The supported browser-preview plugin was unavailable. No local server or alternate browser-control route was started. Actual desktop/mobile screenshots, overflow, visual crops on the complete page, keyboard behavior in a browser, and measured Core Web Vitals remain unverified. Responsive rules cover 320, 390, 768, 1024, and 1440px compositions, but implemented breakpoints are not a claim that those viewports were visually tested.

Before production, inspect the complete page at those widths and review Pau’s likeness in the processed hero. Public social destinations were checked for correct URLs; no inquiry was sent or email delivery claimed.

## Source and release

Changed source: `src/index.html`, `dist/assets/style.css`, `dist/assets/main.js`, `asset-map.json`, `scripts/render.py`, `README.md`.

Generated output: `dist/index.html`.

New assets: `dist/assets/photos/pau-hero-editorial-480.webp`, `pau-hero-editorial-800.webp`, `pau-hero-editorial-1024.webp`, and `pau-hero-editorial.png`.

New checks and notes: `scripts/validate.py`, `scripts/check-interactions.cjs`, `scripts/requirements-qa.txt`, and this document.

The Vercel `dist/` root and existing hosting metadata remain intact. This work is committed locally on `redesign/editorial-speaker`. It has not been pushed or deployed, following the latest supplied brief.
