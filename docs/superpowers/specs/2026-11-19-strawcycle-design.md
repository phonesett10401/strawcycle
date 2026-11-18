# StrawCycle: design

Date: 2026-11-19. Status: draft for approval.

## Intent and the why

An English-class business website that the professor may pick for a class vote, later a portfolio piece on GitHub and Vercel. It replaces the Still Gallery art shop as the competition entry (Still Gallery stays as it is, in its own repo).

How it will be judged:

- A **video of the site** is shown on the classroom projector. It must feel cinematic.
- Classmates then **open the site on their own phones** and vote. Friend votes exist, so the site has to win people over in the first ten seconds, and work smoothly on ordinary phones (including older iPhones), not just new ones.

The idea must be **realistic**: a business that could launch now and does not yet exist in this form.

**StrawCycle** pays rice farmers in northern Thailand for the straw they would otherwise burn after harvest (a major cause of the region's smoke season), and turns it into food packaging. Pilots already prove the supply side (Urmatt with GIZ in Chiang Rai; Fang Thai Factory in Lampang make straw paper and packaging), but there is no brand that restaurants or ordinary people can order from. That gap is the business, and the pilots make the pitch believable.

## Who it is for

1. **Restaurants, cafés and businesses: the main customer.** They buy straw packaging by the carton. The site leans toward them.
2. **Ordinary people: equal weight, second in line.** They sponsor a field (pay to keep one rai from being burned) and can buy a small home pack.

## Goals

- A first screen and scroll that make people say "whoa" on a projector and on a phone.
- The business is obvious within one scroll: problem (smoke), fix (buy the straw), product (packaging), proof (pilots, counters).
- Two working demo flows with prices in Thai baht: a business order (with bulk pricing) and a field sponsorship.
- Runs smoothly on ordinary phones; still works, with still images, when 3D can't run.

## Non-goals

- No real payments, accounts, backend, database or email. Every order and form is a demo and says so.
- No CMS, no build step, no framework.
- The video itself is a separate project after the site (see "Video, later"). This doc only sets the one requirement the site must meet for it.
- No Thai-language version (English class). Thai place names and baht are fine.

## Anti-goals (would make it a failure even if it works)

- Looks like a generic AI-made landing page (purple gradients, glass cards, emoji icons, stock "eco" leaves).
- 3D that stutters or heats phones, or a blank screen while it loads.
- Greenwashing tone: vague "save the planet" claims with no numbers or sources.
- A pretty film with the shop hidden behind it: a business visitor must reach "Packaging for your restaurant" in one tap from the first screen.

## Constraints

- Plain HTML, CSS and JavaScript (ES modules), no build step, no dependencies to install. Tests with `node --test` (Node 24), same as Still Gallery.
- **3D: Three.js, rendered with WebGL**, loaded from a pinned CDN version through an import map (cdn.jsdelivr.net). WebGL rather than WebGPU so every phone runs it.
- Static hosting on Vercel; must also run from `python -m http.server`.
- Light and dark mode, phone width with no horizontal scroll, `prefers-reduced-motion` respected (global CLAUDE.md).
- Site design follows the `hallmark` skill (new site), checked with `ui-ux-pro-max` and the audit skills.

## Approaches considered

- **A. Scroll film on Home, normal pages behind it (chosen).** Home is one continuous 3D journey driven by scroll; the other pages are plain, fast HTML. All the wow sits where the video and the first phone visit land; buying and reading stay simple and robust.
- B. A small 3D header on every page. Easier, but reads as a normal site with decoration and loses the film the video needs.
- C. Everything in 3D (products in the scene, checkout over it). Most striking, but riskiest on older phones, hardest to use and to finish.

The user picked A.

## The site

New project folder `C:\strawcycle` (its own git repo), created after this doc is approved. This doc moves into it.

### Pages

| Page | Purpose |
|---|---|
| `index.html` Home | The scroll film, then the two doors. |
| `business.html` For businesses | The main shop for restaurants and cafés. |
| `sponsor.html` Sponsor a field | For people: sponsor a rai, get a certificate; small home pack. |
| `impact.html` Impact | The smoke problem, how StrawCycle works, the real pilots, the numbers and sources. |
| `help.html` Help | Delivery, samples, returns, FAQ. |

Every page has the header (wordmark, nav, bag button), the shared bag drawer and checkout (carried over from Still Gallery's `app.js` pattern), and a footer that says it is a class-project demo.

### Home: the scroll film

A full-screen `<canvas>` fixed behind the page. Scroll progress `p` from 0 to 1 drives the camera and every effect. Short text captions scroll over it, one per scene. Four scenes, one unbroken camera move, sunset to evening:

1. **The field (p 0–0.25).** Golden rice stubble at sunset, warm dust in the air, a farmer's hut. Caption: every year, northern farmers burn millions of rai of straw after harvest.
2. **The smoke, reversed (0.25–0.5).** Fires flicker, smoke rises and grey haze fills the sky; then it runs backwards, embers sink, the sky clears. Caption: what if the straw was worth more than the fire?
3. **Straw into packaging (0.5–0.75).** Loose straw fibres lift, swirl into a stream and fold into a meal box, a bowl and a cup. Caption: we buy it from the farmer and press it into packaging.
4. **The café (0.75–1).** The boxes fly toward the city lights and land on a Bangkok café table. Caption plus live counters (rai saved, farmers paid, boxes made).

At the end, two doors over the café: **"Packaging for your restaurant"** (primary) and **"Sponsor a field, ฿99"** (secondary). Both buttons are also in the header from the first screen, and a "Skip the film" link jumps to them.

Look: particles and glow carry it (straw fibres, embers, smoke, dust, city lights), with simple low-poly shapes for land, hut, boxes and table. Warm palette of straw gold, ember orange and smoke grey, turning to dusk blue.

**Requirement for the video:** the scene is drawn by `render(p, t)`, where `p` is scroll progress and `t` is time in seconds, both passed in. Time keeps fire, dust and embers moving while nobody scrolls (a frozen scene looks dead on a phone at rest). Nothing else may change the picture: no hidden timers, and random values come from a fixed seed. The page passes the real clock; the video tools pass their own `p` and `t` per frame, so any frame renders exactly. The counters follow the same rule.

**Fallback.** If WebGL is missing, the device is too slow (detected from a quick frame-time check), the CDN fails, or the visitor prefers reduced motion, the canvas is replaced by **four still images, one per scene**, with the same captions and doors. The stills are the images the user makes with ChatGPT (the same ones become transitions in the video). Until those exist, placeholders.

**Phone performance.** The renderer caps pixel ratio (about 1.5 on phones), scales particle counts by device, pauses when the tab is hidden, and never blocks the captions or buttons from showing. The page is readable before the 3D has loaded.

### For businesses: the main shop

Products, sold by the carton (prices are demo figures, in the range of real bagasse packaging in Thailand):

| Product | Per carton | Price per piece |
|---|---|---|
| Meal box, 750 ml | 300 | ฿3.20 |
| Bowl, 500 ml | 500 | ฿2.40 |
| Hot cup, 12 oz, with lid | 1,000 | ฿1.90 |
| Carry bag | 500 | ฿2.80 |
| Cutlery set (fork, spoon, knife) | 1,000 | ฿1.20 |

- **Bulk pricing:** 1–4 cartons at list price, 5–19 cartons 10% off, 20+ cartons 18% off, applied per product line. The price per piece and the saving update live as the quantity changes.
- **Your logo on it:** optional, +฿0.50 per piece, minimum 10 cartons of that product. The bulk discount applies to the list price only; the logo charge is flat. The logo itself is not uploaded (demo), just a checkbox.
- **Free sample box:** a short form (business name, type, district, contact) that ends in a confirmation.
- **Get a quote:** for custom sizes or big orders. When any product line goes over 100 cartons, a note suggests a quote; it does not block the order.
- **Partner badge:** a block explaining that every business gets a "StrawCycle Partner" window sticker and a counter ("your shop has saved 12 rai from burning"), shown as a mock sticker with a live example.
- Add to bag → bag drawer → checkout (business name, contact, delivery address) → confirmation with order number `SC-YYMMDD-NNNN`, delivery window, and **"this order saved X rai from burning"**.

Shipping: free when the physical items in the bag (products and home packs) total over ฿3,000, otherwise ฿150. Delivery inside Thailand in 2 to 4 working days.

### One checkout for both kinds of buyer

- Sponsorships are digital: they never cost shipping and don't count toward the free-shipping threshold. A bag with only sponsorships has no shipping line.
- Checkout always asks for a name and email. Business name is optional. A delivery address is asked for only when the bag holds something physical.
- The confirmation shows the order number, plus whichever parts apply: delivery window and "this order kept X kg of straw out of the fire" for physical items, and one certificate per sponsorship line.
- Each sponsorship line carries its own certificate name and province, so two sponsorships with different names make two lines and two certificates.

### Sponsor a field: for people

- **Sponsor one rai: ฿99.** Pick how many rai (1–10). Pick a province from a short list (Chiang Rai, Chiang Mai, Lampang, Nan). Enter the name for the certificate.
- Checkout through the same bag and checkout. Confirmation shows the **certificate**: the name, the number of rai, the province, a field ID and a date, styled to look good in a phone screenshot, with a "Save as image" or print option.
- **Home pack:** 50 meal boxes for ฿249, added to the same bag.
- Mixed bags (business products plus a sponsorship) are allowed.

### Impact

The problem (smoke season, health), how the money flows (business pays → StrawCycle pays the farmer per kilo of straw → straw is pressed into packaging), the real pilots with links, and the counters. Each number states its source or says it is an estimate.

**Impact maths (shared by the counters and confirmations):** one rai of rice gives about 650 kg of straw (estimate to confirm with a source during build); a 750 ml meal box uses about 20 g of straw fibre; the other products get estimated weights, labelled as estimates. A single order is small in rai (a 300-box carton is about 6 kg, under 0.01 rai), so **orders are shown in kilograms of straw kept out of the fire**, with the field area in square metres beside it when it reads well (1 rai = 1,600 m²). Rai is used for sponsorships (one sponsorship = one rai) and for big running totals: the partner sticker example is a busy café a year in (about 1,000 boxes a day, so roughly 12 rai a year), and says so.

The home-page counters are a fixed, believable story figure that ticks up slowly while on screen, not real data. The footer says so.

## Code shape

Keep Still Gallery's split:

- `shop.js`: pure money and impact logic, no DOM. Products, carton sizes, bulk tiers, logo option, shipping, `totals`, `orderNumber`, `deliveryWindow`, `raiSaved`, bag load/save (tolerates missing storage). Fully tested.
- `app.js`: shared page behaviour (bag drawer, checkout dialog, forms, reveals), adapted from Still Gallery.
- `film.js`: the Three.js scene, loaded only on Home, exposing one `render(p, t)`; plus the fallback switch.
- Static HTML for product cards and pages, kept in sync with `shop.js` by tests, so pages show content without JS.

## Video, later

After the site: a projector video made with the installed `hyperframes` (renders HTML, including `film.js`, frame by frame) and possibly `onetake` (one continuous camera move), with the user's ChatGPT images as transitions and `media-use` for free music. Remotion stays an option (`remotion-dev/skills`, scanned first). It gets its own design.

## Decided by the user

- StrawCycle, business-first, people second but equal weight.
- Approach A.
- Video of the site on a projector, plus the site on classmates' phones.
- ChatGPT images, made by the user, for transitions.
- Prices in baht; GitHub and Vercel later (ask before pushing or deploying).

## My calls (the user can change any)

- Separate repo at `C:\strawcycle`; Still Gallery untouched.
- Three.js on WebGL from a pinned CDN, no build step.
- Product list, prices, bulk tiers, logo surcharge, shipping and delivery numbers above.
- Bulk discount on list price only; over 100 cartons suggests a quote but doesn't block.
- ฿99 per rai and the ฿249 home pack.
- 650 kg per rai and 20 g per box as working estimates; orders shown in kg of straw, rai kept for sponsorships and big totals.
- One checkout for mixed bags: sponsorships ship free and skip the address; one certificate per sponsorship line.
- `render(p, t)` with time passed in, so the scene moves at rest and the video can still render any frame.
- Fallback stills double as the ChatGPT transition images.
- Pilot facts (Urmatt/GIZ, Fang Thai) get checked against sources during the build.

## Left to the builder

Exact visual design (type, colour tokens, layout) through `hallmark`; scene modelling and shaders; caption wording; form field details; the slow-device test; test cases beyond the money and impact logic.
