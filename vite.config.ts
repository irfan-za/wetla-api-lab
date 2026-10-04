import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), nitro(), react()],
  server: {
    host: "127.0.0.1",
    port: 3106,
    strictPort: true,
    // Evidence captures must not hot-reload the app and reset in-flight diagnostic state.
    watch: { ignored: ["**/docs/evidence/**"] },
  },
});
