import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
    // Next 15.5's segment explorer can produce a stale RSC client-manifest
    // reference in webpack dev mode. It is not used by the product UI.
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
