# Responsive motion review

These viewport captures are produced by `scripts/check-motion-browser.py` after fonts, visible images and reveal transitions have settled. The workflow saves them only after the browser checks pass.

The published photo files are unchanged. This change adjusts motion, layout and mobile navigation.

| Desktop | Capture |
| --- | --- |
| Cover | [1440px cover](motion-desktop-hero.jpg) |
| About | [About section](motion-desktop-about.jpg) |
| Storybook | [Story](motion-desktop-story.jpg) |
| Short desktop | [Short-screen story](motion-desktop-short-story.jpg) |
| Moments | [Moments transition](motion-desktop-moments.jpg) |
| Event | [Event section](motion-desktop-event.jpg) |

| Phone | Capture |
| --- | --- |
| Cover | [Phone cover](motion-mobile-hero.jpg) |
| Landscape | [Landscape layout](motion-mobile-landscape.jpg) |
| About | [Phone About section](motion-mobile-about.jpg) |
| Moments | [Phone Moments section](motion-mobile-moments.jpg) |

[Story without JavaScript](motion-static-story.jpg) checks the static fallback.

Browser checks include horizontal overflow, readable long chapters, viewport resizing, menu links after scrolling, anchor offsets, runtime reduced-motion changes and print layout. These are Chromium viewport checks; real-device frame rates are not measured.

This directory is outside the published `dist/` folder.
