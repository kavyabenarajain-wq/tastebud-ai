#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────────────────────
// GOOGLE CALENDAR AUTH — one-time. Mints the refresh token /api/book needs to create booking events
// + send Google Calendar invites on aikavyajain@gmail.com's calendar.
//
//   node scripts/google-calendar-auth.mjs
//
// Prereqs (Google Cloud Console, one-time):
//   1. Enable the "Google Calendar API".
//   2. OAuth consent screen: External → add scope .../auth/calendar.events → add aikavyajain@gmail.com
//      as a test user → PUBLISH it ("In production"). ⚠️ If left in "Testing", the refresh token
//      Google gives you EXPIRES AFTER 7 DAYS and bookings silently break weekly.
//   3. Credentials → Create OAuth client ID → Application type: "Desktop app" (loopback redirect is
//      allowed automatically). Put the Client ID + Secret into .env as
//      GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET.
//      (If you make a "Web application" client instead, add http://localhost:53682 as an Authorized
//       redirect URI first.)
//
// Then run this script, sign in AS aikavyajain@gmail.com, click Allow, and paste the printed
// GOOGLE_CALENDAR_REFRESH_TOKEN=… line into .env (and into the Vercel env for production).
// ─────────────────────────────────────────────────────────────────────────────────────────────
import http from "node:http";
import { readFileSync } from "node:fs";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

// Hand-rolled .env read (same convention as scripts/asset-lab.mjs — no dotenv dependency).
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const envVal = (k) => (env.split("\n").find((l) => new RegExp(`^${k}=`).test(l)) || "").split("=").slice(1).join("=").trim();
const CLIENT_ID = envVal("GOOGLE_CALENDAR_CLIENT_ID");
const CLIENT_SECRET = envVal("GOOGLE_CALENDAR_CLIENT_SECRET");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("✗ Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in .env first");
  console.error("  (Google Cloud Console → Credentials → OAuth client ID → Desktop app).");
  process.exit(1);
}

const consentUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force re-consent so a refresh_token is ALWAYS returned (not just the first time)
  }).toString();

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  return res.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end(`Authorization failed: ${err}. You can close this tab and re-run the script.`);
    console.error(`✗ Authorization error: ${err}`);
    server.close();
    process.exit(1);
  }
  if (!code) {
    // Ignore favicon / stray hits while we wait for the real redirect.
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    const tok = await exchangeCode(code);
    if (!tok.refresh_token) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("No refresh_token returned. Re-run the script (it forces prompt=consent). You can close this tab.");
      console.error("✗ No refresh_token in response:", JSON.stringify(tok));
      server.close();
      process.exit(1);
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<h2>Connected ✓</h2><p>tastebud can now send Google Calendar invites. You can close this tab.</p>");
    console.log("\n✓ Success. Paste this line into .env (and set the same in Vercel for production):\n");
    console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${tok.refresh_token}\n`);
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Token exchange failed. Check the terminal.");
    console.error("✗ Token exchange failed:", e?.message || e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nListening on ${REDIRECT_URI}\n`);
  console.log("1) Open this URL, sign in AS aikavyajain@gmail.com, and click Allow:\n");
  console.log(consentUrl + "\n");
  console.log("2) After you approve, this script prints the refresh token and exits.\n");
});
