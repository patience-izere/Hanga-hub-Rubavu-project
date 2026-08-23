/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendOrigin = env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
        },
        "/media": {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/@react-three/drei")) return "react-three-drei";
            if (id.includes("node_modules/@react-three/fiber")) return "react-three-fiber";
            if (id.includes("node_modules/three/examples")) return "three-addons";
            if (id.includes("node_modules/three")) return "three-core";
            if (id.includes("node_modules/react") || id.includes("node_modules/@tanstack")) {
              return "react-platform";
            }
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
