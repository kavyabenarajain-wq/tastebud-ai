/** @type {import('next').NextConfig} */
const nextConfig = {
  // Generated images can be large; allow data URLs and remote renders in <img>.
  images: { unoptimized: true },
  // Native / node-only server packages kept external so webpack doesn't try to bundle their
  // .node binaries: the baked-export route (satori + @resvg/resvg-js) and the libSQL store
  // client (@libsql/client → native `libsql` for the local file; hrana/http for Turso).
  experimental: { serverComponentsExternalPackages: ["@resvg/resvg-js", "satori", "@libsql/client", "libsql"] },
};
export default nextConfig;
