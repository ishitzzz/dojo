import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false,
  serverExternalPackages: ["youtube-dl-exec", "youtubei.js"],
};

export default nextConfig;
