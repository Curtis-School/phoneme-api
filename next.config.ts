import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // No UI routes live here — serve the health check at the root.
      // /api/* is reserved for the CRUD endpoints.
      { source: "/", destination: "/health" },
    ];
  },
};

export default nextConfig;
