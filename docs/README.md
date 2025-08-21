# 🏆 Pekkas Pokal - Ultimate Competition Tracker

A modern, feature-rich web application for tracking annual competitions among friends with comprehensive statistics, achievements, and data visualization.

## ✨ Features

- **📊 Comprehensive Statistics** - Detailed analysis of competition data
- **🥇 Medal Tracking** - Olympic-style medal tallies and leaderboards  
- **🎖️ Achievement System** - 50+ unlockable achievements across multiple categories
- **📈 Interactive Charts** - Beautiful visualizations powered by Chart.js
- **🔍 Advanced Filtering** - Filter data by participant, timeframe, and competition type
- **📱 Responsive Design** - Optimized for desktop, tablet, and mobile
- **⚡ Fast Performance** - Efficient data processing and caching
- **🎨 Modern UI** - Clean, animated interface with dark theme

## 🚀 Quick Start

### Option 1: Simple Local Server
```bash
# Clone the repository
git clone <repository-url>
cd pekkas-pokal

# Serve with Python (Python 3)
python -m http.server 8000

# Or with Node.js
npx http-server . -p 8000

# Open http://localhost:8000
```

### Option 2: Development Setup
```bash
# Clone and install dependencies
git clone <repository-url>
cd pekkas-pokal
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 📁 Project Structure

```
pekkas-pokal/
├── 📁 src/
│   ├── 📁 styles/           # Modular CSS files
│   │   ├── main.css         # Core variables & base styles
│   │   ├── components.css   # Component-specific styles
│   │   ├── layout.css       # Layout & grid systems
│   │   ├── animations.css   # Animations & transitions
│   │   └── responsive.css   # Mobile responsive styles
│   ├── 📁 scripts/          # JavaScript modules
│   │   ├── main.js          # App initialization & coordination
│   │   ├── data-manager.js  # CSV loading & data processing
│   │   ├── achievement-engine.js # Achievement calculation logic
│   │   ├── chart-manager.js # Chart.js wrapper & configs
│   │   ├── ui-components.js # Reusable UI components
│   │   ├── statistics.js    # Statistics calculations
│   │   ├── filters.js       # Filter functionality
│   │   └── utils.js         # Utility functions
│   └── 📁 data/
│       ├── achievements.js  # Achievement definitions
│       ├── default-data.js  # Fallback data
│       └── competition-data.csv # Main data file
├── 📁 public/
│   ├── index.html          # Main HTML file
│   ├── manifest.json       # PWA manifest
│   └── sw.js              # Service worker
├── 📁 docs/               # Documentation
├── package.json           # Dependencies & scripts
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## 🏗️ Architecture

### Modular Design
The application is built with a modular architecture where each component has a specific responsibility:

- **Main App** (`main.js`) - Coordinates all modules and manages application state
- **Data Manager** (`data-manager.js`) - Handles CSV loading with multiple fallback methods
- **Achievement Engine** (`achievement-engine.js`) - Calculates all participant achievements
- **Chart Manager** (`chart-manager.js`) - Creates and manages all Chart.js visualizations
- **UI Components** (`ui-components.js`) - Renders all UI elements and handles interactions
- **Statistics** (`statistics.js`) - Performs statistical calculations and analysis
- **Filter Manager** (`filters.js`) - Handles all data filtering functionality
- **Utils** (`utils.js`) - Provides common utility functions

### CSS Architecture
CSS is organized into logical modules:

- **main.css** - CSS variables, typography, utilities
- **components.css** - Specific component styles
- **layout.css** - Grid systems and layout utilities
- **animations.css** - All animations and transitions
- **responsive.css** - Mobile-first responsive design

## 📊 Data Format

The application expects CSV data in the following format:

```csv
År,Tävling,Plats,Arrangör 3:a,Arrangör näst sist,Participant1,Participant2,...
2025,Competition Name,Location,Organizer1,Organizer2,1,2,...
```

### CSV Columns
- **År** - Year of competition
- **Tävling** - Competition name
- **Plats** - Location
- **Arrangör 3:a** - Third place organizer
- **Arrangör näst sist** - Second-to-last organizer
- **Participant Columns** - Position for each participant (1 = winner, empty/- = did not participate)

## 🎖️ Achievement System

The application includes 50+ achievements across 6 categories:

