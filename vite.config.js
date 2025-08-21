import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Root directory
  root: 'public',
  
  // Build configuration
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    
    // Optimize dependencies
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html')
      },
      
      // External dependencies (loaded via CDN)
      external: [
        'chart.js',
        'papaparse'
      ],
      
      output: {
        // Chunk splitting for better caching
        manualChunks: {
          'app-core': [
            '/src/scripts/main.js',
            '/src/scripts/data-manager.js'
          ],
          'app-ui': [
            '/src/scripts/ui-components.js',
            '/src/scripts/chart-manager.js'
          ],
          'app-logic': [
            '/src/scripts/achievement-engine.js',
            '/src/scripts/statistics.js',
            '/src/scripts/filters.js'
          ]
        }
      }
    },
    
    // Asset optimization
    assetsInlineLimit: 4096,
    
    // Source maps for debugging
    sourcemap: true,
    
    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  
  // Development server
  server: {
    port: 8000,
    host: true,
    open: true,
    
    // Proxy for development APIs (if needed)
    proxy: {
      // '/api': {
      //   target: 'http://localhost:3000',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api/, '')
      // }
    }
  },
  
  // Preview server (for production build testing)
  preview: {
    port: 8080,
    host: true,
    open: true
  },
  
  // Asset handling
  publicDir: '../src/data',
  
  // CSS configuration
  css: {
    devSourcemap: true,
    
    // PostCSS plugins
    postcss: {
      plugins: [
        // Add autoprefixer, cssnano, etc. if needed
      ]
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@styles': resolve(__dirname, 'src/styles'),
      '@scripts': resolve(__dirname, 'src/scripts'),
      '@data': resolve(__dirname, 'src/data')
    }
  },
  
  // Plugin configuration
  plugins: [
    // Add plugins as needed
  ],
  
  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __DEVELOPMENT__: JSON.stringify(process.env.NODE_ENV === 'development')
  },
  
  // Optimization
  optimizeDeps: {
    // Pre-bundle dependencies
    include: [
      'chart.js',
      'papaparse'
    ],
    
    // Exclude from optimization
    exclude: []
  },
  
  // Worker configuration
  worker: {
    format: 'es'
  },
  
  // PWA configuration (if using vite-plugin-pwa)
  // pwa: {
  //   registerType: 'autoUpdate',
  //   workbox: {
  //     globPatterns: ['**/*.{js,css,html,ico,png,svg}']
  //   },
  //   includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
  //   manifest: {
  //     name: 'Pekkas Pokal',
  //     short_name: 'PekkaPokal',
  //     description: 'Årlig tävling för vänner med omfattande statistik och datahantering',
  //     theme_color: '#667eea',
  //     icons: [
  //       {
  //         src: 'pwa-192x192.png',
  //         sizes: '192x192',
  //         type: 'image/png'
  //       },
  //       {
  //         src: 'pwa-512x512.png',
  //         sizes: '512x512',
  //         type: 'image/png'
  //       }
  //     ]
  //   }
  // }
});