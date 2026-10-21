import type { NextConfig } from "next";
const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;
const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: storageUrl
      ? [
          {
            protocol: storageUrl.protocol === "http:" ? "http" : "https",
            hostname: storageUrl.hostname,
            port: storageUrl.port,
            pathname: "/storage/v1/object/public/menu-images/**",
          },
        ]
      : [],
  },
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
export default config;
