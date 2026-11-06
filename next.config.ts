import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.VULNVAULT_STANDALONE === "1" ? "standalone" : undefined,
  reactCompiler: true,
  // Keep our reviewed working agreements stable when starting development.
  agentRules: false,
};

export default nextConfig;
