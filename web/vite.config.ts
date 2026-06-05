import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API + WebSocket to the backend during dev so the browser talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
