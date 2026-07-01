import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Read a skill's canonical SKILL.md from /skills (the orchestrator reads it as text). */
export async function readSkill(name: "product-photoshoot" | "model-photoshoot"): Promise<string> {
  return readFile(join(process.cwd(), "skills", name, "SKILL.md"), "utf8");
}

/**
 * Industry routing. The master SKILL.md tells the planner to "load the matching industry
 * playbook" — but the model can't read files, so we must physically inject the right one.
 * Each route maps a detected product category to its playbook file under
 * skills/product-photoshoot/industries/. Order = priority (first match wins), so the
 * narrower beauty sub-types are tested before the broad food net.
 */
const INDUSTRY_ROUTES: { file: string; label: string; keywords: RegExp }[] = [
  { file: "fragrance.md", label: "Fragrance", keywords: /\b(fragrance|perfum\w*|cologne|eau de (parfum|toilette|cologne)|\bedp\b|\bedt\b|parfum|body mist|\bscent(s|ed)?\b|attar|olfactor)/i },
  { file: "makeup.md", label: "Makeup", keywords: /\b(makeup|make-up|cosmetics?|colour cosmetics|lipstick|lip gloss|lip oil|lip tint|\bgloss\b|blush|foundation|mascara|eyeshadow|eyeliner|concealer|highlighter|bronzer|nail polish|mua|beauty palette)/i },
  { file: "beauty-skincare.md", label: "Skincare", keywords: /\b(skin\s?care|serum|moisturi[sz]\w*|cleanser|face wash|toner|\bspf\b|sunscreen|sunblock|face oil|face cream|eye cream|sheet mask|face mask|exfoliant|retinol|hyaluronic|niacinamide|body lotion|body butter|dermatolog)/i },
  { file: "food-beverage.md", label: "Food & Beverage", keywords: /\b(food|beverage|drinks?|snacks?|chips?|crisps?|gummies|gummy|candy|confection\w*|granola|chocolate|choc\w*|cocoa|cacao|truffles?|bonbons?|pralines?|fudge|caramel|cereal|coffee|espresso|matcha|\btea\b|soda|juice|kombucha|seltzer|sparkling water|sauce|popcorn|protein bar|energy bar|\bnuts?\b|makhana|biscuits?|cookies?|crackers?|jerky|sweets|namkeen|trail mix)/i },
  { file: "apparel.md", label: "Fashion & Apparel", keywords: /\b(apparel|clothing|clothes|garments?|fashion|t-?shirts?|\btees?\b|\btops?\b|shirts?|blouse|knit\w*|sweater|jumper|cardigan|hoodie|sweatshirt|denim|jeans|dress(es)?|skirt|trousers|\bpants\b|jacket|coat|outerwear|activewear|loungewear|jersey|streetwear)/i },
];

export type IndustryPlaybook = { label: string; file: string; content: string };

/**
 * Pick and physically load the industry playbook for a product, from any text that
 * describes it (brand category, productType, product name, the brief). Returns null
 * when nothing matches — caller then falls back to the master engine + brand profile.
 */
export async function loadIndustryPlaybook(routeText: string): Promise<IndustryPlaybook | null> {
  const text = routeText || "";
  for (const r of INDUSTRY_ROUTES) {
    if (r.keywords.test(text)) {
      try {
        const content = await readFile(join(process.cwd(), "skills", "product-photoshoot", "industries", r.file), "utf8");
        return { label: r.label, file: r.file, content };
      } catch {
        return null;
      }
    }
  }
  return null;
}
