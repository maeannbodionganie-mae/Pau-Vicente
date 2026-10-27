# Pau portfolio assistant

The lower-right avatar opens a responsive, nonmodal chat panel. The avatar supports pointer dragging, Alt + arrow-key movement, viewport clamping, and a reset action. Escape closes the chat and returns focus. Chat history exists only in the current page's memory; clearing or reloading removes it. Only avatar coordinates are saved in local storage.

## Current and configured behavior

Without a server-side Gemini key, the interface visibly says **Portfolio guide**. It matches questions to reviewed portfolio facts in the browser and declines unrelated questions. This is an explicit deterministic fallback, not a simulated AI connection.

The Vercel function at `/api/pau` supports Gemini when `GEMINI_API_KEY` is configured as a Vercel environment variable and a new deployment picks it up. Never paste a key into chat, HTML, browser JavaScript, this repository, or a public asset. Optional `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`, a current Gemini model suited to the small routing task. A transient provider 500/502/503/504 response or network timeout triggers one retry after 600ms with the alternate Gemini Flash model. Each attempt has a nine-second timeout, keeping the total within the browser's request budget. Authentication and quota failures are not retried. Both models must be available to the key; a successful real request is required to verify operation. Responses include the actual model used; failures expose only an allowlisted diagnostic code, never upstream error contents, credentials or internal reasoning.

Gemini reasons about audience fit and selects approved knowledge IDs and a suitable introduction. The server renders factual copy from the reviewed knowledge map rather than displaying arbitrary model prose. This prevents invented qualifications from reaching visitors. Source links let visitors review the relevant portfolio section. Unknown fees, credentials, schedules, and other unprovided details are referred to Pau. The assistant cannot send inquiries or confirm bookings.

The last six visitor questions and bounded page context accompany a current Gemini question; no client-supplied system or assistant messages are accepted. When AI is active, the interface explains that questions go to Google Gemini. The app does not intentionally persist or log chat transcripts. Hosting and provider processing policies still apply. Provider failures fall back to approved facts with a visible notice. Burst protection is per function instance; configure Vercel Firewall and provider spending limits for deployment-wide abuse control.

## Questions outside the portfolio (web lookup)

With Gemini configured, a benign informational question that the Graphify knowledge cannot answer (for example general freelancing advice or a public fact) is routed as `web`. The server then makes a second Gemini call with Google Search grounding. The reply is labelled **From the web (not part of Pau’s portfolio)**, shown in English, and lists the source links (https only). Rules: no web text is shown unless search evidence backs it; personal details about Pau (fees, degrees, schedule, years, clients) are never taken from the web and stay “ask Pau”; code/homework tasks and prompt-injection attempts are still declined. Without a key, or if the lookup fails, the assistant uses approved facts only. The visitor’s question is sent to Google Gemini and Google Search; the privacy line in the panel says so.

## Reply language

Replies are English by default, even when the visitor writes in Tagalog, Taglish or another language; Gemini understands the question either way. If the visitor explicitly asks for another language (for example “please reply in Tagalog”), Gemini sets `replyLanguage` and the server translates the finished answer with a separate, instruction-locked call (no facts added or removed; names, emails, URLs and numbers unchanged). `replyLanguage` is validated as a short plain language name. If translation fails the reply stays English with a notice. The offline fallback is English only.

## Events and inquiries

The `event` and `registration` facts are generated from `src/content/events.json` by `scripts/render.py`, so the assistant always describes the same event as the page. The sample event is described as a sample, and the registration preview as reserving nothing. Questions about events, registering, or attending route to these facts. The assistant still cannot send inquiries or register anyone. It points visitors to the contact form or the event page. On small screens, the avatar hides while a visitor is filling in a page form so it never covers fields or buttons.

## Graphify knowledge graph

The official project is [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), distributed as `graphifyy`. The website uses a **Graphify-built export**, not a hosted Graphify Cloud connection. No Graphify account, OAuth token, or additional production service is needed for this deployment.

