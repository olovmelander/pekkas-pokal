module.exports = {
  // Environment setup
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  
  // Extends configurations
  extends: [
    'eslint:recommended'
  ],
  
  // Parser options
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  
  // Global variables
  globals: {
    // Chart.js
    Chart: 'readonly',
    
    // Papa Parse
    Papa: 'readonly',
    
    // Application globals
    PekkasPokalApp: 'writable',
    DataManager: 'writable',
    AchievementEngine: 'writable',
    ChartManager: 'writable',
    UIComponents: 'writable',
    Statistics: 'writable',
    FilterManager: 'writable',
    
    // Achievement system
    ACHIEVEMENT_DEFINITIONS: 'readonly',
    ACHIEVEMENT_CATEGORIES: 'readonly',
    ACHIEVEMENT_RARITIES: 'readonly',
    AchievementHelpers: 'readonly',
    
    // Utilities
    StringUtils: 'readonly',
    NumberUtils: 'readonly',
    DateUtils: 'readonly',
    ArrayUtils: 'readonly',
    ObjectUtils: 'readonly',
    DOMUtils: 'readonly',
    ValidationUtils: 'readonly',
    ErrorUtils: 'readonly',
    PerformanceUtils: 'readonly',
    Utils: 'readonly'
  },
  
  // Rules configuration
  rules: {
    // Possible Errors
    'no-console': ['warn', { 
      allow: ['warn', 'error', 'info'] 
    }],
    'no-debugger': 'warn',
    'no-alert': 'warn',
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_' 
    }],
    
    // Best Practices
    'eqeqeq': ['error', 'always'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-return-assign': 'error',
    'no-self-compare': 'error',
    'no-throw-literal': 'error',
    'no-unused-expressions': 'error',
    'no-useless-call': 'error',
    'no-useless-concat': 'error',
    'prefer-promise-reject-errors': 'error',
    'radix': 'error',
    'yoda': 'error',
    
    // Variables
    'no-delete-var': 'error',
    'no-undef': 'error',
    'no-undef-init': 'error',
    'no-use-before-define': ['error', { 
      functions: false, 
      classes: true 
    }],
    
    // Stylistic Issues
    'array-bracket-spacing': ['error', 'never'],
    'block-spacing': 'error',
    'brace-style': ['error', '1tbs', { 
      allowSingleLine: true 
    }],
    'camelcase': ['error', { 
      properties: 'never' 
    }],
    'comma-dangle': ['error', 'never'],
    'comma-spacing': 'error',
    'comma-style': 'error',
    'computed-property-spacing': 'error',
    'eol-last': 'error',
    'func-call-spacing': 'error',
    'indent': ['error', 2, { 
      SwitchCase: 1,
      MemberExpression: 1 
    }],
    'key-spacing': 'error',
    'keyword-spacing': 'error',
    'linebreak-style': ['error', 'unix'],
    'max-len': ['warn', { 
      code: 120,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true 
    }],
    'no-multiple-empty-lines': ['error', { 
      max: 2, 
      maxEOF: 1 
    }],
    'no-trailing-spaces': 'error',
    'object-curly-spacing': ['error', 'always'],
    'quotes': ['error', 'single', { 
      avoidEscape: true,
      allowTemplateLiterals: true 
    }],
    'semi': ['error', 'always'],
    'semi-spacing': 'error',
    'space-before-blocks': 'error',
    'space-before-function-paren': ['error', {
      anonymous: 'always',
      named: 'never',
      asyncArrow: 'always'
    }],
    'space-in-parens': 'error',
    'space-infix-ops': 'error',
    'space-unary-ops': 'error',
    
    // ES6+ Features
    'arrow-spacing': 'error',
    'constructor-super': 'error',
    'no-class-assign': 'error',
    'no-const-assign': 'error',
    'no-dupe-class-members': 'error',
    'no-duplicate-imports': 'error',
    'no-new-symbol': 'error',
    'no-this-before-super': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-constructor': 'error',
    'no-useless-rename': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-const': 'error',
    'prefer-destructuring': ['error', {
      array: false,
      object: true
    }],
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    'prefer-template': 'error',
    'rest-spread-spacing': 'error',
    'symbol-description': 'error',
    'template-curly-spacing': 'error',
    
    // Custom rules for this project
    'complexity': ['warn', 15],
    'max-depth': ['warn', 4],
    'max-nested-callbacks': ['warn', 3],
    'max-params': ['warn', 5],
    'max-statements': ['warn', 25]
  },
  
  // Override rules for specific files
  overrides: [
    {
      // Relaxed rules for configuration files
      files: [
        '*.config.js',
        '.eslintrc.js',
        'vite.config.js'
      ],
      rules: {
        'no-console': 'off'
      }
    },
    
    {
      // Specific rules for utility files
      files: [
        'src/scripts/utils.js'
      ],
      rules: {
        'max-statements': 'off',
        'max-len': 'off'
      }
    },
    
    {
      // Rules for data files
      files: [
        'src/data/*.js'
      ],
      rules: {
        'max-len': 'off',
        'quotes': 'off'
      }
    }
  ],
  
  // Ignore patterns
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '*.min.js',
    'coverage/',
    '.cache/'
  ]
};