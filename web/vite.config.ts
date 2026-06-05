import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API + WebSocket to the backend during dev so the browser talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so the app is reachable from other machines on the LAN.
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
