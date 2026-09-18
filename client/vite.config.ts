import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";

const SERVER_PORT: number = 3001;
const CLIENT_PORT: number = 5173;

export default defineConfig({
  plugins: [react()],
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
