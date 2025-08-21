import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Base path for GitHub Pages
  base: process.env.NODE_ENV === 'production' 
    ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] || 'pekkas-pokal'}/`
    : '/',
  
  // Root directory where index.html is located
  root: './',
  
  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    },
    
    // Don't inline small assets to preserve file structure
    assetsInlineLimit: 0
  },
  
  // Development server
  server: {
    port: 8000,
    host: true,
    open: true
  },
  
  // Preview server
  preview: {
    port: 8080,
    host: true
  }
});