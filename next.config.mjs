/** @type {import('next').NextConfig} */
const nextConfig = {
  // Generated images can be large; allow data URLs and remote renders in <img>.
  images: { unoptimized: true },
  // Native / node-only server packages kept external so webpack doesn't try to bundle their
  // .node binaries: the baked-export route (satori + @resvg/resvg-js) and the Postgres store
  // driver (pg). `@libsql/client` stays listed only because scripts/migrate-turso-to-pg.mjs
  // still reads the old Turso file as a backup; the app itself no longer uses it.
  experimental: { serverComponentsExternalPackages: ["@resvg/resvg-js", "satori", "pg", "@libsql/client", "libsql"] },
};
export default nextConfig;
