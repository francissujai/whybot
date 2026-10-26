import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Built into dist/, which src/server.ts serves on http://127.0.0.1:4173.
// `npm run dev` serves on :5173 and forwards the API and run files to the running server.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:4173", "/runs": "http://127.0.0.1:4173" } },
});
