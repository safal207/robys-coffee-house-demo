import { defineConfig } from "vite";

// Development preview only. Production remains the existing static build.
export default defineConfig({
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
});
