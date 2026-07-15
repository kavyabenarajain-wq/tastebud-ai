/**
 * The store — one import surface for everything persistent. SQLite-backed, multi-tenant,
 * concurrency-safe, swappable behind these functions (Postgres later, for scale + payments).
 */
export { getDb, tx, nowISO, genId, DEFAULT_ACCOUNT, brandIdBySlug } from "./db";
export * from "./brands";
export * from "./campaigns";
export * from "./agentMemory";
export * from "./credits";
