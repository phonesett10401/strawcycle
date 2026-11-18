# Home film stills: ChatGPT image prompts

These four images replace the SVG placeholders in `images/`. The Home page shows them when the 3D film can't run (reduced motion, slow phone, no WebGL, CDN blocked), and the video uses them as transitions.

Make each scene twice:

- **16:9 landscape** (for the video and wide screens): save it as `images/scene-N.jpg`
- **9:16 portrait** (for phones): save it as `images/scene-N-tall.jpg`

Keep each JPG under about 300 KB (1600×900 and 900×1600 are enough). The page picks the tall one on portrait screens and falls back to `images/scene-N.svg` until the JPGs exist.

**Shared style (paste it into every prompt):** Stylised low-poly 3D look, soft and cinematic, like a calm animated short. Simple faceted shapes for the land, hut, packaging and table, with glowing particles carrying the light (dust, embers, straw fibres, city lights). Palette: warm straw gold, ember orange and smoke grey, turning to deep dusk blue. No text, no logos, no people's faces, no purple. Leave calm, darker space in the lower-left third for a caption.

---

## Scene 1: The field (`scene-1.jpg`, `scene-1-tall.jpg`)

> Low camera standing in harvested rice stubble in northern Thailand at sunset, looking toward a low sun sitting just above layered hazy mountain ridges. Rows of short golden stubble spikes fill the foreground, backlit and glowing at the tips. Warm dust motes float in the air. On the right, a small wooden farmer's hut on stilts with a steep thatched roof stands as a dark silhouette, with one small warm lantern glow under the roof. Sky goes from dusty dusk blue at the top to orange and pale gold at the horizon. [Shared style.] Aspect ratio 16:9. *(Second image: the same scene in 9:16 portrait, with the sun and hut in the upper half and the stubble filling the bottom.)*

## Scene 2: The smoke, reversed (`scene-2.jpg`, `scene-2-tall.jpg`)

> The same rice field a few minutes later, seen from slightly higher. Several long, low lines of fire burn across the stubble, bright yellow at the base, orange above. Thick grey-brown smoke rises from them in soft columns and spreads into a haze that hides the mountains and greys out the sky. Orange embers drift upward. The hut stands at the right, half lost in smoke. Mood: heavy and quiet, but beautiful, not frightening. [Shared style.] Aspect ratio 16:9. *(Second image: 9:16 portrait, smoke columns rising into the upper half.)*

## Scene 3: Straw into packaging (`scene-3.jpg`, `scene-3-tall.jpg`)

> Evening over the now-clear field: the sky is clean deep dusk blue with the first stars, mountains dark blue on the horizon, no smoke. Thousands of loose golden straw fibres lift off the dark field and swirl upward in a glowing spiral, folding together in mid-air into three pieces of plain beige, unbleached food packaging floating side by side: a clamshell meal box, a round bowl and a takeaway cup with a lid. The fibres glow warm gold, as if lit from inside. [Shared style.] Aspect ratio 16:9. *(Second image: 9:16 portrait, the spiral rising from the bottom and the three pieces stacked near the middle.)*

## Scene 4: The café (`scene-4.jpg`, `scene-4-tall.jpg`)

> A small round wooden café table on a terrace in Bangkok at dusk, seen from just above table height. On it sit the same beige meal box, bowl and lidded cup, lit warmly from above. A string of warm bulbs hangs across the top of the frame. Behind, Bangkok's skyline of simple dark blocks is dotted with warm and cool window lights under a deep blue sky with a faint orange glow at the horizon. Lines of street lights lead toward the city. Cosy, hopeful, quiet. [Shared style.] Aspect ratio 16:9. *(Second image: 9:16 portrait, table and packaging in the lower half, skyline and bulbs above.)*

---

After saving, open `index.html?film=off` to see the stills in place.
