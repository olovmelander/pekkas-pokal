/**
 * MapManager
 *
 * Handles the interactive map on the dashboard, showing competition locations.
 */
class MapManager {
  constructor() {
    this.map = null;
    this.markers = [];
    this.animationInterval = null;
    this.animationRunning = false;

    // Hardcoded coordinates for competition locations
    this.locationCoordinates = {
      'Varggropen': [63.2968, 18.7424],
      'Kroksta': [63.3179, 18.6751],
      'Billsta': [63.3260, 18.5128],
      'Idbyn': [63.2423, 18.675],
      'Lomsjön': [63.2905, 18.7153],
      'Kungsholmen': [59.3359, 18.0123],
      'Bredbyn': [63.4447, 18.1064],      // Olympia, the football field
      'Ås': [63.2963, 18.6995],
      'Arnäsvall': [63.322, 18.816],
      'Stockholm': [59.3556, 18.0993],
      'Själevad': [63.2888, 18.5974],
      'Eskilstuna/Västerås': [59.6008, 16.5992],
      'Uppsala': [59.8586, 17.6389]
    };
  }

  /**
   * Initializes the map
   * @param {Array} competitions - The list of competitions
   */
  initialize(competitions) {
    if (this.map) return;

    this.map = L.map('map', {
      center: [62, 17],
      zoom: 5,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: 'map-tiles',
    }).addTo(this.map);

    this.addMarkers(competitions);

    const animationBtn = document.getElementById('map-animation-btn');
    animationBtn.addEventListener('click', () => this.toggleAnimation());
  }

  /**
   * Adds markers to the map for each competition location
   * @param {Array} competitions - The list of competitions
   */
  addMarkers(competitions) {
    const locations = {};

    competitions.forEach((comp) => {
      const locationName = comp.location;
      if (!locationName || locationName === 'Covid' || !this.locationCoordinates[locationName]) {
        return;
      }

      if (!locations[locationName]) {
        locations[locationName] = {
          coords: this.locationCoordinates[locationName],
          competitions: [],
        };
      }
      locations[locationName].competitions.push(comp);
    });

    Object.keys(locations).forEach((locationName) => {
      const location = locations[locationName];
      const marker = L.marker(location.coords).addTo(this.map);

      const popupContent = `
        <b>${locationName}</b><br>
        ${location.competitions
          .map((c) => `${c.year}: ${c.name}`)
          .join('<br>')}
      `;
      marker.bindPopup(popupContent);
      this.markers.push(marker);
    });
  }

  /**
   * Toggles the map animation
   */
  toggleAnimation() {
    const btn = document.getElementById('map-animation-btn');
    if (this.animationRunning) {
      clearInterval(this.animationInterval);
      btn.textContent = '▶️';
      this.animationRunning = false;
    } else {
      this.startAnimation();
      btn.textContent = '⏹️';
      this.animationRunning = true;
    }
  }

  /**
   * Starts the map animation
   */
  startAnimation() {
    let currentIndex = 0;
    this.animationInterval = setInterval(() => {
      if (currentIndex >= this.markers.length) {
        currentIndex = 0;
      }
      const marker = this.markers[currentIndex];
      this.map.flyTo(marker.getLatLng(), 13, {
        animate: true,
        duration: 2,
      });
      marker.openPopup();
      currentIndex++;
    }, 3000);
  }
}

window.MapManager = MapManager;
