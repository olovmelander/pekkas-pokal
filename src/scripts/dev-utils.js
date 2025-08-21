#!/usr/bin/env node

/**
 * Development Utilities for Pekkas Pokal
 * Helper scripts for development tasks
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Utility functions
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.bright}${colors.cyan}🏆 ${msg}${colors.reset}\n`)
};

// Development utilities
class DevUtils {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.srcDir = path.join(this.rootDir, 'src');
    this.publicDir = path.join(this.rootDir, 'public');
  }

  /**
   * Validate project structure
   */
  validateStructure() {
    log.title('Validating Project Structure');

    const requiredDirs = [
      'src/styles',
      'src/scripts', 
      'src/data',
      'public'
    ];

    const requiredFiles = [
      'src/styles/main.css',
      'src/styles/components.css',
      'src/styles/layout.css',
      'src/styles/animations.css',
      'src/styles/responsive.css',
      'src/scripts/main.js',
      'src/scripts/data-manager.js',
      'src/scripts/achievement-engine.js',
      'src/scripts/chart-manager.js',
      'src/scripts/ui-components.js',
      'src/scripts/statistics.js',
      'src/scripts/filters.js',
      'src/scripts/utils.js',
      'src/data/achievements.js',
      'public/index.html',
      'public/manifest.json',
      'package.json'
    ];

    let valid = true;

    // Check directories
    requiredDirs.forEach(dir => {
      const fullPath = path.join(this.rootDir, dir);
      if (fs.existsSync(fullPath)) {
        log.success(`Directory exists: ${dir}`);
      } else {
        log.error(`Missing directory: ${dir}`);
        valid = false;
      }
    });

    // Check files
    requiredFiles.forEach(file => {
      const fullPath = path.join(this.rootDir, file);
      if (fs.existsSync(fullPath)) {
        log.success(`File exists: ${file}`);
      } else {
        log.error(`Missing file: ${file}`);
        valid = false;
      }
    });

    if (valid) {
      log.success('\n🎉 Project structure is valid!');
    } else {
      log.error('\n💥 Project structure validation failed!');
      process.exit(1);
    }
  }

  /**
   * Analyze CSS file sizes
   */
  analyzeCSSSize() {
    log.title('Analyzing CSS File Sizes');

    const cssFiles = [
      'src/styles/main.css',
      'src/styles/components.css',
      'src/styles/layout.css',
      'src/styles/animations.css',
      'src/styles/responsive.css'
    ];

    let totalSize = 0;
    const fileSizes = [];

    cssFiles.forEach(file => {
      const fullPath = path.join(this.rootDir, file);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        totalSize += stats.size;
        fileSizes.push({ file, size: sizeKB });
        log.info(`${file}: ${sizeKB} KB`);
      }
    });

    const totalKB = (totalSize / 1024).toFixed(2);
    log.success(`\nTotal CSS size: ${totalKB} KB`);

    if (totalSize > 100 * 1024) { // 100KB
      log.warning('CSS files are getting large. Consider optimization.');
    }

    return fileSizes;
  }

  /**
   * Analyze JavaScript file sizes
   */
  analyzeJSSize() {
    log.title('Analyzing JavaScript File Sizes');

    const jsFiles = [
      'src/scripts/main.js',
      'src/scripts/data-manager.js',
      'src/scripts/achievement-engine.js',
      'src/scripts/chart-manager.js',
      'src/scripts/ui-components.js',
      'src/scripts/statistics.js',
      'src/scripts/filters.js',
      'src/scripts/utils.js',
      'src/data/achievements.js'
    ];

    let totalSize = 0;
    const fileSizes = [];

    jsFiles.forEach(file => {
      const fullPath = path.join(this.rootDir, file);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        totalSize += stats.size;
        fileSizes.push({ file, size: sizeKB });
        log.info(`${file}: ${sizeKB} KB`);
      }
    });

    const totalKB = (totalSize / 1024).toFixed(2);
    log.success(`\nTotal JS size: ${totalKB} KB`);

    if (totalSize > 500 * 1024) { // 500KB
      log.warning('JavaScript files are getting large. Consider code splitting.');
    }

    return fileSizes;
  }

  /**
   * Count lines of code
   */
  countLinesOfCode() {
    log.title('Counting Lines of Code');

    const countLines = (filePath) => {
      if (!fs.existsSync(filePath)) return 0;
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.split('\n').filter(line => line.trim() !== '').length;
    };

    const fileTypes = {
      'JavaScript': ['src/scripts/*.js', 'src/data/*.js'],
      'CSS': ['src/styles/*.css'],
      'HTML': ['public/*.html'],
      'Config': ['*.js', '*.json', '*.md']
    };

    let totalLines = 0;

    Object.entries(fileTypes).forEach(([type, patterns]) => {
      let typeLines = 0;
      
      patterns.forEach(pattern => {
        const files = this.globSync(pattern);
        files.forEach(file => {
          const lines = countLines(file);
          typeLines += lines;
        });
      });

      log.info(`${type}: ${typeLines} lines`);
      totalLines += typeLines;
    });

    log.success(`\nTotal lines of code: ${totalLines}`);
    return totalLines;
  }

  /**
   * Simple glob implementation
   */
  globSync(pattern) {
    const fullPattern = path.join(this.rootDir, pattern);
    const dir = path.dirname(fullPattern);
    const filename = path.basename(fullPattern);
    
    if (!fs.existsSync(dir)) return [];
    
    const files = fs.readdirSync(dir);
    
    if (filename.includes('*')) {
      const regex = new RegExp(filename.replace(/\*/g, '.*'));
      return files
        .filter(file => regex.test(file))
        .map(file => path.join(dir, file));
    } else {
      const fullPath = path.join(dir, filename);
      return fs.existsSync(fullPath) ? [fullPath] : [];
    }
  }

  /**
   * Check for TODO comments
   */
  findTodos() {
    log.title('Finding TODO Comments');

    const searchFiles = [
      'src/scripts/*.js',
      'src/data/*.js',
      'src/styles/*.css'
    ];

    let todoCount = 0;

    searchFiles.forEach(pattern => {
      const files = this.globSync(pattern);
      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
            const relativePath = path.relative(this.rootDir, file);
            log.warning(`${relativePath}:${index + 1} - ${line.trim()}`);
            todoCount++;
          }
        });
      });
    });

    if (todoCount === 0) {
      log.success('No TODO comments found! 🎉');
    } else {
      log.info(`\nFound ${todoCount} TODO comments`);
    }

    return todoCount;
  }

  /**
   * Generate development report
   */
  generateReport() {
    log.title('Generating Development Report');

    const report = {
      timestamp: new Date().toISOString(),
      structure: 'valid',
      files: {
        css: this.analyzeCSSSize(),
        js: this.analyzeJSSize()
      },
      linesOfCode: this.countLinesOfCode(),
      todos: this.findTodos()
    };

    const reportPath = path.join(this.rootDir, 'dev-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    log.success(`\nDevelopment report saved to: dev-report.json`);
    return report;
  }

  /**
   * Setup git hooks
   */
  setupGitHooks() {
    log.title('Setting up Git Hooks');

    const preCommitHook = `#!/bin/sh
# Pre-commit hook for Pekkas Pokal

echo "🔍 Running pre-commit checks..."

# Run linting
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Linting failed. Please fix errors before committing."
  exit 1
fi

# Run validation
node scripts/dev-utils.js validate
if [ $? -ne 0 ]; then
  echo "❌ Project validation failed."
  exit 1
fi

echo "✅ Pre-commit checks passed!"
`;

    const hookPath = path.join(this.rootDir, '.git', 'hooks', 'pre-commit');
    
    try {
      fs.writeFileSync(hookPath, preCommitHook);
      fs.chmodSync(hookPath, 0o755);
      log.success('Git pre-commit hook installed');
    } catch (error) {
      log.warning('Could not install git hooks (not a git repository?)');
    }
  }

  /**
   * Clean development artifacts
   */
  clean() {
    log.title('Cleaning Development Artifacts');

    const cleanPaths = [
      'node_modules/.cache',
      'dist',
      '.vite',
      'dev-report.json'
    ];

    cleanPaths.forEach(cleanPath => {
      const fullPath = path.join(this.rootDir, cleanPath);
      if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory()) {
          execSync(`rm -rf "${fullPath}"`);
        } else {
          fs.unlinkSync(fullPath);
        }
        log.success(`Cleaned: ${cleanPath}`);
      }
    });

    log.success('\n🧹 Cleanup complete!');
  }
}

