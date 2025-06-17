import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// NOVO: Importando as ferramentas de URL do Node.js
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      // Esta seção informa ao Vite que "@" é um atalho para a pasta "src"
      "@": fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})