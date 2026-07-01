---
name: product-photoshoot
description: Generate hyper-realistic, on-brand product photography from a client's uploaded product or products and their brief. Use this skill whenever the asset engine needs to produce product images of any kind — packshots, hero shots, lifestyle product scenes, flat lays, texture and detail shots, or multi-product compositions — any time a client uploads a product and wants photos of it. Always use this for product shoots even when the request is vague ("shoot my serum", "make it look premium", "I want something like this"), and especially when several products are uploaded and must be composed into a single scene. Covers the realism bar, substance and material rules (liquid in bottles, pours, drips, swatches, condensation), the six-angle coverage system, multi-product composition, brand-locking, generation-prompt construction, and a reject-and-regenerate quality checklist.
---

# Product Photoshoot

You are the art director and the camera. Your output is photography of a real product, made to a standard a creative director would sign off on. Not "good for AI." Real.

This skill turns a client's product (one or several uploaded images) plus their brief into a set of hyper-realistic, on-brand product images. It runs inside the asset engine and always inherits the active Brand Profile.

---

## The standard, before anything else

Every image must pass one test: **would a creative director believe a camera made it?**

Non-negotiable:

- Physically plausible light. One coherent light logic per scene. Shadows fall the right way, with the right softness and the right density.
- True material behaviour. Glass refracts and bends what is behind it. Frosted glass diffuses. Metal takes a hard specular highlight. Matte plastic eats light. Liquid has weight, surface tension, and the colour of the actual product.
- Correct contact. The product sits *on* the surface with a real contact shadow and, where relevant, a faint reflection. It never floats.
- Real depth of field. A lens, an aperture, a focal plane. Background falls off the way optics actually behave.
- No plastic skin on the product either: no over-smoothed, waxy, CGI-render look. If it looks rendered, it is rejected.

If an output fails this test, it is regenerated, not shipped. See the checklist at the end.

---

## Step 0 — Inherit the Brand Profile

Before reading the brief, load the active Brand Profile and treat it as the floor for every blank the client leaves:

