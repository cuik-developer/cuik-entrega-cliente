/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  compress: false, // Disable gzip — .pkpass is already a zip; double-compression corrupts it
  serverExternalPackages: ["sharp", "passkit-generator"],
  images: {
    unoptimized: true,
  },
  // Do not advertise the framework.
  poweredByHeader: false,
  // One canonical host for pages: www.cuik.org -> https://cuik.org (308,
  // path + query kept). /api/* is NOT redirected: installed Apple passes call
  // https://www.cuik.org/api/apple-wallet/v1/... (Apple's web service does not
  // follow redirects) and Google Wallet loads images from
  // https://www.cuik.org/api/assets/... . /_next/* is left alone as well, and so
  // is /defaults/* (default pass images Google fetches as NEXT_PUBLIC_APP_URL +
  // /defaults/..., which may be www).
  async redirects() {
    return [
      {
        source: "/:path((?!api/|api$|_next/|defaults/).*)",
        has: [{ type: "host", value: "www.cuik.org" }],
        destination: "https://cuik.org/:path",
        permanent: true,
      },
    ]
  },
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
