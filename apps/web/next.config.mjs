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
  // Do not advertise the framework.
  poweredByHeader: false,
  // Baseline browser protections for every route (approved 19 Oct 2026):
  // https only, no framing of cuik.org (clickjacking), no MIME sniffing,
  // a lean referrer, and the camera only for the cashier's QR scanner.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ]
  },
}

export default nextConfig
