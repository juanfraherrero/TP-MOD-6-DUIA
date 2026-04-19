import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "typeorm",
    "pg",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
};

export default nextConfig;
