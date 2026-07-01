import { z } from "zod";

/**
 * Lenient LLM-output parsing. gpt-5.5 (and friends) frequently return an OBJECT
 * where a string is expected (e.g. {"text": "..."} or {"en": "..."}), or a bare
 * value where an array is expected. Strict `z.parse()` throws on the first such
 * field and loses the whole payload — so before parsing we walk the schema and
 * coerce every leaf to the shape it wants, salvaging every good field.
 *
 * This is the same battle-tested approach used by the guidelines deck builder
 * (lib/backbrain.ts), lifted here so the research pipeline can reuse it.
 */

/** Best-effort flatten of any value to a string. */
export function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["text", "value", "en", "body", "content", "description", "label", "name", "title"]) {
      if (typeof o[k] === "string" && (o[k] as string).trim()) return o[k] as string;
    }
    return Object.values(o).filter((x) => typeof x === "string").join(" ");
  }
  return "";
}

/** Coerce any value into a string[] (splitting comma strings, flattening objects). */
export function toTextArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(toText).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const t = toText(v);
  return t ? [t] : [];
}

/**
 * Walk a zod schema and coerce `v` leaf-by-leaf to the type each field wants:
 * strings get toText, arrays map element-wise, objects recurse. Undefined leaves
 * are dropped so zod defaults/optionals still apply.
 */
export function coerceToSchema(schema: any, v: unknown): unknown {
  const def = schema?._def;
  const t = def?.typeName;
  if (t === "ZodDefault") return v === undefined ? undefined : coerceToSchema(def.innerType, v);
  if (t === "ZodOptional") return v == null ? undefined : coerceToSchema(def.innerType, v);
  if (t === "ZodNullable") return v == null ? null : coerceToSchema(def.innerType, v);
  if (t === "ZodCatch") return coerceToSchema(def.innerType ?? def.schema, v);
  if (t === "ZodString") return toText(v);
  if (t === "ZodNumber") return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(+v) ? +v : undefined;
  if (t === "ZodBoolean") return typeof v === "boolean" ? v : undefined;
  if (t === "ZodArray") {
    const arr = Array.isArray(v) ? v : v == null ? [] : [v];
    return arr.map((el) => coerceToSchema(def.type, el)).filter((el) => el !== undefined);
  }
  if (t === "ZodObject") {
    const shape = def.shape();
    const src = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(shape)) {
      const cv = coerceToSchema(shape[k], src[k]);
      if (cv !== undefined) out[k] = cv;
    }
    return out;
  }
  return v;
}

/** Strip ```json fences / prose and return the JSON substring. */
export function stripFences(t: string): string {
  const f = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (f?.[1]) return f[1].trim();
  const i = t.indexOf("{");
  return i >= 0 ? t.slice(i, t.lastIndexOf("}") + 1) : t;
}

/**
 * Parse raw LLM text against a schema, tolerating fences, object-where-string,
 * and one-bad-field failures. Returns the schema's default-shaped object even
 * when the model returns junk, so a caller never has to try/catch.
 */
export function parseLenient<T extends z.ZodTypeAny>(schema: T, raw: string): z.infer<T> {
  let obj: unknown = {};
  try {
    obj = JSON.parse(stripFences(raw || "{}"));
  } catch {
    obj = {};
  }
  const coerced = coerceToSchema(schema, obj);
  const whole = schema.safeParse(coerced);
  if (whole.success) return whole.data;

  // Field-by-field salvage for object schemas: keep every field that survives.
  const def = (schema as any)?._def;
  if (def?.typeName === "ZodObject") {
    const shape = def.shape() as Record<string, z.ZodTypeAny>;
    const salvaged: Record<string, unknown> = {};
    for (const k of Object.keys(shape)) {
      const r = shape[k].safeParse((coerced as any)?.[k]);
      if (r.success && r.data !== undefined) salvaged[k] = r.data;
    }
    return schema.parse(salvaged);
  }
  // Non-object schema that still failed — fall back to an empty parse (defaults).
  return schema.parse(undefined as any);
}