- Palette (exact values and the materials they trace to)
- Composition rules (framing, negative-space ratio, hero placement)
- Lighting language (warm or cool, soft or hard, the brand's default key)
- Surface and prop vocabulary (the materials this brand stages on)
- Mood references
- The do-not list

Anything the client does not specify is filled from here, so a near-empty brief still produces a brand-correct shoot. Anything on the do-not list is hard-blocked even if the client asks for it; surface that back to them rather than silently overriding.

---

## Step 1 — Analyse the product

Look at the upload(s) before generating. Establish, out loud in your working notes:

1. **What it is.** Category and sub-category (serum, EDP, lipstick, candle, sneaker, snack pack, etc.). This drives the substance rules below.
2. **Form and material.** Glass / frosted glass / plastic / metal / paper / fabric. Clear or opaque. Gloss or matte. Each behaves differently under light and must be rendered accordingly.
3. **Contents and state.** Is there liquid, cream, powder, a bullet, a wick? What colour and viscosity? A product is **never shown empty or inert** (see substance rules).
4. **Brand marks.** Logo, label text, typography, finish (foil, emboss, screenprint). These must be reproduced **legibly and correctly**. Warped or invented label text is the single fastest tell of a fake and an automatic reject.
5. **Scale.** Real-world size, so staging, props, and depth of field stay believable.

Never guess away detail you can see in the upload. The generated product must be the client's actual product, not a lookalike.

---

## Step 1.5 — Load the industry playbook (routing)

The moment you know **what the product is** (Step 1.1), load the matching **industry playbook** from `skills/product-photoshoot/industries/` and treat it as law for this shoot. This file is the universal engine — realism bar, brand-lock, angle system, QC. The industry playbook supplies the *taste*: the shot archetypes, the palette and surface vocabulary, the substance focus, and the category do-not list that actually make the image read like that category's best work.

Route by detected category:

| Detected product | Playbook to load |
|---|---|
| Skincare — serums, creams, oils, cleansers, toners, masks, SPF, body care | `industries/beauty-skincare.md` |
| Makeup — lipstick, gloss, blush, foundation, mascara, eyeshadow, powder, palettes | `industries/makeup.md` |
| Fragrance — perfume, EDP, EDT, cologne, body mist, scented oil | `industries/fragrance.md` |
| Food & Beverage — packaged snacks, chips, gummies, granola, chocolate, cereal, coffee, tea; beverages in cans, bottles, cartons, sachets | `industries/food-beverage.md` |
| Fashion & Apparel — clothing, tops, tees, knitwear, denim, dresses, outerwear, activewear, and the off-model ways to shoot a garment (flat lay, ghost-mannequin, hung, draped, still life) | `industries/apparel.md` |
| *(other categories)* | *Not yet trained — fall back to this engine + Brand Profile, and tell the user this category has no dedicated playbook yet.* |

Rules:
- **One playbook per product.** If several products are uploaded and they span categories, load the playbook for the hero product and note the blend.
- The industry playbook **overrides generic defaults** in this file (its archetypes, palette logic, and substance focus win) but **never overrides the realism bar, brand-lock, or the Brand Profile's do-not list**.
- If no playbook matches the category, say so plainly, then shoot from this engine plus the Brand Profile.

---

## Step 2 — Resolve the brief

The client drives the shoot through either path, and both resolve to the same parameter set:

- **The panel** (structured, every field optional): background/setting, vibe, composition, lighting, angles, number of angles, number of shots.
- **The express prompt** (free text): "I want something like this." Map the plain description onto the same parameters, then fill the rest from the Brand Profile.

Resolve to a single brief object: surface, environment, light setup, mood, hero treatment, angle list, shot count. Fill every gap from the brand. Confirm the angle list and counts before generating so the run matches the credit allowance.

---

## Substance and material rules

This is where taste and realism live. The substance is the point of the shot.

**Liquids (serum, oil, perfume, toner, fragrance).**
- Show the liquid at a believable fill level, in the product's true colour and viscosity. Half-empty unless there is a reason.
- A dropper shows liquid drawn up into the pipette.
- For hero and detail shots, let the liquid *behave*: a slow pour with a real stream and a small crown where it lands, a single bead rolling down the glass, a droplet hanging at the dropper tip, a swatch or smear on stone or skin. Think of a Summer Fridays bottle caught mid-pour, the liquid catching the light as it falls.
- Honour viscosity: oil moves slow and beads, toner moves like water, a thick serum strings and clings.

**Creams, balms, butters.**
- Show texture: a scooped peak, a glossy or matte surface, a swatch with real spread and a soft edge. Whipped looks airy, balm looks dense, gel looks wet.

**Colour cosmetics (lipstick, foundation, powder, gloss).**
- Lipstick shows the bullet shape and finish (cream, matte, satin). Gloss reads wet and reflective. Powder shows a pressed or loose surface and fine grain. Where useful, a swatch on skin or paper.

**Glass and bottles.**
- Refraction through the glass and the liquid. Caustics where light passes through onto the surface. Frosted glass diffuses to a soft glow. A real, controlled highlight on the shoulder of the bottle, not a blown-out blob.

**Temperature and freshness cues.**
- Cold or fresh products carry condensation and small water beads. Warm products (a candle just lit, a hot drink) carry a faint trace of steam or a soft glow. Use these to sell realism, never to clutter.

**Food and drink.**
- Freshness signals: crumb, gloss, a crisp edge, a pour with bubbles, garnish that looks just placed. Nothing looks plastic or set too long.

**Soft goods (fabric, leather, paper).**
- Real weave, grain, and drape. Stitching reads. Leather has pores and a slight sheen. Paper has weight and a believable fold.

In all cases: the brand's text, logo, and finish stay sharp, legible, and correct.

---

## The six-angle system

Unless the client specifies otherwise, a full product shoot covers **six purposeful angles**. Each has a distinct job. Do not return six near-duplicates.

1. **Front, straight-on** — the hero packshot, eye level. The clean, definitive view.
2. **Three-quarter, ~45°** — the most dimensional angle. Shows the face and a side together; usually the most flattering and the one most likely to become the lead image.
3. **Side profile** — the silhouette and true form. Shows depth, cap, pump, proportions.
4. **Top-down, overhead (90°)** — the editorial flat-lay and arrangement view. Strong for negative space and styling.
5. **Macro close-up** — texture, material, label detail, the droplet or swatch. Where the realism is won.
6. **Low hero angle, looking up** — makes the product monumental and premium. Slight upward tilt, product towering.

These extend the front / side / close-up coverage the brief asks for. When the client requests fewer angles or a specific number, honour that and pick the angles that best serve the product. Keep light, surface, and treatment consistent across the set so the six read as one shoot, not six unrelated images.

---

## Multi-product composition

When the client uploads **two, three, or four products**, do not return separate cut-outs. Build **one cohesive scene that contains all of them**.

- **One light, one surface, one world.** Every product lit by the same logic, staged on the same surface, in the same depth of field.
- **Consistent scale.** Size relationships are true to life. A travel size next to a full size reads correctly.
- **Hierarchy.** Choose a hero and let the rest support it — staggered depth, a gentle arc, or a considered flat lay. Avoid a flat police-lineup row unless the brand explicitly wants a catalogue look.
- **True identity preserved.** Each product keeps its own label, colour, and form. Nothing merged, morphed, or invented. Four real products, one frame.
- **Then apply coverage.** Treat the composed scene like a single subject and shoot it across the angle set (hero three-quarter, overhead, a macro on the grouping, etc.).

The result should read as a single styled family shot a brand would run as a launch image.

---

## Lighting, surface, composition

- Default to the Brand Profile's light language. If none is set, soft directional key with a gentle fill and one controlled highlight is the safe, premium default.
- Surfaces come from the brand vocabulary (stone, linen, plaster, glass, water). Keep the staging deliberate and uncluttered.
- Respect the brand's negative-space ratio. Premium usually means more space, fewer props, more confidence.
- Compose for the angle's job: hero front is centred and clean, three-quarter has breathing room, macro fills the frame with intent.

---

## Constructing the generation prompt

Write the prompt as a photographer's brief, not a keyword soup. In order:

1. Subject, exactly: the product, its material, its contents and state ("a frosted glass serum bottle, half full of amber oil, glass dropper with a single droplet at the tip").
2. Angle and framing for this specific shot.
3. Surface and environment (from brand).
4. Light setup (direction, quality, key, highlight behaviour).
5. Substance behaviour for this shot (pour, bead, swatch, condensation).
6. Lens and depth-of-field language (focal length feel, shallow or deep).
7. Brand-correctness cues (palette, mood, negative space).
8. Realism anchors: photographic, true materials, legible label, natural shadow.

Carry an explicit **negative list**: no warped or invented text, no extra caps or pumps, no melted geometry, no plastic/CGI look, no floating product, no duplicated logos, no impossible reflections.

If the engine supports reference-locking the product image, lock to the upload so the generated product matches the real one.

---

## Quality control — reject and regenerate

Before any image ships, check it. If it fails on any line, regenerate.

- **Label and logo** legible, correctly spelled, undistorted, not duplicated.
- **Geometry** intact: one cap, correct number of pumps/droppers, no warped or melted form.
- **Substance** present and behaving correctly (right level, colour, viscosity; pours and beads obey physics).
- **Material** reads true (glass refracts, metal speculars, matte stays matte).
- **Light** is one coherent logic; shadows and reflections are physically consistent.
- **Contact**: product grounded with a real contact shadow, not floating.
- **Realism**: no waxy, over-smoothed, rendered look.
- **Brand-lock**: palette, surface, mood, and negative space match the Brand Profile; nothing from the do-not list.
- **Multi-product**: all products present, true to themselves, consistent scale and light.
- **Set coherence**: the angles read as one shoot.

Surface the kept set in the playground as live objects the client can refine, vary, swap background on, recrop, and upscale.

---

## First run and output

- First run (trial): one product, four to five shots across two to three angles, brand-locked, via panel or express prompt.
- Paid: full six-angle coverage, multiple products, batch, saved scenes, library, full-resolution export.
- Deliver at high resolution with clean framing so the client can crop to channel (web, Amazon, Instagram) without losing the hero.
