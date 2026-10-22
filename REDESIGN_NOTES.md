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

- Updated October 20 to match the owner's supplied screenshot: main/hero espresso `#2B201A`, deeper brown `#241B16`, and secondary brown surfaces `#33261F` and `#3C2C23`.
- Main ivory text `#E8DFD0`, secondary text `#C7BCAA`, accent `#DDC3A1`, and cream buttons `#EADECE` keep the screenshot's warm dark appearance. The reference background, heading and button colors were sampled directly from the supplied image; no beige page background remains. The floating Pau chat uses the same shared tokens.
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
- The current palette's text/background pairs pass WCAG AA normal-text contrast.
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

The Vercel `dist/` root and existing hosting metadata remain intact. The editorial redesign was subsequently pushed to public `main` and deployed through the existing GitHub/Vercel integration at `https://pau-vicente-speaker.vercel.app/`. The later Pau assistant addition is documented separately in `PAU_ASSISTANT.md`.

## October 22 update: events, inquiries and refinements

- **Events.** Added the *Upcoming sessions* section, a clearly labelled sample event (*Freelance 101: Start Your Freelancing Journey with Confidence*), and its own page at `/events/freelance-101/`. All unconfirmed details read "To be announced". The page has a local-only registration preview that reserves nothing and sends nothing. Everything comes from `src/content/events.json`.
- **Inquiries.** The contact section now has a full inquiry form: visible labels, an error summary, recoverable failure states, duplicate-safe retries, and a reference ID. The form feeds a private Google Sheet and an email notification through Apps Script (`INQUIRY_SETUP.md`). The prefilled email link remains as a fallback. Each topic has an *Invite Pau for this topic* link that preselects the topic.
- **Navigation.** Added Events to the header and footer. The hero's second action is now *Explore Events*. Speaking areas stay one step below in the hero index. The footer now carries navigation and verified contacts.
- **Readability.** Body copy moved to 15–16px across sections; captions, notes and labels went up 1–2px.
- **Fixes.** Restored the missing spaces in mobile margin notes ("Before the leap, there was a question: …"). The assistant avatar now hides while a page form has focus on small screens.
- **Copy.** The four chapters and other approved copy are unchanged. Rewrites were held back so that no new claims appear in Pau's voice without her approval.
- **Verification.** Viewports at 360, 390, 768, 1024 and 1440px were checked in headless Chromium (`scripts/check-browser.py`). The Pinterest references could not be fetched (robots-blocked); the principles recorded above were reused.

## October 22 rebuild: high-end editorial system from the owner's pegs

The owner supplied three reference layouts: a framed espresso cover with a centred portrait, an editorial coaching site on cream, and a "Coach & Co." layout with alternating image/text rows. The homepage was rebuilt on that direction. Approved copy is unchanged.

- **Palette.** Espresso `#2B201A` and deep espresso `#231A15` alternate with cream `#F3EDE4`, sand `#E8DECE` and a card white `#FBF8F3`. Caramel `#B08A5F` is the decorative accent. Each section declares a tone (`.tone-dark`, `.tone-light`, `.tone-sand`) that sets its own text, muted, rule, button and field colours, so every component works on either ground. All text pairs meet WCAG AA, and form field borders meet 3:1.
- **Type.** Cormorant Garamond (self-hosted, OFL) is used in uppercase with open tracking for display, with italic accents in caramel. DM Sans is the text face. Body copy is 16–19px.
- **Composition.**
  - A framed espresso cover with the centred cutout portrait, a warm under-glow, and vertical corner marks.
  - An About section in an editorial narrative layout, with an offset-frame portrait and a Learn · Grow · Share line.
  - **Story time:** four chapters alternate sides, and each photograph stays pinned beside its chapter while it is read. A progress indicator follows along. The page reads fully without JavaScript.
  - Speaking style beside a quiet 3D sculpture.
  - Topics in a three-column grid with line icons.
  - Outcomes with a participant-support panel.
  - The event as an image-and-details card.
  - Audiences and formats.
  - *Why Pau* as a centred statement in her own words, with three strengths.
  - The inquiry form in a card beside direct contacts, then a centred footer.
- **Photography.** Nine photographs are used: the cover, the About portrait, one per story chapter, the event, the Why avatar and Contact. The other six stay in `asset-map.json` but are no longer shown, so the story does not turn into a gallery. Landscape documentary photographs keep their natural proportions, so no one is cropped out.
- **3D.** `assets/sculpture.js` is a dependency-free WebGL ray-marched satin ribbon in cream and caramel, about 6KB. It initialises only near the viewport, pauses off-screen and in hidden tabs, renders one still frame for reduced motion, and falls back to a CSS form without WebGL.
- **Navigation.** The header is transparent on the cover and turns solid on scroll. On mobile, a full-screen serif menu.
- **Assistant.** The launcher is a small "Ask Pau" pill. It hides while the menu is open and while a form is in use on small screens.

