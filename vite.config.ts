import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createCodexBridgeMiddleware } from "./src/server/codexAppServerBridge";
import { createLocalApiApp } from "./src/server/localApiApp";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'naive-ui': ['naive-ui'],
        },
      },
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: "codex-bridge",
      configureServer(server) {
        const bridge = createCodexBridgeMiddleware();
        const localApi = createLocalApiApp({ port: 5173, restartAppServer: bridge.restart });
        server.middlewares.use(bridge);
        server.middlewares.use(localApi);
        server.httpServer?.once("close", () => {
          bridge.dispose();
        });
      },
    },
  ],
});
