

import { defineConfig } from "vite";
import{cloudflare} from "@cloudflare/vite-plugin"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [
    react(),
    cloudflare()],

  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
    preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },


});