# Fazle Rabbi portfolio

A static portfolio using locally vendored GSAP 3.12.5 with ScrollTrigger and a small hand-written WebGL particle renderer (no other dependencies).

## Preview

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. No build step is required. Opening `dist/index.html` directly from disk also works: every script is a classic (non-module) script, so nothing is blocked on `file://`.

When changing `style.css` or `app.js`, bump the `?v=` number on their tags in `index.html` so browsers don't serve a stale cached copy.

Content and styles are in `dist/index.html`, `dist/style.css`, and `dist/app.js`. Images and JavaScript libraries are in `dist/assets`. Google Fonts (Inter Tight, Instrument Serif, JetBrains Mono) are optional remote resources, with local system font fallbacks.

## Design

Ink / cream / ember palette. Motion features:

- Intro loader (once per browser session) with a counter and curtain wipe. It can't get stuck: a 4.5 s script timeout and a 6 s pure-CSS fallback both clear it, and the hero intro has its own timeout
- WebGL particle sphere (custom shader) that reacts to the pointer and flows into a terrain as you scroll. Software renderers are skipped, a frame-time watchdog thins the particles (then gives up) on slow GPUs, and a CSS wireframe globe stands in whenever WebGL isn't used
- Character-split headline reveals and a rotating headline word
- Scroll-velocity-reactive marquee
- Word-by-word "ink-in" statement, number count-ups, curtain-revealed portrait
- Duotone headshot with a full-colour spotlight under the cursor (tap to toggle on touch)
- Pinned horizontal project gallery on wide screens (stacked list below 1000px) with pointer tilt
- Animated project art: data-flow lines, orbiting nodes, live telemetry trace
- Scroll-drawn career timeline, parallax lifestyle photo, magnetic buttons, custom cursor
- Copy-email toast, animated project dialog
- "Download CV" buttons (hero and contact section) serve `dist/assets/Md_Fazle_Rabbi_CV.pdf`; replace that file to update the CV

Accessibility: a "Pause motion" control stops every looping animation; `prefers-reduced-motion` skips the loader and scroll choreography; split text keeps an `aria-label` with the full sentence.

## Images

`dist/assets/headshot-color.jpg`, `headshot-duotone.jpg`, `avatar.jpg`, and `life-graded.jpg` are re-cropped and re-graded from the original photos (no generative edits).

Professional content was transcribed from the supplied CV. Project graphics are conceptual diagrams, not screenshots of the actual products.

## Hosting

### cPanel

`fazle-rabbi-portfolio.zip` contains the contents of `dist/` at the top level (no wrapping folder), with 644 file and 755 folder permissions.

1. In cPanel, open **File Manager** and go to `public_html` (or the domain's document root).
2. **Upload** the zip, then right-click it and choose **Extract**, keeping the same folder.
3. Delete the zip from the server. `index.html` should now sit directly inside `public_html`.

After changing the site, rebuild the zip from the contents of `dist/`, not from the `dist` folder itself.

### Other

A private Site was registered in `.openai/hosting.json`. Deployment is not complete. Reuse the registered project ID when publishing; do not create another Site.
