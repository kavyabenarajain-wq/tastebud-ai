/** @type {import('next').NextConfig} */
const nextConfig = {
  // Generated images can be large; allow data URLs and remote renders in <img>.
  images: { unoptimized: true },
};
export default nextConfig;
