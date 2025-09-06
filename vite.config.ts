import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: [
      "auction-craps-fur-ns.trycloudflare.com",
      "venture-hoped-uniprotkb-milwaukee.trycloudflare.com",
      "sharon-fx-hon-slight.trycloudflare.com",
      "office-wiki-enquiry-persistent.trycloudflare.com",
      "thirty-assumption-packaging-death.trycloudflare.com",
      "specific-charleston-exhibition-things.trycloudflare.com",
      "equal-arms-rid-waters.trycloudflare.com"
    ],
    hmr: {
      protocol: "wss",
      host: "equal-arms-rid-waters.trycloudflare.com",
      clientPort: 443,
    },
    proxy: {
      "/ws": {
        target: "http://localhost:8081",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
