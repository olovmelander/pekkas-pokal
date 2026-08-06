import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';

/**
 * Lists the years that have a photo in public/photos/ so the app can load them
 * with one request instead of probing (and 404-ing on) every year.
 * Missing manifest is fine — the app falls back to probing.
 */
function photoManifest() {
  return {
    name: 'photo-manifest',
    closeBundle() {
      const src = resolve(__dirname, 'public/photos');
      const outDir = resolve(__dirname, 'dist/photos');
      if (!existsSync(src)) return;
      const years = readdirSync(src)
        .map((f) => /^(\d{4})\.(jpe?g|png|webp)$/i.exec(f))
        .filter(Boolean)
        .map((m) => ({ year: Number(m[1]), ext: m[2].toLowerCase() }))
        .sort((a, b) => b.year - a.year);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, 'index.json'), JSON.stringify(years));
    }
  };
}

export default defineConfig({
  plugins: [photoManifest()],

  // Base path for GitHub Pages - repository name.
  // PAGES_BASE overrides it, so the same build can target a mirror repo
  // (e.g. PAGES_BASE=/pekkas-pokal-live/ npm run build).
  base: process.env.NODE_ENV === 'production'
    ? (process.env.PAGES_BASE || '/pekkas-pokal/')
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