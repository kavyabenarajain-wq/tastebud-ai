import { NextRequest } from "next/server";
import { createDiscoveryBrain } from "@/lib/brainStore";

export const runtime = "nodejs";

/**
 * POST /api/book — a discovery-call booking from the native scheduler.
 *
 * Two jobs:
 *   1. Persist the lead (a discovery folder), so it lands in the internal bucket.
 *   2. Email the booking to the owner (BOOKING_NOTIFY_EMAIL) AND a confirmation to the guest,
 *      via Resend — the moment RESEND_API_KEY is set. Until then it still saves the lead and
 *      returns { emailed: false } so nothing is lost; no email just means no notification yet.
 *
 * Env:
 *   RESEND_API_KEY        — from resend.com (required to actually send)
 *   BOOKING_NOTIFY_EMAIL  — where owner notifications go (default admin@aitastebud.com)
 *   BOOKING_FROM_EMAIL    — verified sender, e.g. "tastebud <hello@aitastebud.com>".
 *                           Defaults to Resend's test sender (onboarding@resend.dev), which in
 *                           test mode only delivers to your Resend account email.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
// Owner notification always goes here. Defaults to the Resend account inbox so it works even
// before a domain is verified (and even if the env var isn't set in production).
const NOTIFY_TO = process.env.BOOKING_NOTIFY_EMAIL || "aikavyajain@gmail.com";
const FROM = process.env.BOOKING_FROM_EMAIL || "tastebud <onboarding@resend.dev>";
// A reusable Google Meet room. Create one at meet.google.com → New meeting → "Create a meeting
// for later" → copy the link, then set BOOKING_MEET_LINK in .env. (Fallback opens a fresh meeting.)
const MEET_LINK = process.env.BOOKING_MEET_LINK || "https://meet.google.com/new";

type Booking = {
  name?: string;
  email?: string;
  brand?: string;
  website?: string;
  goal?: string;
  notes?: string;
  startISO?: string;
  timeLabel?: string;
  tz?: string;
};

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  if (!RESEND_API_KEY) return { sent: false, reason: "no_key" as const };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html, reply_to: replyTo }),
    });
    if (!res.ok) return { sent: false, reason: await res.text() };
    return { sent: true as const };
  } catch (err) {
    return { sent: false, reason: (err as Error).message };
  }
}

function esc(s: string | undefined) {
  return (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

function formatWhen(bk: Booking): string {
  if (!bk.startISO) return bk.timeLabel || "a requested time";
  const d = new Date(bk.startISO);
  try {
    const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: bk.tz }).format(d);
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: bk.tz }).format(d);
    return `${date} · ${time}${bk.tz ? ` (${bk.tz.replace(/_/g, " ")})` : ""}`;
  } catch {
    return `${d.toUTCString()}${bk.timeLabel ? ` · ${bk.timeLabel}` : ""}`;
  }
}

function ownerHtml(bk: Booking, when: string) {
  const row = (k: string, v?: string) =>
    v ? `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px">${k}</td><td style="padding:6px 0;color:#111827;font-size:14px">${esc(v)}</td></tr>` : "";
  return `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto">
    <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#185D97;margin:0 0 4px">New discovery call</p>
    <h1 style="font-size:22px;color:#111827;margin:0 0 4px">${esc(bk.brand || bk.name)}</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 18px">${esc(when)}</p>
    <table style="border-top:1px solid #e5e7eb;border-collapse:collapse;width:100%">
      ${row("Name", bk.name)}
      ${row("Email", bk.email)}
      ${row("Brand", bk.brand)}
      ${row("Website", bk.website)}
      ${row("Wants", bk.goal)}
      ${row("Notes", bk.notes)}
    </table>
    <p style="font-size:14px;color:#111827;margin:18px 0 0">Google Meet: <a href="${MEET_LINK}" style="color:#185D97">${esc(MEET_LINK)}</a></p>
  </div>`;
}

// The guest confirmation — deliberately all-lowercase (the tastebud brand voice).
function guestHtml(bk: Booking, when: string) {
  const brand = (bk.brand || bk.name || "your brand").toLowerCase();
  const w = when.toLowerCase();
  return `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:540px;margin:0 auto;color:#1a1a17">
    <p style="font-size:20px;font-weight:600;color:#185D97;margin:0 0 22px;letter-spacing:-0.01em">tastebud × ${esc(brand)}</p>
    <h1 style="font-size:21px;font-weight:600;color:#111827;margin:0 0 18px">brand discovery call scheduled with tastebud</h1>
    <p style="font-size:15px;line-height:1.65;color:#374151;margin:0 0 14px">hey! we've scheduled a call with ${esc(brand)} on <strong style="color:#111827">${esc(w)}</strong>.</p>
    <p style="font-size:15px;line-height:1.65;color:#374151;margin:0 0 22px">be prepared for it — bring your products (or just a link to them) and the questions you've been sitting on. we'll come with your world half-built and ready to shape.</p>
    <a href="${MEET_LINK}" style="display:inline-block;background:#185D97;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:999px">join on google meet →</a>
    <p style="font-size:13px;color:#6b7280;margin:12px 0 24px">or open this link: <a href="${MEET_LINK}" style="color:#185D97">${esc(MEET_LINK)}</a></p>
    <p style="font-size:15px;line-height:1.65;color:#374151;margin:0 0 28px">we can't wait to build ${esc(brand)} with you.</p>
    <p style="font-size:15px;line-height:1.65;color:#374151;margin:0">thanks,<br/>kavya benara jain<br/>founder @tastebud</p>
  </div>`;
}

export async function POST(req: NextRequest) {
  let bk: Booking;
  try {
    const body = (await req.json()) as { booking?: Booking };
    bk = body.booking || {};
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!bk.email || !bk.name) return Response.json({ ok: false, error: "missing_fields" }, { status: 400 });

  // 1) Persist the lead (best-effort — a booking should never fail because the store hiccupped).
  try {
    await createDiscoveryBrain(bk.brand?.trim() || bk.name.trim(), bk.email.trim());
  } catch {}

  // 2) Notify.
  const when = formatWhen(bk);
  const owner = await sendEmail(NOTIFY_TO, `New discovery call — ${bk.brand || bk.name} · ${when}`, ownerHtml(bk, when), bk.email);
  let guest: { sent: boolean; reason?: string } = { sent: false };
  try {
    const brandSub = (bk.brand || bk.name || "your brand").toLowerCase();
    guest = await sendEmail(bk.email, `tastebud × ${brandSub}`, guestHtml(bk, when));
  } catch {}

  if (!owner.sent && "reason" in owner) console.error(`[book] owner email failed: ${owner.reason}`);

  return Response.json({
    ok: true,
    emailed: owner.sent,
    guestEmailed: guest.sent,
    note: RESEND_API_KEY ? undefined : "Saved. No email sent — set RESEND_API_KEY to notify " + NOTIFY_TO + ".",
    debug: !owner.sent && "reason" in owner ? String(owner.reason).slice(0, 400) : undefined,
  });
}
