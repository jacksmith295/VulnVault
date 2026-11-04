import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Keep our reviewed working agreements stable when starting development.
  agentRules: false,
};

export default nextConfig;
