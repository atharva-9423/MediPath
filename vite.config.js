import { defineConfig } from 'vite';

export default defineConfig({
  // Use local cache directory to prevent EPERM file locking issues on Windows / OneDrive
  cacheDir: './.vite_cache',
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 100
    },
    hmr: {
      overlay: true
    },
    allowedHosts: ['all']
  }
});
