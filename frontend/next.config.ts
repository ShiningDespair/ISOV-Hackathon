import type { NextConfig } from "next";

// Next.js yapılandırması — Docker için standalone çıktı üretiyoruz.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Demo ortamında derleme, backend'e erişmeden tamamlanabilmeli.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  poweredByHeader: false,
};

export default nextConfig;
