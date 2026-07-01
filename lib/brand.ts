import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrandProfile } from "./types";

// v1: one seeded Brand Profile on disk. (Multi-brand storage is a later concern.)
const PROFILE_PATH = join(process.cwd(), "data", "brand-profile.json");

export async function loadBrandProfile(_id?: string): Promise<BrandProfile> {
  return JSON.parse(await readFile(PROFILE_PATH, "utf8")) as BrandProfile;
}

export async function saveBrandProfile(profile: BrandProfile): Promise<void> {
  await writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");
}
