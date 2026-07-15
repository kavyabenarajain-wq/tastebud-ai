/**
 * brainStore — the stable PUBLIC surface for brand storage.
 *
 * The implementation moved to SQLite (see lib/store/*), so brand brains, learned memory and
 * campaigns are now durable, multi-tenant and concurrency-safe (atomic transactions instead
 * of racy filesystem read-modify-write). This barrel keeps every existing `@/lib/brainStore`
 * import working unchanged — nothing at the call sites had to move. New agent-memory and
 * credits APIs live alongside in lib/store (imported directly where needed).
 */
export type { BrainOrigin, BrainMeta } from "./store/brands";
export {
  slugify,
  listBrains,
  getBrain,
  getMeta,
  saveBrain,
  recordShotDecision,
  createDiscoveryBrain,
  saveGuidelines,
  getGuidelines,
} from "./store/brands";
export { getCampaigns, saveCampaign, upsertCampaignOutput } from "./store/campaigns";