### Categories
- **🥇 Medals** - Based on competition results and medal counts
- **🔥 Streaks** - Consecutive wins, podium finishes, participation
- **⭐ Special** - Unique milestones and accomplishments
- **🎉 Fun** - Humorous and unusual achievements
- **👑 Legendary** - Rare and prestigious achievements
- **🌟 Mythic** - The most exclusive achievements

### Rarity System
- **Common** - Basic achievements, 1x point multiplier
- **Rare** - Moderate difficulty, 1.5x point multiplier
- **Epic** - Challenging achievements, 2x point multiplier
- **Legendary** - Very rare achievements, 3x point multiplier
- **Mythic** - Extremely rare achievements, 5x point multiplier

## 🛠️ Development

### Adding New Features

1. **New Achievement**
   ```javascript
   // Add to src/data/achievements.js
   {
     id: 'new_achievement',
     icon: '🎯',
     name: 'Achievement Name',
     desc: 'Achievement description',
     category: 'special',
     rarity: 'rare',
     points: 25
   }
   ```

2. **New Chart Type**
   ```javascript
   // Add method to ChartManager class
   createCustomChart(data) {
     // Chart implementation
   }
   ```

3. **New Filter**
   ```javascript
   // Add to FilterManager class
   applyCustomFilter(data, criteria) {
     // Filter implementation
   }
   ```

### Code Style Guidelines

- Use **ES6+ features** (classes, arrow functions, destructuring)
- **Modular design** - One class per file
- **Clear naming** - Descriptive variable and function names
- **Error handling** - Proper try/catch blocks
- **Comments** - JSDoc-style documentation
- **Performance** - Cache calculations when possible

### Testing
```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Run tests (when implemented)
npm test
```

## 🎨 Customization

### Theming
Colors and styles can be customized via CSS custom properties in `src/styles/main.css`:

```css
:root {
  --accent: #667eea;
  --bg-dark: #0f0f23;
  --text-primary: #ffffff;
  /* ... more variables */
}
```

### Adding Participants
Simply add new columns to the CSV file with participant names. The application will automatically detect and process new participants.

### Custom Achievements
Add new achievement definitions to `src/data/achievements.js` and implement calculation logic in `src/scripts/achievement-engine.js`.

## 📱 PWA Features

The application is a Progressive Web App with:

- **Offline support** via service worker
- **Installable** on mobile devices
- **App-like experience** when installed
- **Caching** for fast loading

## 🔧 Configuration

### Environment Variables
Configure the application via environment variables or modify defaults in the respective modules:

- **Cache expiry** - Modify cache timeout in modules
- **Chart options** - Customize Chart.js defaults in ChartManager
- **Animation settings** - Adjust timing in CSS animation variables

### Build Configuration
The application supports Vite for modern development:

```javascript
// vite.config.js
export default {
  // Custom Vite configuration
}
```

## 🚀 Deployment

### Static Hosting
Deploy to any static hosting service:

```bash
# Build for production
npm run build

# Deploy dist/ folder to:
# - GitHub Pages
# - Netlify
# - Vercel
# - Any static host
```

### GitHub Pages
```bash
# Deploy to GitHub Pages
npm run deploy
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Workflow
1. Check existing issues and features
2. Follow the code style guidelines
3. Add tests for new functionality
4. Update documentation as needed
5. Ensure all checks pass

## 📋 Browser Support

- **Chrome** 88+
- **Firefox** 85+
- **Safari** 14+
- **Edge** 88+

## 🔗 Dependencies

### Runtime
- **Chart.js** - Data visualization
- **Papa Parse** - CSV parsing

### Development
- **Vite** - Build tool and dev server
- **ESLint** - Code linting
- **Prettier** - Code formatting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Chart.js** for excellent charting capabilities
- **Papa Parse** for robust CSV parsing
- **The community** for inspiration and feedback

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) page
2. Create a new issue with detailed information
3. Include browser console logs if applicable

## 🗺️ Roadmap

### Upcoming Features
- [ ] **Data Export** - Export statistics and charts
- [ ] **Achievement Notifications** - Real-time achievement unlocks
- [ ] **Comparison Tools** - Head-to-head participant comparisons
- [ ] **Historical Analysis** - Trend analysis and predictions
- [ ] **Mobile App** - Native mobile application
- [ ] **Multi-language** - Internationalization support

### Version History
- **v2.0.0** - Complete restructure with modular architecture
- **v1.0.0** - Initial monolithic version

---

**Built with ❤️ for annual competitions and friendly rivalries!**