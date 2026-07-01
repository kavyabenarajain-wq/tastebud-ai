# Creative Co-pilot — non-negotiables

**Lovable, but for creative direction.** The user talks to a creative-director agent on the left; the work is created live on a canvas on the right. Conversation in, finished creative out.

## Conversation-first (the core rule)
- The product is a **conversation**, not a form. The agent guides everything through chat and surfaces controls (uploader, panel) inline only when they help.
- **Readiness rule:** the agent needs exactly three things to generate — a **goal**, a **brand floor** (a Brand Profile, even the lightweight one), and **at least one product image**. The moment it has all three, it offers to generate. It must never over-interrogate.
- **Always able to generate from brand defaults.** A near-empty brief still produces an on-brand shoot. Never hard-block on the panel.
- **Persona:** a sharp, warm, decisive creative director. Propose, don't interrogate. One question per turn. Lead with a recommendation the user can accept by saying "go." Never expose prompts, model names, angle codes, or internal mechanics.

## Providers (swappable)
- **Agent brain:** Azure GPT-5.5 with tool-use now; `claude-sonnet-4-6` when `ANTHROPIC_API_KEY` is set.
- **Renderer:** Gemini now; Higgsfield when `HIGGSFIELD_API_KEY` is set. Image models never read SKILL.md — the skill instructs the agent/planner.
- Secrets live in `.env` only, never hardcoded.

## Skills
- Canonical in `/skills/<name>/SKILL.md` (read at runtime); copies in `/.claude/skills/`. The skill governs the Claude/Azure calls; those calls govern the image prompts.

## Generation standard (from the skills)
- Every image must pass: **would a creative director believe a camera made it?** Physically plausible light, true material behaviour, real contact shadow, real depth of field, no plastic/CGI look.
- **Product fidelity is absolute:** reproduce the uploaded product exactly — shape, label, every word of text, colours, proportions. Only the scene around it may change. Never invent or restyle the product.
- Brand-lock everything; the do-not list wins even if the user asks otherwise.

## Aesthetic (monochrome, Apple-grade — the UI recedes so the work is the only colour)
- Canvas `#FFFFFF`, surface `#F5F5F7`, ink `#1D1D1F`, muted `#6E6E73`, hairline `#D2D2D7`, true black `#000` for primary actions only. **No chromatic accent in the UI.**
- Inter (variable), tight display tracking (-0.02 to -0.03em), body 15–17px / lh ~1.55. 8px grid, heavy negative space.
- One screen: chat ~40% left, canvas ~60% right, single hairline divider. Primary button black fill/white text; secondary hairline outline. Radius 8–12px. Motion `cubic-bezier(0.4,0,0.2,1)` 200–350ms, fade + small translate. Restrained progress, never a loud spinner.

## v1 scope
- Build end-to-end: conversational **Product Photoshoot** (chat + canvas). In-chat brand conversation + minimal Brand Studio. Optional inline panel. Credits/subscription **stubbed** as a single `credits` check. Model Photoshoot and Campaigns/Ads = route + shell + `TODO: v2`.
