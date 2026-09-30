# Tatyana Faradilla R. — personal portfolio

A small, hand-written static website. No build step, no frameworks, no backend.
Open `index.html` in a browser and it runs.

---

## Files

```
tatianafportofolio/
├── index.html              all the text and structure — edit this most
├── css/style.css           the aquarium look: colours and fonts at the top, then each section in page order
├── css/projects.css        project stages + the live project viewer
├── js/main.js              menu, scroll reveals, project filter, copy button, timeline
├── js/projects.js          the live project viewer
├── js/aquarium.js          the 3D aquarium, the octopus and the portrait frames (Three.js)
├── js/motion.js            text surfacing and cursor response on the page itself
├── js/vendor/three.min.js  Three.js r160, bundled so the site still works offline (MIT licence beside it)
├── assets/
│   ├── fonts/              Kindergarten (the page font) + the older fonts, kept but unused
│   ├── images/             photos, project screenshots, octopus.webp / octopus.png, octopus-mark.svg (site icon)
│   └── scenes/             the old Shanghai artwork, no longer used by the page
└── README.md
```

## How the code is written

- **No comments.** The code carries no comments at all; this README is the
  documentation. That includes the three project apps in `projects/`.
- **Every class ends in `_tatiana`**, in the HTML, the CSS and the JavaScript:
  `hero_tatiana`, `btn--solid_tatiana`, `is-open_tatiana` and so on. When you add
  a class, add the suffix in all three places, or the style or behaviour won't
  connect. IDs (`#nav`, `#contact`...) and `data-` attributes have no suffix.
- **The three project apps in `projects/` keep their own class names.** They are
  separate websites shown inside the viewer, not part of the portfolio's code;
  only their comments were removed.

## Running it on Windows

Double-clicking `index.html` works for everything except the "copy email" button,
which browsers only allow on a real address (`http://` or `https://`).

For editing, VS Code with the **Live Server** extension is easiest: right-click
`index.html` → *Open with Live Server*. The page reloads as you save.

---

## What to edit

Sections in `index.html` are in page order. Each one has an `id` you can search
for: `#top`, `#services`, `#skills`, `#projects`, `#experience`, `#education`,
`#about`, `#contact`.

| What you want to change | Where |
|---|---|
| Your introduction, role line, corner notes | `SECTION 1 — INTRODUCTION` |
| The five things you do | `SECTION 2 — WHAT I DO` |
| Skills (just `<li>` items, add or remove freely) | `SECTION 3 — HARD SKILLS` |
| Projects | `SECTION 4 — PROJECTS` |
| Experience (timeline) | `SECTION 5 — EXPERIENCE` |
| Education and languages | `SECTION 5b — EDUCATION & LANGUAGES` |
| How you work | `SECTION 6 — HOW I WORK` |
| Email, WhatsApp, iMessage | `SECTION 7 — CONTACT` |

### Projects (they open live)

Each project lives in its own folder and runs inside the page:

```
projects/
├── hotel-sriwidjaja/   index.html (guest site) + admin.html (admin panel)
├── egg-timer/          index.html
└── tourify/            index.html
```

These files are the original offline builds, unchanged. Clicking a card opens
the real project in a full-screen viewer (`js/projects.js`, `css/projects.css`)
that grows out of the card. "Back to portfolio" (or Esc while the bar has focus)
shrinks it back. Closing removes the project, so its sound and timers stop.

- Ctrl/Cmd-click or middle-click a card still opens the project in a new tab.
- Links like `index.html#project/tourify` open a project directly.
- Hotel Sriwidjaja has two tabs in the viewer. Both pages share browser storage,
  so a booking made on the guest site appears in the admin panel.

### Adding a project

1. Put the project in `projects/<name>/`. Its `index.html` must work on its own.
2. Copy one `<article class="work_tatiana">…</article>` block inside `<div class="works_tatiana">`.
3. Change `data-project` (short id), `data-category` (one or more of `web`, `app`,
   `uiux`, `interior`, `video`, separated by spaces), every `href` into `projects/`,
   the preview images, the texts and the facts (Purpose, Key features, Built with,
   My contribution). The element with `data-origin` is where the viewer grows from.
4. Links with `data-view` become the viewer's tabs; `data-label` is the tab name.
   One `data-view` link means no tabs.
5. `<template class="project__tips_tatiana">` is the "How to try it" list in the viewer.

Filter buttons with no matching project hide themselves and come back once you
add one.

Preview images are real screenshots of each project (`shot-*.jpg`), shown
inside CSS browser and phone frames. `hotel_sriwidjaja.png`,
`eggtimer_d.png` and `school_team_project.png` are no longer used and can be
deleted.

### Adding an experience entry

Copy one `<li class="tl_tatiana">…</li>` block inside `<ol class="timeline_tatiana">` (most recent
first) and fill in the dates, role, organization and description. The glowing
line and the dots light up on their own as you scroll.

### Contact

Each contact method is one `<li class="reach__item_tatiana">` with a link and a Copy
button (`data-copy` is what gets copied).

