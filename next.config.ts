import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // No UI routes live here — serve the health check at the root.
      { source: "/", destination: "/api/health" },
    ];
  },
};

export default nextConfig;
