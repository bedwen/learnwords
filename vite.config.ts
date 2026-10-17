import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    target: 'es2020',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020',
    },
  },
  plugins: [
    react(),
    ...(mode === 'mobile'
      ? [
          {
            name: 'strip-google-fonts',
            transformIndexHtml(html: string) {
              return html.replace(
                /<link[^>]+href="https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\s*/gi,
                ''
              );
            },
          },
        ]
      : []),
  ],
  server: {
    host: process.env.HOST || '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: process.env.HOST || '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
}));

