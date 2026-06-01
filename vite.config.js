import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        proxyTimeout: 10000,
        timeout: 10000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[proxy] server unreachable:', err.code)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Pool server not running on :4000 — start with: npm run dev' }))
            } else {
              res.end()
            }
          })
        },
      },
    },
  },
})