- WhatsApp: `https://wa.me/6287815055573`, the number in international format
  (country code, no `+`, no leading `0`).
- iMessage: an `sms:` link, which opens Messages on iPhone, iPad and Mac. On other
  devices the click copies the address instead and says why.

---

## Replacing the images

All placeholders live in `assets/images/`. Put your own file in the same folder
and point the `src` at it. Suggested sizes:

| Placeholder | Used for | Good size |
|---|---|---|
| `profilepicture.jpg` | hero photo, shown behind glass | portrait 4:5, face in the upper third |
| `placeholder-workspace.svg` | "How I work" photo | about 1600 × 1000 px |
| `placeholder-project-01…06.svg` | project thumbnails | about 1280 × 960 px (4:3) |

Example:

```html
<img src="assets/images/portrait.jpg" alt="Tatyana at her desk" width="900" height="1150">
```

Keep files under roughly 400 KB each so the page stays fast. Update the `alt` text
to describe the picture — it matters for screen readers and for search engines.

---

## Colours and fonts

The palette is soft, powdered pastel. The tokens are at the top of `css/style.css`:

```css
--cream:    #F4EFE8;   --beige:   #EADFD2;   --gray:  #DCDBE2;
--powder:   #D3E2EE;   --blue:    #B9CDE2;   --cyan:  #CFE7E8;
--lavender: #D2CBE6;   --dusty:   #8F84B4;   --dusty-deep: #5E5588;
--blush:    #EFC9D0;   --peach:   #F1D3C1;
--ink:      #3B3856;   /* main text, a dusty indigo instead of black */
```

The water, light and materials of the 3D scene are at the top of `js/aquarium.js`
(`C = { ... }`): powder-blue water near the surface that turns lavender and blush
towards the end, cream light from above, beige sand, lavender-grey rocks.
The scene uses its own gentle highlight curve instead of a filmic tone map, so these
colours appear on screen as chosen.

**Font: Kindergarten**, used for every piece of text on the page (headings, body,
navigation, buttons, labels, dates, email and phone numbers).

