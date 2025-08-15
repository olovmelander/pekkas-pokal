/**
 * Utility Functions - Common helper functions used throughout the application
 * Provides date formatting, validation, DOM manipulation, and other utilities
 */

class Utils {
  /**
   * Format date to Swedish locale
   */
  static formatDate(date, options = {}) {
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    if (!(date instanceof Date) || isNaN(date)) {
      return 'Ogiltigt datum';
    }
    
    return date.toLocaleDateString('sv-SE', finalOptions);
  }
  
  /**
   * Format date to short format (YYYY-MM-DD)
   */
  static formatDateShort(date) {
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    if (!(date instanceof Date) || isNaN(date)) {
      return '';
    }
    
    return date.toISOString().split('T')[0];
  }
  
  /**
   * Get relative time (e.g., "2 dagar sedan")
   */
  static getRelativeTime(date) {
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    if (!(date instanceof Date) || isNaN(date)) {
      return 'Okänt';
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} dag${diffDays === 1 ? '' : 'ar'} sedan`;
    } else if (diffHours > 0) {
      return `${diffHours} timm${diffHours === 1 ? 'e' : 'ar'} sedan`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minut${diffMinutes === 1 ? '' : 'er'} sedan`;
    } else {
      return 'Nyss';
    }
  }
  
  /**
   * Debounce function to limit function calls
   */
  static debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func(...args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func(...args);
    };
  }
  
  /**
   * Throttle function to limit function calls
   */
  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  /**
   * Deep clone an object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }
    
    if (typeof obj === 'object') {
      const cloned = {};
      Object.keys(obj).forEach(key => {
        cloned[key] = this.deepClone(obj[key]);
      });
      return cloned;
    }
  }
  
  /**
   * Validate email address
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Validate Swedish personal number (personnummer)
   */
  static isValidPersonalNumber(pnr) {
    // Remove hyphens and spaces
    const cleaned = pnr.replace(/[\s-]/g, '');
    
    // Check length (10 or 12 digits)
    if (!/^\d{10}$|^\d{12}$/.test(cleaned)) {
      return false;
    }
    
    // Use 10-digit format for validation
    const shortPnr = cleaned.length === 12 ? cleaned.slice(2) : cleaned;
    
    // Luhn algorithm validation
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let digit = parseInt(shortPnr[i]);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) {
          digit = Math.floor(digit / 10) + (digit % 10);
        }
      }
      sum += digit;
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(shortPnr[9]);
  }
  
  /**
   * Generate random ID
   */
  static generateId(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`;
  }
  
  /**
   * Format file size
   */
  static formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  /**
   * Capitalize first letter of each word
   */
  static titleCase(str) {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
  
  /**
   * Remove Swedish accents for sorting/searching
   */
  static removeAccents(str) {
    const accents = {
      'å': 'a', 'ä': 'a', 'ö': 'o',
      'Å': 'A', 'Ä': 'A', 'Ö': 'O'
    };
    
    return str.replace(/[åäöÅÄÖ]/g, (match) => accents[match] || match);
  }
  
  /**
   * Sort array of objects by Swedish locale
   */
  static sortSwedish(array, key, ascending = true) {
    return array.sort((a, b) => {
      const aVal = typeof a === 'object' ? a[key] : a;
      const bVal = typeof b === 'object' ? b[key] : b;
      
      const comparison = aVal.localeCompare(bVal, 'sv-SE');
      return ascending ? comparison : -comparison;
    });
  }
  
  /**
   * Calculate ordinal position (1st, 2nd, 3rd, etc.) in Swedish
   */
  static getOrdinalSwedish(num) {
    const num_int = parseInt(num);
    
    if (num_int === 1) return '1:a';
    if (num_int === 2) return '2:a';
    if (num_int === 3) return '3:e';
    
    return `${num_int}:e`;
  }
  
  /**
   * Convert CSV string to array of objects
   */
  static parseCSV(csvString, delimiter = ',') {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], delimiter);
      if (values.length === headers.length) {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = values[index];
        });
        data.push(obj);
      }
    }
    
    return data;
  }
  
  /**
   * Parse a single CSV line, handling quoted values
   */
  static parseCSVLine(line, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }
  
  /**
   * Convert array of objects to CSV string
   */
  static arrayToCSV(array, headers = null) {
    if (!array.length) return '';
    
    const actualHeaders = headers || Object.keys(array[0]);
    const csvHeaders = actualHeaders.map(h => `"${h}"`).join(',');
    
    const csvRows = array.map(obj => 
      actualHeaders.map(header => {
        const value = obj[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );
    
    return [csvHeaders, ...csvRows].join('\n');
  }
  
  /**
   * Download data as file
   */
  static downloadFile(data, filename, type = 'application/json') {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }
  
  /**
   * Read file as text
   */
  static readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
  
  /**
   * Smooth scroll to element
   */
  static scrollToElement(element, offset = 0, behavior = 'smooth') {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    
    if (!element) return;
    
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;
    
    window.scrollTo({
      top: offsetPosition,
      behavior: behavior
    });
  }
  
  /**
   * Check if element is in viewport
   */
  static isInViewport(element) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }
  
  /**
   * Add event listener with cleanup
   */
  static addEventListenerWithCleanup(element, event, handler, options = {}) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    
    if (!element) return null;
    
    element.addEventListener(event, handler, options);
    
    return () => {
      element.removeEventListener(event, handler, options);
    };
  }
  
  /**
   * Create element with attributes and content
   */
  static createElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'dataset') {
        Object.entries(value).forEach(([dataKey, dataValue]) => {
          element.dataset[dataKey] = dataValue;
        });
      } else {
        element.setAttribute(key, value);
      }
    });
    
    if (content) {
      if (typeof content === 'string') {
        element.innerHTML = content;
      } else {
        element.appendChild(content);
      }
    }
    
    return element;
  }
  
  /**
   * Wait for specified time
   */
  static wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Retry function with exponential backoff
   */
  static async retry(fn, maxAttempts = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await this.wait(delay);
      }
    }
  }
  
  /**
   * Check if device is mobile
   */
  static isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  }
  
  /**
   * Check if device is iOS
   */
  static isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }
  
  /**
   * Check if PWA is installed
   */
  static isPWAInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }
  
  /**
   * Get browser info
   */
  static getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    else if (ua.includes('Opera')) browser = 'Opera';
    
    return {
      browser,
      userAgent: ua,
      language: navigator.language || navigator.userLanguage,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine
    };
  }
  
  /**
   * Copy text to clipboard
   */
  static async copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
      } catch (err) {
        throw new Error('Failed to copy text');
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }
  
  /**
   * Generate color palette
   */
  static generateColorPalette(count, saturation = 70, lightness = 50) {
    const colors = [];
    const hueStep = 360 / count;
    
    for (let i = 0; i < count; i++) {
      const hue = i * hueStep;
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    
    return colors;
  }
  
  /**
   * Validate competition data
   */
  static validateCompetitionData(data) {
    const errors = [];
    
    if (!data.year || isNaN(data.year) || data.year < 2000 || data.year > 2100) {
      errors.push('Ogiltigt år');
    }
    
    if (!data.name || data.name.trim().length === 0) {
      errors.push('Tävlingsnamn krävs');
    }
    
    if (!data.location || data.location.trim().length === 0) {
      errors.push('Plats krävs');
    }
    
    if (data.date && isNaN(new Date(data.date))) {
      errors.push('Ogiltigt datum');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate participant data
   */
  static validateParticipantData(data) {
    const errors = [];
    
    if (!data.name || data.name.trim().length === 0) {
      errors.push('Namn krävs');
    }
    
    if (data.email && !this.isValidEmail(data.email)) {
      errors.push('Ogiltig e-postadress');
    }
    
    if (data.status && !['active', 'inactive', 'retired'].includes(data.status)) {
      errors.push('Ogiltig status');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Make Utils available globally
window.Utils = Utils;