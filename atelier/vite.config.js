import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, API calls go to the Express server (which also serves this
// site on port 3001 in production).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/images': 'http://localhost:3001',
    },
  },
});