### Motion and 3D layer (October 22, second pass)

Benchmarks reviewed: speaker-site roundups from Nano Globals and Talks.co, and Webflow's luxury-site review. Patterns adopted honestly: a specific credential at the top, each topic with audience and outcome, a persistent booking action, and a restrained reveal-led opening. Testimonials, logos and statistics were not added because none have been supplied.

- **Signature ribbon.**
  - The satin ribbon is the site's 3D motif. A thin caramel orbit frames the cover portrait (`data-sculpture="halo"`).
  - The full satin form sits beside the speaking style.
  - Both use one dependency-free shader in `assets/sculpture.js`.
- **Opening.**
  - Headline lines rise from a mask. The role line, subtitle and actions fade up, and the portrait surfaces.
  - The proof strip ("From corporate marketing to freelancing · Mentor to aspiring freelancers · Leads Cross Core") settles last. It uses verified facts only.
- **Photographs** open like a curtain and settle from a slight zoom.
  - Story photos turn a few degrees toward the reader as they scroll and recede slightly at the edges of the viewport.
  - The corporate chapter layers a personal portrait over the event photo with gentle parallax.
  - Framed portraits tilt slightly under a mouse or trackpad.
- **Moments ring.** The five supporting documentary photographs sit on a slowly turning 3D ring. It can be dragged, stepped with buttons or the arrow keys, and pauses on hover. Without JavaScript it is a horizontal row. All 15 supplied photographs are now on the page again.
- **Kinetic band.** A slow italic ticker of topics and formats sits between the cream sections. It pauses on hover and stays still for reduced motion.
- **Texture.** A faint paper grain on espresso grounds keeps large dark areas from looking flat.
- **Accessibility.** All motion is off for `prefers-reduced-motion`, and the sculptures then draw one still frame. Content never depends on motion to be visible.

## October 22, third pass: owner feedback on circles, yellow backgrounds, spacing and the assistant

- **Circle and "pearl" removed.** The WebGL ring and satin sculpture are gone, and so is `sculpture.js`.
- **New signature, the stage.** Pau steps out of a framed panel. The panel, an offset outline and the cutout sit at different depths and shift with the pointer and with scroll. The same motif repeats on the cover, About, Speaking style, the event and Contact.
- **Story time is a storybook.** On desktop each chapter is a full-screen page. As the next page arrives, the previous one tilts back, shrinks slightly and dims. The page stays readable without motion, and stacks normally on phones.
- **Yellow backgrounds removed.**
  - New cutouts were made for four studio portraits and the Cross Core team portrait: an IS-Net matte, yellow spill on edges and hair regraded to the site caramel, then light matte tightening.
  - They are stored as `*-cut` entries in `asset-map.json` with transparent WebP (480/800/full) and PNG fallbacks. The originals are untouched.
  - The cutouts were checked on both cream and espresso.
- **One screen per section on desktop.** Main sections fill exactly one viewport (`.panel`), with gentle scroll snapping (proximity, never forced). Phones flow naturally.
- **Photographs placed with intent.** Each chapter has one main photograph plus at most one layered inset. The corporate, client-call and mentoring insets come from the supplied set. The three community photos are fanned like prints on a table in *Moments*. All supplied photographs remain on the site.
- **Assistant.** The assistant was restyled to the design system: espresso header, cream body, card-white messages, square controls, small-caps chips, an espresso send button and a caramel scrollbar. The launcher is a square espresso button with a caramel diamond.

## October 22, fourth pass: standing portraits, cut quality, Moments in 3D

- **Cut quality.** All cutouts were re-made with IS-Net plus closed-form alpha matting. This gives soft, natural hair edges, and the background colour is removed from semi-transparent edge pixels. Remaining yellow rim light is graded to caramel. The two standing portraits were cut from the full-resolution originals (1600×2400) so they stay sharp when shown large. The hero now uses the same pipeline (`pau-hero-cut`).
- **Standing portraits, editorial placement.** Following common speaker and coach cover layouts, standing figures are no longer small full-length shapes on a panel. They are cropped from head to mid-thigh and stand on the bottom edge of their section (`.anchored`), filling nearly the full screen height beside the text. This applies to the cover, About, Speaking style and the event. On phones the portrait follows the text and also stands on the section edge.
- **Moments as a walk-through.** On desktop the section pins for a few screens and the camera moves forward through a 3D space. Prints of the corporate team, a Cross Core gathering and the Cross Core community drift past between large outlined words ("Teamwork", "Community"). On phones and with reduced motion it is a simple horizontal row of prints.
