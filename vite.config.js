import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Base path for GitHub Pages - repository name
  base: process.env.NODE_ENV === 'production' 
    ? '/pekkas-pokal/'  // Replace with your actual repository name
    : '/',
  
  // Root directory
  root: './',
  
  // Public directory for static assets
  publicDir: 'public',
  
  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
    
    // Copy static files
    copyPublicDir: true,
    
    // Don't inline assets
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