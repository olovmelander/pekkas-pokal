# 🚀 Deployment Guide

This guide covers various deployment options for Pekkas Pokal.

## 📋 Prerequisites

- Node.js 16+ (for build tools)
- Git (for version control)
- Your competition data in CSV format

## 🏗️ Build Process

### 1. Prepare for Production

```bash
# Install dependencies
npm install

# Run linting and validation
npm run validate

# Build for production
npm run build
```

The build process will:
- ✅ Minify JavaScript and CSS
- ✅ Optimize images and assets
- ✅ Generate source maps
- ✅ Create service worker for PWA
- ✅ Output to `dist/` directory

### 2. Test Production Build

```bash
# Preview production build locally
npm run preview
```

## 🌐 Deployment Options

### GitHub Pages (Recommended)

Perfect for open source projects and free hosting.

#### Automatic Deployment

1. **Setup GitHub Actions** (create `.github/workflows/deploy.yml`):

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout
      uses: actions/checkout@v3
      
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Build
      run: npm run build
      
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      if: github.ref == 'refs/heads/main'
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./dist
```

2. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Set source to "Deploy from a branch"
   - Select `gh-pages` branch

#### Manual Deployment

```bash
# Build and deploy to GitHub Pages
npm run build
npm run deploy:gh-pages
```

### Netlify

Easy deployment with automatic builds from Git.

1. **Connect Repository**:
   - Sign up at [netlify.com](https://netlify.com)
   - Connect your GitHub repository

2. **Build Settings**:
   ```
   Base directory: (leave empty)
   Build command: npm run build
   Publish directory: dist
   ```

3. **Environment Variables** (if needed):
   ```
   NODE_VERSION=18
   NPM_VERSION=8
   ```

### Vercel

Optimized for modern web applications.

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   # First time deployment
   vercel
   
   # Subsequent deployments
   vercel --prod
   ```

3. **Configuration** (`vercel.json`):
   ```json
   {
     "buildCommand": "npm run build",
     "outputDirectory": "dist",
     "framework": null
   }
   ```

### Traditional Web Hosting

For cPanel, FTP, or other traditional hosting.

1. **Build locally**:
   ```bash
   npm run build
   ```

2. **Upload files**:
   - Upload contents of `dist/` folder to your web root
   - Ensure `index.html` is accessible

3. **Server Configuration**:
   - Enable gzip compression
   - Set proper MIME types
   - Configure caching headers

### Docker Deployment

For containerized environments.

1. **Create Dockerfile**:
   ```dockerfile
   # Build stage
   FROM node:18-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npm run build
   
   # Production stage
   FROM nginx:alpine
   COPY --from=builder /app/dist /usr/share/nginx/html
   COPY nginx.conf /etc/nginx/nginx.conf
   EXPOSE 80
   CMD ["nginx", "-g", "daemon off;"]
   ```

2. **Build and run**:
   ```bash
   docker build -t pekkas-pokal .
   docker run -p 8080:80 pekkas-pokal
   ```

## ⚙️ Configuration

### Environment Variables

Configure deployment-specific settings:

```bash
# Development
NODE_ENV=development
VITE_APP_TITLE="Pekkas Pokal (Dev)"

# Production
NODE_ENV=production
VITE_APP_TITLE="Pekkas Pokal"
VITE_BASE_URL="https://your-domain.com"
```

### Custom Domain

#### GitHub Pages
1. Add `CNAME` file to `public/` directory:
   ```
   your-domain.com
   ```

2. Configure DNS:
   ```
   Type: CNAME
   Name: www (or @)
   Value: username.github.io
   ```

#### Netlify/Vercel
- Follow their respective custom domain guides
- SSL certificates are automatically provided

### CSP (Content Security Policy)

For enhanced security, add CSP headers:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self';
  base-uri 'self';
  form-action 'self';
">
```

## 🔧 Server Configuration

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/pekkas-pokal;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Cache HTML files for shorter period
    location ~* \.html$ {
        expires 1h;
        add_header Cache-Control "public";
    }
    
    # Handle SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### Apache Configuration

```apache
# .htaccess
RewriteEngine On

# Handle SPA routing
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# Gzip compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/json
</IfModule>

# Cache control
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType text/html "access plus 1 hour"
</IfModule>
```

## 📊 Performance Optimization

### 1. Asset Optimization

```bash
# Optimize images before deployment
npm install -g imagemin-cli
imagemin src/assets/images/* --out-dir=dist/assets/images
```

### 2. Code Splitting

Already configured in Vite for optimal loading:
- Core app functionality
- UI components and charts
- Logic modules (achievements, statistics)

### 3. Service Worker

PWA features are automatically enabled:
- ✅ Offline support
- ✅ Asset caching
- ✅ Background updates

### 4. CDN Integration

```html
<!-- Use CDN for external libraries -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.4.1/papaparse.min.js"></script>
```

## 🛡️ Security Considerations

### 1. Data Privacy
- CSV data should not contain sensitive information
- Consider data anonymization for public deployments

### 2. Access Control
- For private competitions, implement authentication
- Use environment-based configurations

### 3. Input Validation
- Validate CSV data format
- Sanitize user inputs (if any)

## 📈 Monitoring

### Analytics Integration

```html
<!-- Google Analytics (optional) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### Error Tracking

```javascript
// Sentry.io integration (optional)
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: "production"
});
```

## 🔄 Update Process

### Automated Updates

1. **Update CSV data** in the repository
2. **Push to main branch**
3. **Automatic deployment** via GitHub Actions/Netlify/Vercel
4. **Users get updates** via service worker

### Manual Updates

```bash
# Update data
git add src/data/competition-data.csv
git commit -m "Update competition data"
git push origin main

# Deploy
npm run deploy
```

## 🚨 Troubleshooting

### Common Issues

1. **Build Fails**:
   ```bash
   # Clear cache and rebuild
   rm -rf node_modules dist
   npm install
   npm run build
   ```

2. **CSV Loading Issues**:
   - Check file encoding (UTF-8)
   - Verify CSV format
   - Check file permissions

3. **PWA Not Installing**:
   - Verify HTTPS deployment
   - Check manifest.json validity
   - Ensure service worker registration

4. **Performance Issues**:
   - Enable gzip compression
   - Check asset sizes
   - Verify CDN usage

### Debug Mode

```bash
# Run with debug information
DEBUG=true npm run build
```

## 📞 Support

For deployment issues:

1. Check the [GitHub Issues](../../issues)
2. Review deployment logs
3. Verify all prerequisites are met
4. Test locally before deploying

---

**Happy Deploying! 🚀**