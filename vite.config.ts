import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// base './' so the static build works from any path (GitHub Pages, Vercel, local file server).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    nodePolyfills({ include: ['buffer'], globals: { Buffer: true, global: true, process: true } }),
  ],
  build: { target: 'es2022', sourcemap: false },
})
