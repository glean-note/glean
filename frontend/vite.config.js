import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // mounting a fence pays for a lazy language import and jsdom CSS work
    // in seconds; the 5s default measures the machine, not the logic
    testTimeout: 30000,
  },
})
