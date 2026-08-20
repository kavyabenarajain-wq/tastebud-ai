import { createHash } from "node:crypto";

/**
 * Google Calendar — the booking-invite seam. SERVER-ONLY.
 *
 * When someone books a discovery call, this creates a real event on the OWNER's Google Calendar
 * (aikavyajain@gmail.com) with `sendUpdates=all` — so Google emails the guest a NATIVE invite with
 * Yes / Maybe / No RSVP buttons — and `conferenceData.createRequest` — so each booking gets its own
 * Google Meet link. The organizer (= the account that authorised the refresh token) sees the event
 * on their own calendar automatically; the guest is the sole attendee.
 *
 * Deliberately SDK-free (mirrors lib/dodo.ts): a refresh-token exchange + one REST call over `fetch`,
 * zero new npm deps. Auth is OAuth 2.0 with a stored REFRESH TOKEN — a personal Gmail can't use a
 * service account, so we exchange the long-lived refresh token for a short-lived access token per
 * request. Get the refresh token once via `node scripts/google-calendar-auth.mjs`.
 *
 * Env (dormant until all three are set → googleCalendarConfigured() is false and /api/book falls
 * back to Resend so a booking is never silent):
 *   GOOGLE_CALENDAR_CLIENT_ID
 *   GOOGLE_CALENDAR_CLIENT_SECRET
 *   GOOGLE_CALENDAR_REFRESH_TOKEN
 *
 * ⚠️ The OAuth consent screen MUST be PUBLISHED ("In production"). While it's in "Testing", Google
 * expires refresh tokens after 7 days, which would silently break bookings weekly (invalid_grant).
 */

export type Booking = {
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

const CALL_MINUTES = 30; // matches the client's CALL_MINUTES in app/discovery/book/page.tsx

/** True only when all three OAuth secrets are present — the dormant-until-keyed gate (cf. dodoConfigured). */
export function googleCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  );
}

/**
 * Exchange the stored refresh token for a short-lived access token. Google's token endpoint requires
 * an `application/x-www-form-urlencoded` body (it rejects JSON). Throws on non-2xx so the caller
 * (createBookingEvent) can catch and fall back to Resend.
 */
async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null;
  if (!res.ok || !json?.access_token) {
    // invalid_grant here almost always means the refresh token expired/was revoked — re-run the auth
    // script AND confirm the OAuth consent screen is Published (Testing expires tokens after 7 days).
    throw new Error(`google token exchange failed (${res.status}): ${json?.error ?? ""} ${json?.error_description ?? ""}`.trim());
  }
  return json.access_token;
}

/** A valid IANA timezone, or "UTC" — the client can send the non-IANA fallback string "your local time". */
function safeTimeZone(tz?: string): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function esc(s: string | undefined): string {
  return (s || "").trim();
}

/**
 * Create the discovery-call event + invite. Returns the useful bits, or null on ANY failure /
 * missing data so /api/book falls back to Resend. The instant is fixed by the UTC `Z` in startISO;
 * `timeZone` only drives how the time displays in the invite.
 */
export async function createBookingEvent(
  booking: Booking,
): Promise<{ id: string; htmlLink: string; meetLink: string | null } | null> {
  if (!booking.startISO || !booking.email) return null;
  try {
    const start = new Date(booking.startISO);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + CALL_MINUTES * 60 * 1000);
    const tz = safeTimeZone(booking.tz);
    const title = esc(booking.brand) || esc(booking.name) || "your brand";

    const description = [
      "Brand discovery call with tastebud.",
      "",
      booking.name ? `Name: ${esc(booking.name)}` : "",
      booking.brand ? `Brand: ${esc(booking.brand)}` : "",
      booking.website ? `Website: ${esc(booking.website)}` : "",
      booking.goal ? `Wants: ${esc(booking.goal)}` : "",
      booking.notes ? `Notes: ${esc(booking.notes)}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n");

    // Deterministic conference request id → a network retry of the SAME booking reuses one Meet room
    // instead of minting a second. (Does not dedupe the event itself — acceptable for v1.)
    const requestId = "tb-" + createHash("sha1").update(`${booking.email}|${booking.startISO}`).digest("hex").slice(0, 24);

    const event = {
      summary: `tastebud × ${title} — discovery call`,
      description,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
      // The organizer is the token account (aikavyajain@gmail.com) — it lands on their calendar
      // automatically and is NOT listed here (self doesn't get an RSVP email). The guest is the
      // sole attendee, so sendUpdates=all mails THEM the Yes/Maybe/No invite.
      attendees: [{ email: booking.email }],
      guestsCanModify: false,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 10 },
        ],
      },
    };

    const token = await getAccessToken();
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(event),
        cache: "no-store",
      },
    );
    const data = (await res.json().catch(() => null)) as
      | { id?: string; htmlLink?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }; error?: { message?: string } }
      | null;
    if (!res.ok || !data?.id) {
      throw new Error(`google calendar insert failed (${res.status}): ${data?.error?.message ?? JSON.stringify(data)?.slice(0, 200)}`);
    }
    const meetLink =
      data.hangoutLink ??
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
      null;
    return { id: data.id, htmlLink: data.htmlLink ?? "", meetLink };
  } catch (err) {
    console.error(`[googleCalendar] booking event failed: ${(err as Error).message}`);
    return null; // caller falls back to Resend
  }
}
