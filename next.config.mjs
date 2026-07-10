/** @type {import('next').NextConfig} */
const nextConfig = {
  // Generated images can be large; allow data URLs and remote renders in <img>.
  images: { unoptimized: true },
  // The baked-export route uses satori + @resvg/resvg-js (a native .node binary) — keep
  // them external so webpack doesn't try to bundle the native addon.
  experimental: { serverComponentsExternalPackages: ["@resvg/resvg-js", "satori"] },
};
export default nextConfig;
