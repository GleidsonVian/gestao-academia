import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /backend/* é encaminhado para a API (FastAPI). Assim o app inteiro fica numa única origem
// e dá para expor só a porta 5173 (ex.: por um túnel) sem configurar CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/backend": {
        target: "http://localhost:3333",
        rewrite: (p) => p.replace(/^\/backend/, ""),
      },
    },
  },
});