// CLI interface
function main() {
  const utils = new DevUtils();
  const command = process.argv[2];

  switch (command) {
    case 'validate':
      utils.validateStructure();
      break;
    
    case 'analyze':
      utils.analyzeCSSSize();
      utils.analyzeJSSize();
      break;
    
    case 'count':
      utils.countLinesOfCode();
      break;
    
    case 'todos':
      utils.findTodos();
      break;
    
    case 'report':
      utils.generateReport();
      break;
    
    case 'hooks':
      utils.setupGitHooks();
      break;
    
    case 'clean':
      utils.clean();
      break;
    
    case 'all':
      utils.validateStructure();
      utils.generateReport();
      break;
    
    default:
      console.log(`
${colors.bright}${colors.cyan}🏆 Pekkas Pokal Development Utilities${colors.reset}

Usage: node scripts/dev-utils.js [command]

Commands:
  validate  - Validate project structure
  analyze   - Analyze file sizes
  count     - Count lines of code
  todos     - Find TODO comments
  report    - Generate full development report
  hooks     - Setup git hooks
  clean     - Clean development artifacts
  all       - Run validation and generate report

Examples:
  node scripts/dev-utils.js validate
  node scripts/dev-utils.js report
  node scripts/dev-utils.js all
`);
      break;
  }
}

// Run CLI if called directly
if (require.main === module) {
  main();
}

module.exports = DevUtils;