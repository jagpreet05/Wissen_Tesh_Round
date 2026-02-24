import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite proxy — all /api and /login requests from the browser are forwarded
// to the Spring Boot backend on port 8080.
// This makes every request same-origin from the browser's perspective,
// so no CORS issues and credentials (session cookie) travel automatically.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api/** → http://localhost:8080/api/**
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // Forward /login (Spring Security form login endpoint)
      '/login': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
