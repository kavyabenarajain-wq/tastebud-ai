import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Server-side text extraction for the Back-Brain document uploader.
 *
 * The operator drops a founder's brief / call notes as a PDF or Word file and we pull the
 * plain text out so it can flow into the notes box (which is what the LLM brief extractor
 * reads). Kept OFF the client bundle on purpose — pdf.js + mammoth are heavy — and behind
 * the same operator gate as the deck builder.
 *
 * PDFs come in two flavours: DIGITAL (selectable text — pdf.js reads it directly, free & fast)
 * and SCANNED / IMAGE-ONLY (the page is a picture, so pdf.js finds little or nothing). For the
 * second kind we fall back to Gemini, which OCRs the images in the PDF and returns the text.
 */

export type DocKind = "pdf" | "pdf-ocr" | "docx" | "text";
export type ExtractResult = { text: string; kind: DocKind };

const TEXTUAL = /\.(txt|text|md|markdown|csv|json|rtf|log|tsv)$/i;

// Magic bytes: PDF starts with "%PDF", DOCX (a zip) starts with "PK\x03\x04".
const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

// Gemini inline_data must fit in the request; base64 inflates ~33%, so cap the OCR-able PDF size.
const MAX_OCR_BYTES = 14 * 1024 * 1024;

/** Tidy extracted text: normalise newlines, drop trailing spaces, collapse 3+ blank lines to one. */
function normalize(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Heuristic: did pdf.js get real prose, or is this a scanned/image PDF that needs OCR? */
function looksScanned(text: string, pages: number): boolean {
  const len = text.trim().length;
  return len < 200 || len < 50 * Math.max(1, pages); // near-empty, or < ~50 chars/page
}

/**
 * OCR a PDF with Gemini — reads the text out of the page images. Best-effort: returns "" if
 * there's no key, the file is too big for an inline request, or the call fails.
 */
async function geminiOcrPdf(bytes: Uint8Array): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || bytes.byteLength > MAX_OCR_BYTES) return "";
  const model = process.env.GEMINI_OCR_MODEL ?? process.env.GEMINI_QC_MODEL ?? "gemini-2.5-flash";
  const data = Buffer.from(bytes).toString("base64");
  const body = {
    contents: [{
      parts: [
        { text:
          "This is a document (a founder's brand brief or call notes). Transcribe ALL of its text " +
          "VERBATIM — read the words out of any scanned pages, images, screenshots or diagrams too. " +
          "Preserve the reading order and paragraph breaks. Output ONLY the transcribed text, nothing else." },
        { inline_data: { mime_type: "application/pdf", data } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { if (r.status >= 500 && attempt === 0) continue; return ""; }
      const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const out = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      return out.trim();
    } catch {
      if (attempt === 0) continue;
    }
  }
  return "";
}

export async function extractDocText(filename: string, buf: ArrayBuffer): Promise<ExtractResult> {
  const name = (filename || "").toLowerCase();
  const bytes = new Uint8Array(buf);

  // PDF — extension or magic bytes.
  if (/\.pdf$/i.test(name) || isPdf(bytes)) {
    let text = "";
    let pages = 1;
    try {
      const pdf = await getDocumentProxy(bytes);
      const res = await extractText(pdf, { mergePages: true });
      pages = res.totalPages || 1;
      text = normalize(Array.isArray(res.text) ? res.text.join("\n\n") : String(res.text ?? ""));
    } catch {
      /* fall through to OCR */
    }
    // Scanned / image-only (or unreadable) PDF → OCR the images with Gemini.
    if (looksScanned(text, pages)) {
      const ocr = normalize(await geminiOcrPdf(bytes));
      if (ocr.length > text.length) return { text: ocr, kind: "pdf-ocr" };
    }
    return { text, kind: "pdf" };
  }

  // DOCX — extension, or a zip container that isn't a plain-text file.
  if (/\.docx$/i.test(name) || (isZip(bytes) && !TEXTUAL.test(name))) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: normalize(value ?? ""), kind: "docx" };
  }

  // Everything else — decode as UTF-8 text (covers .txt/.md/.csv/.json and any text/* upload).
  return { text: normalize(new TextDecoder("utf-8").decode(bytes)), kind: "text" };
}
