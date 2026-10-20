# Pau portfolio assistant

The lower-right avatar opens a responsive, nonmodal chat panel. The avatar supports pointer dragging, Alt + arrow-key movement, viewport clamping, and a reset action. Escape closes the chat and returns focus. Chat history exists only in the current page's memory; clearing or reloading removes it. Only avatar coordinates are saved in local storage.

## Current and configured behavior

Without a server-side Gemini key, the interface visibly says **Portfolio guide**. It matches questions to reviewed portfolio facts in the browser and declines unrelated questions. This is an explicit deterministic fallback, not a simulated AI connection.

The Vercel function at `/api/pau` supports Gemini when `GEMINI_API_KEY` is configured as a Vercel environment variable and a new deployment picks it up. Never paste a key into chat, HTML, browser JavaScript, this repository, or a public asset. Optional `GEMINI_MODEL` defaults to `gemini-3.8-flash`, as listed in Google's documentation at implementation time. A valid API key, model access, quota, and a successful real request must still be verified by the owner.

Gemini reasons about audience fit and selects approved knowledge IDs and a suitable introduction. The server renders factual copy from the reviewed knowledge map rather than displaying arbitrary model prose. This prevents invented qualifications from reaching visitors. Source links let visitors review the relevant portfolio section. Unknown fees, credentials, schedules, and other unprovided details are referred to Pau. The assistant cannot send inquiries or confirm bookings.

Only the last six visitor questions accompany a current Gemini question; no client-supplied system or assistant messages are accepted. When AI is active, the interface explains that questions go to Google Gemini. The app does not intentionally persist or log chat transcripts. Hosting and provider processing policies still apply. Provider failures fall back to approved facts with a visible notice. Burst protection is per function instance; configure Vercel Firewall and provider spending limits for deployment-wide abuse control.

## Graphify: pending service identification

No Graphify connection is claimed. The Graphify product found during research describes a software/code knowledge-graph platform. The requested service URL, workspace or graph, authentication method, and supported query/export contract were not supplied. A working integration requires the exact intended Graphify service and an approved graph containing only Pau's public portfolio facts. Do not connect an unrestricted graph containing internal notes or credentials.

`dist/assets/pau-knowledge.json` contains reviewed public fact nodes and explicit relationships. This is the site's own knowledge-map format, not a claim of Graphify API compatibility. It can serve as a reviewed import source once the intended Graphify integration is identified. The status endpoint honestly returns `graphify: "not_connected"`.

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

The API suite uses a stub provider, not a real Gemini key. Browser screenshots remain unavailable in the current managed environment; DOM tests and CSS parsing do not replace visual mobile/tablet/desktop review.

## Avatar

Project asset: `dist/assets/pau-avatar.webp` (transparent, 192px, generated from Pau's actual hero portrait). The original documentary photographs are unchanged. The avatar is a stylized illustration, clearly used for the digital assistant.

Created using the built-in image-generation tool, with this prompt:

> Use case: stylized-concept. Create a polished 3D anime-style avatar for Pau Vicente's speaker portfolio chat assistant, based on the woman in the supplied portrait. Preserve recognizable facial proportions, warm medium Filipino skin tone, dark brown eyes, swept-back long dark hair, long delicate gold earrings, white cape blazer over a black top. Friendly confident gentle smile, adult professional woman. Head and upper torso centered, front-facing with slight natural three-quarter turn, generous clear padding around hair and shoulders, readable at 80 pixels. Soft warm studio light, refined smooth 3D materials with subtle anime eye styling, tasteful professional not childish. Transparent background with genuine alpha, no circle or backdrop, no text, no extra objects or symbols. This is an illustrated AI assistant avatar, not a replacement documentary photograph. Square composition.

Documentation checked: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Gemini Generate Content](https://ai.google.dev/api/generate-content), [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Graphify documentation](https://docs.graphify.com/).
