# StrawCycle

**Straw, not smoke.** StrawCycle is a pretend business made for an English-class competition. After the rice harvest, many farmers in northern Thailand burn the leftover straw, and the smoke fills the sky every dry season. StrawCycle buys that straw before it is burned and presses it into food packaging for restaurants and cafés in Bangkok.

This website is a **demo**. Nothing you buy is real: no payment is taken, no order is sent anywhere, and the counters on the Home page are story figures, not data.

## The pages

| Page | What it shows |
| --- | --- |
| `index.html` Home | A scroll film made with Three.js: field, smoke, straw turning into packaging, a café table. Then two buttons: business packaging, or sponsor a field. |
| `business.html` Business | Five products sold by the carton, live prices, the partner window sticker, a free sample form and a quote form. |
| `sponsor.html` Sponsor | Sponsor 1 to 10 rai of field at ฿99 per rai, with a certificate preview, or buy a home pack of 50 meal boxes (฿249). |
| `impact.html` Impact | Why straw is burned, how the money reaches the farmer, two real projects doing this already, and where our numbers come from. |
| `help.html` Help | Delivery, shipping, samples, returns and common questions. |

Every page shares the bag (a side drawer) and a demo checkout. The bag is kept in the browser's local storage.

## How the business works

- **Bulk prices.** Packaging is sold by the carton. 1 to 4 cartons pay the list price, 5 to 19 get 10% off, 20 or more get 18% off. Over 100 cartons, the page suggests asking for a quote.
- **Your logo.** From 10 cartons a restaurant can have its logo printed on the packaging for ฿0.50 more per piece.
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

The tests cover the prices, bag, shipping and impact maths (`shop.js`), the film timeline (`timeline.js`) and the shared parts every page must have.

## Deploy on Vercel

1. Push the repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Framework preset: **Other**. Build command: **none** (leave it empty). Output directory: the **root** of the repo.
4. Deploy. The site is plain HTML, CSS and JavaScript, so Vercel just serves the files.

## Recording the film for the video

The Home film can be switched with a URL flag:

- `index.html?film=off` shows the four still images instead of the 3D film.
- `index.html?film=video` is for screen-capture tools. It turns off anti-aliasing, skips the speed check and stops the scroll loop, so the capture tool draws each frame itself by calling `window.scFilm.render(p, t)` (`p` is scroll progress from 0 to 1, `t` is time in seconds).

The film also turns itself off (and shows the stills) when the visitor prefers reduced motion, the device is too slow (checked at the start and again throughout the visit; it first drops to a lower resolution), WebGL is missing or the Three.js download fails.

## The still images (ChatGPT step)

The stills are SVG placeholders for now. To replace them:

1. Open `docs/image-prompts.md` and paste each scene's prompt into ChatGPT.
2. Save each scene twice: a 16:9 image as `images/scene-N.jpg` and a 9:16 image as `images/scene-N-tall.jpg` (N is 1 to 4). Keep each under about 300 KB.
3. That's it. The page uses the JPGs when they exist and falls back to `images/scene-N.svg` when they don't.

## Credits

- [Three.js](https://threejs.org) r170 (MIT licence), loaded from jsDelivr, draws the Home film.
- Fonts: Solway and Figtree from Google Fonts (SIL Open Font License).
- Facts and sources: IQAir, GIZ Thailand (Thai-German Cooperation) and the SEED profile of Fang Thai Factory. Each source is linked on `impact.html`.
- The still images are made with ChatGPT from the prompts in `docs/image-prompts.md`.
