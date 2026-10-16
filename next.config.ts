import type { NextConfig } from "next";

const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: { serverSourceMaps: !IS_PRODUCTION_BUILD },
};

export default nextConfig;
