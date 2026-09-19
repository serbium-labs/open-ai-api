import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type UserConfig } from "vite";

const SERVER_PORT: number = 3001;
const CLIENT_PORT: number = 5173;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@components": fileURLToPath(new URL("./src/components", import.meta.url)),
      "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
      "@constants": fileURLToPath(new URL("./src/constants", import.meta.url)),
      "@models": fileURLToPath(new URL("./src/types", import.meta.url)),
    },
  },
  server: {
    port: CLIENT_PORT,
    proxy: {
      "/api": {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
} satisfies UserConfig);