`scripts/build-pau-graph.py` validates the reviewed public facts and their explicit relationships, assembles them with Graphify `build_from_json`, and exports `dist/assets/pau-graph.json` with Graphify `to_json`. It does not scrape the repository, ingest private notes, or infer additional qualifications. Graphify is a development dependency; production remains a dependency-free Node function.

`pau-retrieval.js` ranks relevant graph nodes, traverses their explicit one-hop relationships, and sends that evidence to Gemini. Answers are rendered from the referenced approved facts, with source links. The exported graph records source provenance and a canonical SHA-256 of the knowledge document, so line-ending differences do not invalidate it. If the knowledge source changes without a graph rebuild, the endpoint reports `stale_export` and uses the approved snapshot instead of claiming the graph is current. `export_ready` means a valid bundled graph, not a live Cloud connection.

Rebuild after changing portfolio facts or events:

```bash
python -m pip install -r scripts/requirements-graph.txt
python scripts/render.py
python scripts/build-pau-graph.py
node scripts/check-pau-api.cjs
```

## Page-aware navigation

The assistant is available on the homepage, event pages, and the not-found page. A “Viewing” label follows the visible section. “Guide me here” explains that section; questions about the inquiry form get step-by-step instructions. The last focused field ID can request field-specific help. Only allowlisted page, section, and field identifiers accompany questions; no field values, arbitrary DOM content, screen images, URLs, or other browser tabs are read.

Navigation suggestions are explicit visitor-clicked links selected from a shared destination registry. Same-page links close the panel, scroll to and focus the destination, and briefly outline it. Cross-page links use the normal browser navigation. The assistant does not automatically redirect, fill fields, submit inquiries, or register a visitor. Registration guidance uses the event’s actual preview/live/closed state from the same generated source as the event page.

## Deployment and checks

The existing Vercel project uses `dist` as its root. `dist/api/pau.js` is a dependency-free Node function; its required public knowledge and engine modules live outside `api` to avoid extra function routes. `dist/vercel.json` sets a 30-second function limit; upstream requests time out sooner.

Run:

```bash
python3 scripts/render.py
python3 scripts/validate.py
node scripts/check-interactions.cjs
node scripts/check-pau-api.cjs
node scripts/check-pau-ui.cjs
```

The API suite stubs Gemini and exercises the real Graphify export, retrieval, context validation, and navigation contracts. Browser review also covers section detection, the contact destination link, step-by-step inquiry guidance, and event-page registration guidance. Live production verification must confirm the deployed knowledge version, `graphify: "export_ready"`, and an actual Gemini-mode answer; a GET showing configured mode alone does not prove a provider call succeeded.

## Avatar

Project asset: `dist/assets/pau-avatar.webp` (transparent, 192px, generated from Pau's actual hero portrait). The original documentary photographs are unchanged. The avatar is a stylized illustration, clearly used for the digital assistant.

Created using the built-in image-generation tool, with this prompt:

> Use case: stylized-concept. Create a polished 3D anime-style avatar for Pau Vicente's speaker portfolio chat assistant, based on the woman in the supplied portrait. Preserve recognizable facial proportions, warm medium Filipino skin tone, dark brown eyes, swept-back long dark hair, long delicate gold earrings, white cape blazer over a black top. Friendly confident gentle smile, adult professional woman. Head and upper torso centered, front-facing with slight natural three-quarter turn, generous clear padding around hair and shoulders, readable at 80 pixels. Soft warm studio light, refined smooth 3D materials with subtle anime eye styling, tasteful professional not childish. Transparent background with genuine alpha, no circle or backdrop, no text, no extra objects or symbols. This is an illustrated AI assistant avatar, not a replacement documentary photograph. Square composition.

Documentation checked: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Gemini Generate Content](https://ai.google.dev/api/generate-content), [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Graphify documentation](https://docs.graphify.com/).
