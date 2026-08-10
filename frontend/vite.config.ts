import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  // Single source of truth for the app version — injected from package.json.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/workflows': 'http://localhost:3001',
      '/scripts':   'http://localhost:3001',
      '/runs':      'http://localhost:3001',
      '/triggers':  'http://localhost:3001',
      '/health':    'http://localhost:3001',
      '/stats':     'http://localhost:3001',
      '/services':  'http://localhost:3001',
      '/webhooks':  'http://localhost:3001',
      '/plugins':   'http://localhost:3001',
      '/secrets':   'http://localhost:3001',
      '/datastore': 'http://localhost:3001',
      '/assistant': 'http://localhost:3001',
      '/housekeeping':     'http://localhost:3001',
      '/artifact-history': 'http://localhost:3001',
      '/admin':     'http://localhost:3001',
      '/api':       'http://localhost:3001',
      '/files':     'http://localhost:3001',
      '/media':     'http://localhost:3001',
    },
  },
})
