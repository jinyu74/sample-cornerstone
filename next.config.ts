import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      // WASM 코덱의 Node 전용 분기(require("fs"))는 브라우저에서 실행되지 않는다.
      fs: { browser: "./src/shared/viewer/empty-node-module.ts" },
    },
  },
};

export default nextConfig;
