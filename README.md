# StrawCycle

**Straw, not smoke.** StrawCycle is a pretend business made for an English-class competition. After the rice harvest, many farmers in northern Thailand burn the leftover straw, and the smoke fills the sky every dry season. StrawCycle buys that straw before it is burned and presses it into food packaging for restaurants and cafés in Bangkok.

This website is a **demo**. Nothing you buy is real: no payment is taken, no order is sent anywhere, and the counters on the Home page are story figures, not data.

## The pages

| Page | What it shows |
| --- | --- |
| `index.html` Home | A scroll film made with Three.js: field, smoke, straw turning into packaging, a café table. Then two buttons: business packaging, or sponsor a field. |
| `business.html` Business | Seven products sold by the carton, live prices, the partner window sticker, a free sample form and a quote form. |
| `sponsor.html` Sponsor | Sponsor 1 to 10 rai of field at ฿99 per rai, with a certificate preview, or buy a home pack of 50 meal boxes (฿249). |
| `impact.html` Impact | Why straw is burned, how the money reaches the farmer, two real projects doing this already, and where our numbers come from. |
| `help.html` Help | Delivery, shipping, samples, returns and common questions. |

Every page shares the bag (a side drawer) and a demo checkout. The bag is kept in the browser's local storage.

## How the business works

- **Bulk prices.** Packaging is sold by the carton. 1 to 4 cartons pay the list price, 5 to 19 get 10% off, 20 or more get 18% off. Over 100 cartons, the page suggests asking for a quote.
- **Your logo.** From 10 cartons a restaurant can have its logo printed on meal boxes, bowls, hot cups and carry bags for ฿0.50 more per piece (not on cutlery, chopsticks or drinking straws). Chopsticks are priced per pair.
- **Shipping.** Free when the packaging comes to more than ฿3,000, otherwise a flat ฿150. Cartons arrive in 2 to 4 working days. Sponsorships are digital, so they have no shipping.
- **Sponsorship.** ฿99 pays a farmer for the straw of one rai (1,600 m²) instead of burning it. After checkout you get a certificate you can print.
- **Impact maths.** We use 650 kg of straw per rai and about 20 g of straw per 750 ml meal box (other product weights are estimates too). An order shows the kilograms of straw it kept out of the fire. **650 kg per rai is our planning estimate, not a measured or sourced figure**; real yields vary with the rice and the season.

## Run it

You need [Node.js](https://nodejs.org) (for the tests) and any static file server. There is nothing to install.

```sh
python -m http.server 5173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:5173>. (Opening the files straight from disk does not work, because the scripts are ES modules.)

## Test

```sh
node --test
```

The tests cover the prices, bag, shipping and impact maths (`shop.js`), the film timeline (`timeline.js`), the film tiers and flags (`tiers.js`), the model budget and node names (`tests/models.test.mjs`), the business product cards against the price list, the shared parts every page must have, and a lint check that no code hides after a trailing `//` comment in the film scripts (`tests/lint.test.mjs`).

## Deploy on Vercel

1. Push the repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Framework preset: **Other**. Build command: **none** (leave it empty). Output directory: the **root** of the repo.
4. Deploy. The site is plain HTML, CSS and JavaScript, so Vercel just serves the files.

## Recording the film for the video

The Home film picks one of three detail tiers:

- **Low** has no post-processing and fewer particles. Phones, touch devices, narrow screens, devices with 4 GB of memory or less, and integrated GPUs (Intel HD/UHD/Iris, Radeon Vega and `M`-series, Mali, Adreno, PowerVR) start here.
- **High** is the default on a desktop with a discrete GPU: post-processing, multisample anti-aliasing, a pixel ratio of at most 1.5 and about ten times Low's particles.
- **Ultra** is for recording. It is used only by `?film=video`: FXAA anti-aliasing (no multisampling, so repeated frames match exactly), about thirty times Low's particles, and the resolution of the capture window.

If frames run slow, the live film steps down one level at a time (High, then High at pixel ratio 1, then Low, then the stills).

The film is switched with URL flags:

- `index.html?film=off` shows the four still images instead of the 3D film.
- `index.html?film=video&p=0.37&t=2` is for screen-capture tools. It uses Ultra, skips the speed check, stops the scroll loop and waits until the models and post-processing have loaded. The capture tool then draws each frame itself by calling `window.scFilm.render(p, t)` (`p` is scroll progress from 0 to 1, `t` is time in seconds). `p` and `t` in the URL set the first frame. Add `&tier=low` to capture the Low tier; it gives the phone look (half the particles) only when the capture window is under 768 px wide.
- `index.html?film=bench` plays the film from start to end in 20 seconds with no frame skipping and no step-downs, to measure frame times.

The film also turns itself off (and shows the stills) when the visitor prefers reduced motion, the device is too slow (checked at the start and again throughout the visit), WebGL is missing, the Three.js download fails, the film has not started within 4 seconds, or the browser loses the WebGL context. Once it has fallen back to the stills it does not download the models. With JavaScript off, the page shows the same JPG stills.

## The 3D models

The hut, the farmer, the packaging (box, bowl, cup, fork, spoon, chopsticks, drinking straw) and the café (table, chairs, candle, bulbs) are Blender models in `models/*.glb`, loaded by the film. They are built by Python scripts in `blender/` run in Blender without its window, and the `.glb` files are committed, so you only need Blender to change a model. `docs/blender.md` has the setup and the rebuild commands.

`tests/models.test.mjs` keeps the models inside their budget (1.5 MB and 200,000 triangles in total) and checks the node names the film looks up. A model that fails to load (or is missing a node the film needs) is left out on its own and the film still plays.

## The still images

The stills are renders of the Ultra film at four points (`p` 0.12, 0.37, 0.72 and 1.0): a 16:9 image as `images/scene-N.jpg` and a 9:16 image as `images/scene-N-tall.jpg` (N is 1 to 4), each under about 350 KB. To replace them, capture `?film=video&p=...` at 1920×1080 and 1080×1920 and save the JPGs under those names. The page falls back to `images/scene-N.svg` if a JPG is missing.

## Credits

- [Three.js](https://threejs.org) r170 (MIT licence), loaded from jsDelivr, draws the Home film.
- Fonts: Solway and Figtree from Google Fonts (SIL Open Font License).
- Facts and sources: IQAir, GIZ Thailand (Thai-German Cooperation) and the SEED profile of Fang Thai Factory. Each source is linked on `impact.html`.
- The 3D models (hut, farmer, packaging, café) are our own work, built from the scripts in `blender/`, and so are the still images, rendered from the film.
