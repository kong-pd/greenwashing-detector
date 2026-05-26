import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All /api/* requests forwarded to FastAPI backend
      '/api': 'http://localhost:8000',
    },
  },
})
