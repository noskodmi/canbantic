import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@kanbantic/shared", "@kanbantic/ui"],
  typedRoutes: true,
};

export default config;
