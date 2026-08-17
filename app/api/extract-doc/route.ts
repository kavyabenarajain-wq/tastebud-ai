import type { NextRequest } from "next/server";
import { extractDocText } from "@/lib/extractDoc";
import { isOperator } from "@/lib/supabase/account";

// Internal-only: turn an uploaded PDF / DOCX (or any text file) into plain text for the
// Back-Brain deck builder's notes box. Same operator gate as /api/backbrain.
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(req: NextRequest) {
  if (!(await isOperator())) return Response.json({ error: "Forbidden — operator only." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file provided." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File too large (max 25MB)." }, { status: 413 });

  try {
    const { text, kind } = await extractDocText(file.name, await file.arrayBuffer());
    if (!text.trim()) {
      return Response.json(
        { error: "Couldn't read any text from that file — even OCR came back empty. Try a clearer scan, or paste the notes in directly." },
        { status: 422 },
      );
    }
    return Response.json({ ok: true, text, kind });
  } catch (err) {
    return Response.json({ error: (err as Error).message || "Failed to read that document." }, { status: 500 });
  }
}
