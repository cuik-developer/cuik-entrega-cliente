/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  compress: false, // Disable gzip — .pkpass is already a zip; double-compression corrupts it
  serverExternalPackages: ["sharp", "passkit-generator"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
