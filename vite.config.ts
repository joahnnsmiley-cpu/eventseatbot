import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        target: 'es2015',
        modulePreload: false,
        rollupOptions: {
          output: {
            // Keep the libraries in their own chunks so a change to app code
            // does not force everyone to re-download React and friends.
            manualChunks: {
              react: ['react', 'react-dom'],
              motion: ['framer-motion'],
              zoom: ['react-zoom-pan-pinch'],
            },
          },
        },
      },
      plugins: [
        tailwindcss(),
        react(),
        legacy({
          targets: ['defaults', 'not IE 11'],
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
