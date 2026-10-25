# The Reader's Viewpoint

A cinematic "about me" site for Numpu, themed after *Omniscient Reader's Viewpoint*.
The visitor is the reader; each section is a chapter, and the site talks back through system windows.

## Run locally

Any static file server works, for example:

```bash
npx http-server . -p 5173 -c-1
```

Then open http://localhost:5173.

## How it is built

- Plain HTML, CSS and JavaScript, no build step
- [GSAP](https://gsap.com/) + ScrollTrigger for the timeline and scroll scenes, [Lenis](https://lenis.darkroom.engineering/) for smooth scrolling
- Sound effects are synthesized with the Web Audio API (`js/sound.js`); the soundtrack is routed through a lowpass filter for muffled moments
- Images in `assets/img/hd` are 4x AI upscales (Real-ESRGAN anime model) served as 1920px and 3840px WebP; `js/main.js` swaps them in once the small originals have painted

## Credits

Illustrations belong to their original artists, from *Omniscient Reader's Viewpoint*.
Soundtrack: "Young and Beautiful" by Lana Del Rey.