- `assets/fonts/kindergarten-original.ttf` is the file exactly as supplied.
- `assets/fonts/Kindergarten.woff2` / `.ttf` are the web copies the page loads. They are
  the same font with two characters added that the portfolio needs and the original
  does not have: the en dash in the experience dates (drawn from the font's own hyphen,
  widened) and the non-breaking space in "Tatyana F." (the font's own space). Nothing
  else is changed.
- The font has one weight and no italic, so the page never asks the browser to fake
  bold or italic (`font-synthesis: none`), and its own letter spacing is left as drawn.
  Hierarchy comes from size and colour.
- `font-display: block` means the browser waits for the font rather than flashing a
  different one first.
- If you add new text, stick to the characters the font has: A–Z, a–z, 0–9 and
  `! " # & ' ( ) + , - . / : ; = ? @` plus curly quotes. Anything else (%, _, [ ], {}, |, or
  accented letters) would have to come from another font.
- The three project apps inside the viewer are separate websites and keep their own fonts.

The old fonts (Instrument Serif, Karla, Noisy Walk, Lemon Milk, Pinyon Script) are still
in the folder but not used.

---

## The aquarium

The whole page sits inside one 3D tank, drawn by `js/aquarium.js` on a canvas behind
the text. Text is always on top of the canvas, so nothing in the water can cover it.

- **Scrolling is the camera.** The camera travels forward and slowly down through the
  tank as you scroll. Each section has a "mark" for the octopus and the camera in the
  `DEFS` list in `js/aquarium.js`: `ox`/`oy` are where the octopus sits on screen
  (-1 left or bottom, 1 right or top), `od` how far away it is, `oyaw`/`opitch` where it
  faces. The `m` values are the phone versions. Change a number, save, reload.
- **The octopus** is built from simple shapes to match the supplied character (glossy
  red head with blush, eyes with two highlights each, a pink ring mouth and eight
  round-tipped tentacles). It drifts, blinks, follows the cursor with its eyes and body,
  turns towards whatever you hover, and its tentacles trail when it moves.
- **Everything runs on springs.** Every moving value (camera, octopus, frames, project
  previews, headings, particles, plants) is pulled towards where it wants to be by a
  small spring with its own weight and damping, so it speeds up, glides and settles
  instead of jumping. The springs are the `Spr(speed, damping)` values in
  `js/aquarium.js`: a lower first number is heavier and slower, a lower second number
  wobbles longer before settling.
- **The octopus moves in layers.** The body turns towards the cursor first, the head
  follows, the tentacles swing after it and their tips keep wobbling for a moment;
  the pupils and mouth have their own small overshoot. When the cursor stops or leaves
  the window it drifts back to its idle floating over a few seconds.
- **The two portraits are real 3D frames** drawn in the water: a moulded frame with
  thickness, a thin brass lip, a mat, the photo, a glass pane with a moving reflection
  and a soft shadow behind that shifts with the frame's tilt. They float and turn on
  their own, lean slightly towards the cursor and trail behind when you scroll. The
  `<img>` stays in the page for screen readers and for devices without WebGL, where the
  plain photo is shown instead.
- **Text surfaces instead of fading in.** `js/motion.js` ties every block to the scroll:
  as it comes up the screen it rises out of the depth, tilts upright and clears out of
  the haze, and it sinks back slightly as it leaves. It is scrubbed by the scroll, so
  scrolling back reverses it. Titles, job roles, contact details and buttons lean
  towards the cursor with a small 3D tilt; their descriptions follow a moment later and
  the button's coral bubble lags furthest behind.
- **The octopus watches you.** Its eyes follow the cursor first, each eye aiming from
  its own position so they converge naturally; the head turns after them and the body
  last, and as the head catches up the eyes relax back towards the middle. The pupils
  roll over the curved surface of the eye and can never leave it; the white highlights
  stay put like reflections on a wet eye. When you arrive after a while away it notices
  you (eyes open a touch, head lifts, then a blink). When the cursor rests it keeps
  watching, with the odd glance away. When the cursor leaves, it looks at where it last
  saw you for a moment and then slowly returns to its own idle looking: back at the
  viewer, around the tank, sometimes at a heading, with tiny eye movements, a curious
  head tilt now and then, and natural blinks (occasionally a double blink). Hovering it
  makes it soften its eyes and blush slightly; clicking near it startles it a little.
  All of this is in the `mode`, `look` and `xp` parts of `js/aquarium.js`.
- **You can touch the scene.** Sweep the cursor past the octopus and the water drags it
  along; click it and it flinches back, squashes, curls its tentacles, blinks and lets
  out a stream of bubbles (it also breathes a few out on its own now and then). Click a
  portrait frame and it rocks on its springs until it settles.
- **Transitions between sections**, in order: the camera pushes deeper into What I do;
  bubbles rise past the lens into Skills; a light beam sweeps into Projects; the water
  ripples as each project arrives; kelp crosses the lens into Experience; the camera
  sinks to the floor for Education; the octopus swims straight across the screen in the
  empty space before Contact; the tank goes quiet and dark at the very end.
- **Hover** anything important and the octopus looks at it, the water ripples and
  the particles part. Project previews tilt towards the cursor.
- **Motion is springs, not easing.** Everything that moves (the scroll camera, the
  octopus, the frames, the project previews, the big headings) runs through small
  spring simulations (`Spr` in `js/aquarium.js`): `w` is how quickly it responds,
  `z` how much it is damped (1 = settles without overshoot, lower = sways past and
  settles). The scroll itself is a spring with a speed limit, so jumping from the menu
  becomes a glide.
- **The octopus is layered:** the whole body drifts slowly, the head turns towards the
  cursor first, the ring of tentacles follows a moment later and swings past, each
  tentacle has its own spring, the tips whip after that, and the pupils and mouth
  jiggle last. When the cursor stops or leaves, it eases back into its own idle drift.
- **The camera** pans, dips and zooms a little differently for each section
  (`camX`, `camYaw`, `camY`, `camPitch`, `fov` in `DEFS`) and floats very slightly even
  when you do nothing. Tall kelp beside the path passes close to the lens, and the
  plants lean in the current the camera makes as it moves.
- **Portrait frames:** the two photos are drawn as real frames in the water (moulding,
  brass lip, mat, recessed photo, glass, and a soft shadow suspended behind), each
  drifting on its own and tilting towards the cursor before settling. The `<img>` in
  `index.html` still decides where each frame sits and what it shows, and it is what
  appears if WebGL is unavailable. Swap the photo file and the frame updates.
- **Loading:** darkness, then water, particles, light, the octopus's silhouette, its
  colours, and finally the text. About two seconds.
- **Performance:** fewer particles and plants and no multisampling on phones; if a
  device struggles, the scene lowers its resolution by itself. Add `?quality=low` to the
  address to force the lightest version. Rendering stops while a project is open or the
  tab is hidden.
- **Reduce motion:** with the system setting on, the camera still follows the scroll but
  the transitions, the octopus's swim-past and the drifting are switched off.
- **No WebGL:** the page falls back to a still water gradient with the octopus image.

---

## Putting it online

**GitHub Pages** — create a repository, upload this whole folder, then
Settings → Pages → Branch: `main`, Folder: `/root`. Your site appears at
`https://your-username.github.io/repository-name/`.

**Netlify** — go to app.netlify.com, drag the folder onto the page. Done.

Before publishing, update the `og:` tags in `<head>` so link previews show your
own photo and description.

---

## Notes

- Experience, education and languages come from the resume, word for word.
- **Check before publishing:** the "My contribution" lines for Egg Timer and
  Tourify are not in the resume or the project files. (They used to carry a
  `CONFIRM` comment in `index.html`; that went with all the other comments.)
- The site is responsive down to small phones, keyboard-navigable, and respects
  the system "reduce motion" setting.
- No analytics, no cookies, no trackers.

---


