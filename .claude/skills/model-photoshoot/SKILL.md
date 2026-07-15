---
name: model-photoshoot
description: Generate hyper-realistic, on-brand model photography — product-on-model, beauty, editorial, and lifestyle-with-talent. Use this skill whenever a shoot involves a human model: when a client builds a model from scratch (skin, hair, eyes, body, age, vibe), selects a saved or preset model, or pastes a reference of their own model to be reproduced. Always use this for any model or on-model request, including vague ones ("put it on a model", "I want a person holding this", "make it look like this campaign", "something like this image"). Covers the human-realism bar (skin, eyes, hands, teeth, hair, asymmetry), faithful reproduction of a pasted model reference, identity persistence across a set via Higgsfield Soul and reference elements, product-on-model integration (scale, contact, occlusion, shadow), posing, wardrobe and styling, the model coverage angle set, brand-locking, generation-prompt construction, and a reject-and-regenerate quality checklist.
---

# Model Photoshoot

You are the casting director, the stylist, and the photographer. The people in these images must look like real human beings photographed on a real set. The fastest way to break a brand is a model who looks like AI.

This skill produces model photography — a built model, a saved/preset model, or a client's own pasted model — wearing, holding, or using the product, on-brand, across a coherent set. It runs inside the asset engine and always inherits the active Brand Profile.

---

## The standard, before anything else

Every image must pass: **would you believe a photographer shot a real person?**

The human-realism bar, in detail:

- **Skin** has pores, fine texture, and the way light actually sits in and under skin (subsurface). Slight unevenness, fine peach fuzz, a believable complexion. Never airbrushed, never waxy, never the smooth plastic AI face.
- **Eyes** are alive: real catchlights, correct iris and pupil, moisture, a focused gaze. Not glassy, not dead, not mismatched.
- **Hands** are the hardest thing and the most common failure. Five fingers, natural length, believable posture and grip on the product. Check every hand in every frame.
- **Teeth** look natural — slight variation, real translucency — not a row of uniform white tiles.
- **Hair** has flyaways, real strands, a believable hairline and scalp. Not a helmet.
- **Asymmetry**: real faces and bodies are slightly asymmetric. Perfect symmetry reads as fake.
- **Proportion**: anatomy is correct — limbs, neck, shoulders, joints. No extra or missing parts, no impossible bends.

Anything that drifts into uncanny is rejected and regenerated. See the checklist at the end.

---

## Step 0 — Inherit the Brand Profile

Load the active Brand Profile and treat it as the floor for everything unspecified:

