/**
 * Utility Functions - Common helper functions used throughout the application
 */

// ===== STRING UTILITIES =====

const StringUtils = {
  /**
   * Capitalize first letter of string
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  /**
   * Convert to title case
   */
  toTitleCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  },

  /**
   * Create URL-friendly slug
   */
  slugify(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  /**
   * Truncate string with ellipsis
   */
  truncate(str, maxLength = 50, suffix = '...') {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length) + suffix;
  },

  /**
   * Extract initials from name
   */
  getInitials(name, maxInitials = 2) {
    if (!name) return '';
    
    return name
      .split(' ')
      .filter(part => part.length > 0)
      .slice(0, maxInitials)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  },

  /**
   * Format name for display
   */
  formatName(fullName, format = 'full') {
    if (!fullName) return '';
    
    const parts = fullName.trim().split(' ');
    
    switch (format) {
      case 'first':
        return parts[0];
      case 'last':
        return parts[parts.length - 1];
      case 'firstLast':
        return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
      case 'lastFirst':
        return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts[0]}` : parts[0];
      case 'initials':
        return this.getInitials(fullName);
      default:
        return fullName;
    }
  },

  /**
   * Clean and normalize text
   */
  normalize(str) {
    if (!str) return '';
    return str.trim().replace(/\s+/g, ' ');
  }
};

// ===== NUMBER UTILITIES =====

const NumberUtils = {
  /**
   * Format number with thousands separators
   */
  formatNumber(num, locale = 'sv-SE') {
    if (num == null) return '';
    return new Intl.NumberFormat(locale).format(num);
  },

  /**
   * Format as percentage
   */
  formatPercentage(num, decimals = 1) {
    if (num == null) return '';
    return `${num.toFixed(decimals)}%`;
  },

  /**
   * Format as ordinal (1st, 2nd, 3rd, etc.)
   */
  formatOrdinal(num, locale = 'sv-SE') {
    if (num == null) return '';
    
    if (locale === 'sv-SE') {
      // Swedish ordinals
      if (num === 1) return '1:a';
      if (num === 2) return '2:a';
      return `${num}:e`;
    } else {
      // English ordinals
      const suffixes = ['th', 'st', 'nd', 'rd'];
      const mod = num % 100;
      return num + (suffixes[(mod - 20) % 10] || suffixes[mod] || suffixes[0]);
    }
  },

  /**
   * Round to specified decimal places
   */
  round(num, decimals = 2) {
    if (num == null) return 0;
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  },

  /**
   * Clamp number between min and max
   */
  clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  },

  /**
   * Check if number is in range
   */
  inRange(num, min, max) {
    return num >= min && num <= max;
  },

  /**
   * Generate random integer between min and max (inclusive)
   */
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Calculate average of array
   */
  average(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, num) => acc + (num || 0), 0);
    return sum / numbers.length;
  },

  /**
   * Find median of array
   */
  median(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return 0;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
};

// ===== DATE UTILITIES =====

const DateUtils = {
  /**
   * Format date for display
   */
  formatDate(date, format = 'sv-SE', options = {}) {
    if (!date) return '';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) return '';
    
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    return dateObj.toLocaleDateString(format, { ...defaultOptions, ...options });
  },

  /**
   * Get relative time (e.g., "2 days ago")
   */
  getRelativeTime(date, locale = 'sv-SE') {
    if (!date) return '';
    
    const now = new Date();
    const targetDate = date instanceof Date ? date : new Date(date);
    const diffInSeconds = Math.floor((now - targetDate) / 1000);
    
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    
    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 }
    ];
    
    for (const interval of intervals) {
      const count = Math.floor(Math.abs(diffInSeconds) / interval.seconds);
      if (count >= 1) {
        return rtf.format(diffInSeconds < 0 ? count : -count, interval.label);
      }
    }
    
    return rtf.format(0, 'second');
  },

  /**
   * Check if date is valid
   */
  isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
  },

  /**
   * Get age from birth year
   */
  getAge(birthYear) {
    if (!birthYear) return null;
    return new Date().getFullYear() - birthYear;
  },

  /**
   * Get year from date
   */
  getYear(date) {
    if (!date) return null;
    const dateObj = date instanceof Date ? date : new Date(date);
    return this.isValidDate(dateObj) ? dateObj.getFullYear() : null;
  }
};

// ===== ARRAY UTILITIES =====

const ArrayUtils = {
  /**
   * Remove duplicates from array
   */
  unique(array, key = null) {
    if (!Array.isArray(array)) return [];
    
    if (key) {
      const seen = new Set();
      return array.filter(item => {
        const value = typeof key === 'function' ? key(item) : item[key];
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    }
    
    return [...new Set(array)];
  },

  /**
   * Group array by key
   */
  groupBy(array, key) {
    if (!Array.isArray(array)) return {};
    
    return array.reduce((groups, item) => {
      const value = typeof key === 'function' ? key(item) : item[key];
      if (!groups[value]) groups[value] = [];
      groups[value].push(item);
      return groups;
    }, {});
  },

  /**
   * Sort array by multiple keys
   */
  multiSort(array, sortKeys) {
    if (!Array.isArray(array)) return [];
    
    return [...array].sort((a, b) => {
      for (const { key, direction = 'asc' } of sortKeys) {
        const aVal = typeof key === 'function' ? key(a) : a[key];
        const bVal = typeof key === 'function' ? key(b) : b[key];
        
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  },

  /**
   * Shuffle array randomly
   */
  shuffle(array) {
    if (!Array.isArray(array)) return [];
    
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  /**
   * Get random element from array
   */
  random(array) {
    if (!Array.isArray(array) || array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
  },

  /**
   * Chunk array into smaller arrays
   */
  chunk(array, size) {
    if (!Array.isArray(array) || size <= 0) return [];
    
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  /**
   * Find item with maximum value
   */
  maxBy(array, key) {
    if (!Array.isArray(array) || array.length === 0) return undefined;
    
    return array.reduce((max, item) => {
      const value = typeof key === 'function' ? key(item) : item[key];
      const maxValue = typeof key === 'function' ? key(max) : max[key];
      return value > maxValue ? item : max;
    });
  },

  /**
   * Find item with minimum value
   */
  minBy(array, key) {
    if (!Array.isArray(array) || array.length === 0) return undefined;
    
    return array.reduce((min, item) => {
      const value = typeof key === 'function' ? key(item) : item[key];
      const minValue = typeof key === 'function' ? key(min) : min[key];
      return value < minValue ? item : min;
    });
  }
};

// ===== OBJECT UTILITIES =====

const ObjectUtils = {
  /**
   * Deep clone object
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  },

  /**
   * Deep merge objects
   */
  deepMerge(target, ...sources) {
    if (!sources.length) return target;
    
    const source = sources.shift();
    
    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
    
    return this.deepMerge(target, ...sources);
  },

  /**
   * Check if value is an object
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  },

  /**
   * Get nested property safely
   */
  get(obj, path, defaultValue = undefined) {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result == null || typeof result !== 'object') {
        return defaultValue;
      }
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  },

  /**
   * Set nested property safely
   */
  set(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;
    
    for (const key of keys) {
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
    return obj;
  },

  /**
   * Pick specific properties from object
   */
  pick(obj, keys) {
    const picked = {};
    for (const key of keys) {
      if (key in obj) {
        picked[key] = obj[key];
      }
    }
    return picked;
  },

  /**
   * Omit specific properties from object
   */
  omit(obj, keys) {
    const omitted = { ...obj };
    for (const key of keys) {
      delete omitted[key];
    }
    return omitted;
  }
};

// ===== DOM UTILITIES =====

const DOMUtils = {
  /**
   * Create element with attributes and content
   */
  createElement(tag, attributes = {}, content = '') {
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
  },

  /**
   * Find closest parent element matching selector
   */
  closest(element, selector) {
    if (!element || !element.closest) return null;
    return element.closest(selector);
  },

  /**
   * Check if element is visible
   */
  isVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0';
  },

  /**
   * Scroll element into view smoothly
   */
  scrollIntoView(element, options = {}) {
    if (!element) return;
    
    const defaultOptions = {
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest'
    };
    
    element.scrollIntoView({ ...defaultOptions, ...options });
  },

  /**
   * Add event listener with automatic cleanup
   */
  addEventListener(element, event, handler, options = {}) {
    if (!element) return () => {};
    
    element.addEventListener(event, handler, options);
    
    return () => {
      element.removeEventListener(event, handler, options);
    };
  },

  /**
   * Debounce function calls
   */
  debounce(func, wait, immediate = false) {
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
  },

  /**
   * Throttle function calls
   */
  throttle(func, limit) {
    let inThrottle;
    
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
};

// ===== VALIDATION UTILITIES =====

const ValidationUtils = {
  /**
   * Validate email format
   */
  isEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Validate URL format
   */
  isUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if string is numeric
   */
  isNumeric(str) {
    return !isNaN(str) && !isNaN(parseFloat(str));
  },

  /**
   * Validate required field
   */
  isRequired(value) {
    return value != null && value !== '' && value !== undefined;
  },

  /**
   * Validate minimum length
   */
  minLength(value, min) {
    return value && value.length >= min;
  },

  /**
   * Validate maximum length
   */
  maxLength(value, max) {
    return !value || value.length <= max;
  },

  /**
   * Validate range
   */
  inRange(value, min, max) {
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
  }
};

// ===== ERROR HANDLING UTILITIES =====

const ErrorUtils = {
  /**
   * Safe function execution with error handling
   */
  safe(fn, fallback = null) {
    try {
      return fn();
    } catch (error) {
      console.error('Safe execution error:', error);
      return fallback;
    }
  },

  /**
   * Create error with additional context
   */
  createError(message, context = {}) {
    const error = new Error(message);
    error.context = context;
    error.timestamp = new Date().toISOString();
    return error;
  },

  /**
   * Log error with context
   */
  logError(error, context = {}) {
    console.error('Application Error:', {
      message: error.message,
      stack: error.stack,
      context: context,
      timestamp: new Date().toISOString()
    });
  }
};

// ===== PERFORMANCE UTILITIES =====

const PerformanceUtils = {
  /**
   * Measure function execution time
   */
  measure(fn, label = 'Function') {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    
    console.log(`${label} took ${(end - start).toFixed(2)} milliseconds`);
    return result;
  },

  /**
   * Create performance timer
   */
  createTimer(label) {
    const start = performance.now();
    
    return {
      stop: () => {
        const end = performance.now();
        const duration = end - start;
        console.log(`${label}: ${duration.toFixed(2)}ms`);
        return duration;
      },
      lap: (lapLabel) => {
        const lap = performance.now();
        const duration = lap - start;
        console.log(`${label} - ${lapLabel}: ${duration.toFixed(2)}ms`);
        return duration;
      }
    };
  }
};

// Export utilities for global access
window.StringUtils = StringUtils;
window.NumberUtils = NumberUtils;
window.DateUtils = DateUtils;
window.ArrayUtils = ArrayUtils;
window.ObjectUtils = ObjectUtils;
window.DOMUtils = DOMUtils;
window.ValidationUtils = ValidationUtils;
window.ErrorUtils = ErrorUtils;
window.PerformanceUtils = PerformanceUtils;

// Combined utils object
window.Utils = {
  String: StringUtils,
  Number: NumberUtils,
  Date: DateUtils,
  Array: ArrayUtils,
  Object: ObjectUtils,
  DOM: DOMUtils,
  Validation: ValidationUtils,
  Error: ErrorUtils,
  Performance: PerformanceUtils
};