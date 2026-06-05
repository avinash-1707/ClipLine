import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // @clipline/timeline ships raw TypeScript (just-in-time package); Next compiles it.
  transpilePackages: ["@clipline/timeline"],
};

export default nextConfig;