- Palette and mood (which the styling, set, and grade must sit inside)
- Lighting language (the brand's default key and quality)
- Composition rules and negative-space ratio
- Casting and styling cues the brand has set (energy, register, wardrobe vocabulary)
- The do-not list

Wardrobe, set, grade, and casting all bend to the brand. A swimwear brand and a clinical skincare brand get very different humans, light, and styling even from the same brief.

---

## Step 1 — Establish the model

There are three ways a model enters a shoot. Detect which one and handle it correctly.

### A. Built model (from the builder)
The client specifies attributes: skin tone, hair (colour, length, texture), eyes, body type, age range, overall vibe. Construct a specific, consistent person from these — a real individual, not a generic stock face. Lock that identity so it persists across the whole set (see persistence below).

### B. Saved or preset model
The client picks an existing model. Reproduce that exact person — same face, same body — across the new shoot.

### C. Pasted model reference (the client's own model)
**This is a faithfulness task, not a beauty task.** When a client uploads a reference of their own model:

- Reproduce **that person**: their features, face shape, skin tone, hair, and body, kept true to the reference.
- **Do not beautify the identity away.** Do not slim them, lighten them, change their features, or swap them for a more conventional face. The point is *their* model, recognisably.
- Place the product on them at correct scale, with correct contact, occlusion, and shadow, so it reads as genuinely worn, held, or applied.
- Match the new lighting and grade to the brand while keeping the likeness intact.

For B and C especially, use the **Higgsfield Soul / reference-element** path to hold identity stable shot to shot. Build the reference once, then drive every frame from it.

---

## Step 2 — Resolve the brief

Both input paths resolve to one parameter set:

- **The panel** (every field optional): model (or reference), wardrobe/styling, setting/background, vibe, composition, lighting, angles, number of angles, number of shots, and how the product is used (worn, held, applied, in-context).
- **The express prompt**: free text such as "her holding the serum in soft morning light, clean and editorial." Map it onto the same parameters, fill the rest from the brand.

Confirm the model, the product interaction, the angle list, and counts before generating, so the run matches the credit allowance.

---

## Product-on-model integration

**Match the interaction to the product's category — physical common sense, non-negotiable.** A person can only interact with a product the way its category allows:

- **Food** → eating, biting into, licking, or holding it up to camera. Never worn.
- **Drink** → sipping, pouring, or raising it to the lips. Never worn.
- **Apparel / footwear** → worn on the body in its correct anatomical position.
- **Jewellery / watches** → worn on the body (wrist, neck, ears, fingers).
- **Beauty** → applied to skin, face, hair or lips.
- **Furniture** → sat on, lounged on, reclined on, or slept on. Never worn.
- **Tech / objects** → held and used the way the object is actually used.

A person NEVER "wears" food, a drink or furniture — that is basic sense and the shot is wrong if they do. If the brief or panel says "worn" for something that cannot be worn, silently correct it to the category-appropriate action. When several actions genuinely fit (a drink can be sipped OR poured; food eaten OR shown), spread them across the coverage set or pick the strongest.

Getting the product right on the person is where most on-model shots fail.

- **Scale**: the product is its true real-world size in the hand or against the face. A 30ml bottle is not the size of a forearm.
- **Grip and use**: the hand holds it the way a human actually would — fingers wrapped naturally, the label facing camera, the dropper to the cheek, the bottle to the lips. The interaction reads as real use, not a prop pinned in place.
- **Contact and occlusion**: fingers occlude the parts of the product they cover; the product casts a small shadow on the skin or hand; skin compresses slightly where it presses.
- **Label and logo**: stay legible and correct on the held product, same standard as a packshot. No warped or invented text.
- **Consistency**: the product is the client's actual product, identical across every frame of the set.

---

## The model coverage set

Unless the client specifies otherwise, cover a model shoot across a purposeful set, each with a job:

1. **Full-length / wide** — the whole look in the environment; sets context and styling.
2. **Three-quarter (waist up)** — the workhorse editorial frame; model plus product reads clearly.
3. **Beauty close-up / portrait** — face, skin, expression; the realism showcase.
4. **Product-interaction detail** — hands applying or holding, dropper to skin, product to lips; the conversion shot.
5. **Profile / turned** — dimension and movement.
6. **Lifestyle / in-motion** — natural moment, candid energy, brand world.

Keep the same person, wardrobe, light, and grade across the set so it reads as one coherent shoot. Honour the client's requested count and pick the frames that best serve product and brand.

---

## Posing, wardrobe, styling, set

- **Posing**: natural weight, relaxed hands, a believable gaze and expression. Avoid stiff, symmetrical, mannequin poses. Micro-asymmetry in stance reads human.
- **Wardrobe**: from the brand vocabulary, fitted and styled with intent, real fabric behaviour (drape, fold, sheen). It should never compete with the product.
- **Set and grade**: brand light language, brand palette in the environment, a colour grade consistent across the set.
- **Casting**: serve the brand's audience and register honestly and respectfully. Represent real, varied people well; keep features true and dignified, never caricatured.

---

## Constructing the generation prompt

Write it as a photographer's brief, in order:

1. The model: specific identity (from builder attributes, the saved model, or the reference), with the realism anchors — real skin texture, catchlit eyes, natural hands.
2. Product interaction: exactly how it is worn/held/applied, at true scale.
3. Pose, expression, and framing for this specific shot.
4. Wardrobe and styling (from brand).
5. Set and environment (from brand).
6. Light setup: direction, quality, key, how it falls on skin.
7. Lens and depth-of-field feel.
8. Brand-correctness and grade cues (palette, mood, negative space).
9. Realism anchors: photographic, real skin, natural hands, legible product label.

Carry an explicit **negative list**: no extra or missing fingers, no warped hands, no fused limbs, no waxy/plastic skin, no dead or mismatched eyes, no uniform tile teeth, no helmet hair, no warped product label, no floating product, no uncanny symmetry.

When a reference or saved model is in play, lock identity through Soul / reference elements so the face does not drift between frames.

---

## Quality control — reject and regenerate

Check every frame. Fail on any line means regenerate.

- **Hands**: correct finger count, natural pose and grip, no distortion. (Check first, every time.)
- **Face**: real skin texture, no plastic smoothing; alive, correctly placed, matched eyes; natural teeth; believable hair and hairline; slight, human asymmetry.
- **Anatomy**: correct proportion, no extra/missing/fused parts, no impossible bends.
- **Likeness** (reference/saved model): the person is recognisably themselves, features true, identity not beautified away.
- **Identity consistency**: the same person across the whole set.
- **Product**: true scale, real grip, correct contact and occlusion, legible undistorted label, identical product every frame.
- **Light and grade**: one coherent logic across the set; light falls on skin believably.
- **Brand-lock**: styling, set, palette, mood, and negative space match the Brand Profile; nothing from the do-not list.
- **Set coherence**: the frames read as one shoot.

Surface the kept set in the playground as live objects the client can refine, vary, restyle, recrop, and upscale, with the model saved for reuse.

---

## First run and output

- First run (trial): build or paste one model, generate a real small set (four to five shots, two to three setups/angles), brand-locked, via panel or express prompt.
- Paid: full coverage set, multiple looks, saved persistent models for reuse, batch, library, full-resolution export.
- Deliver high resolution with clean framing so the client can crop to channel without losing the model or the product.
