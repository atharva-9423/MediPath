/**
 * MediPath - Live 2D Geolocation Map Manager (Leaflet + Google Maps tiles)
 * Tracks user real-time GPS location via HTML5 Geolocation API & renders interactive hospital node markers.
 */

import { CAMPUS_DATASET } from '../graph/dataset.js';

export class LiveMap {
  constructor(elementId, options = {}) {
    this.elementId = elementId;
    this.onNodeClick = options.onNodeClick || null;
    this.map = null;
    this.userMarker = null;
    this.userAccuracyCircle = null;
    this.nodeMarkers = {};
    
    // Default Hospital Center (Medicover Hospital, Sangamner)
    this.defaultLat = 19.6175;
    this.defaultLng = 74.1950;
    this.currentLat = null;
    this.currentLng = null;

    // Relative GPS offsets for campus nodes (matches dataset.js IDs)
    this.nodeGpsCoords = {
      "node_gf_entrance": [19.6171, 74.1946],
      "node_gf_lobby": [19.6173, 74.1949],
      "node_gf_corridor": [19.6175, 74.1951],
      "node_gf_library": [19.6177, 74.1953],
      "node_gf_principal": [19.6174, 74.1947],
      "node_gf_canteen": [19.6178, 74.1948],
      "node_gf_elevator": [19.6175, 74.1950],
      "node_1f_landing": [19.6175, 74.1950],
      "node_1f_cs_lab": [19.6177, 74.1954],
      "node_1f_electronics": [19.61765, 74.19535],
      "node_1f_cs_dept": [19.6176, 74.1955],
      "node_1f_auditorium": [19.6174, 74.1954],
      "node_1f_washroom": [19.61745, 74.19545],
      "node_2f_landing": [19.6175, 74.1950],
      "node_2f_ai_lab": [19.61775, 74.19535],
      "node_2f_robotics": [19.6178, 74.1953],
      "node_2f_conference": [19.61782, 74.1955],
      "node_2f_dean_office": [19.6179, 74.1956],
      // Legacy aliases (kept so old saved tours still resolve)
      "node_1f_corridor_north": [19.6176, 74.1952],
      "node_1f_seminar": [19.6174, 74.1954],
      "node_2f_mech_lab": [19.6178, 74.1953],
      "node_2f_auditorium": [19.6179, 74.1956]
    };

    this.initMap();
    this.startLocationTracking();
  }

  initMap() {
    const container = document.getElementById(this.elementId);
    if (!container) return;

    if (typeof L === 'undefined') {
      console.warn('Leaflet JS is not loaded yet.');
      return;
    }

    // Initialize Leaflet Map
    this.map = L.map(this.elementId, {
      center: [this.defaultLat, this.defaultLng],
      zoom: 17,
      zoomControl: false,
      attributionControl: false
    });

    // Add Google Maps Tile Layer
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(this.map);

    this.renderNodeMarkers();
  }

  renderNodeMarkers() {
    if (!this.map || typeof L === 'undefined') return;

    // Clear existing markers so live Firebase updates don't duplicate pins
    Object.values(this.nodeMarkers).forEach(m => {
      try { this.map.removeLayer(m); } catch {}
    });
    this.nodeMarkers = {};

    Object.entries(CAMPUS_DATASET.nodes).forEach(([nodeId, node]) => {
      const coords = this.nodeGpsCoords[nodeId] || [
        this.defaultLat + ((node.coordinates?.x || 100) - 300) * 0.000005,
        this.defaultLng + ((node.coordinates?.y || 100) - 300) * 0.000005
      ];

      const iconHtml = `
        <div class="map-node-pin" title="${node.name}" style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:#ff5500;border:2px solid #ffffff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">
          <div style="width:6px;height:6px;background:#ffffff;border-radius:50%;"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-node-marker',
        html: iconHtml,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const marker = L.marker(coords, { icon: customIcon }).addTo(this.map);
      
      marker.bindPopup(`
        <div style="font-family:sans-serif;padding:4px 2px;min-width:160px;">
          <strong style="display:block;font-size:14px;color:#09090b;margin-bottom:3px;">${node.name}</strong>
          <span style="display:block;font-size:11px;color:#71717a;margin-bottom:8px;">${node.building || 'Medicover Hospital'}</span>
          <button class="popup-3d-btn" style="width:100%;padding:7px 10px;background:#ff5500;color:#ffffff;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">
            📦 Open 3D View
          </button>
        </div>
      `);

      marker.on('popupopen', (e) => {
        const popupEl = e.popup.getElement();
        const btn = popupEl ? popupEl.querySelector('.popup-3d-btn') : null;
        if (btn) {
          btn.onclick = () => {
            if (this.onNodeClick) this.onNodeClick(nodeId);
          };
        }
      });

      this.nodeMarkers[nodeId] = marker;
    });
  }

  startLocationTracking() {
    if (!('geolocation' in navigator)) {
      console.log('Geolocation not supported by browser');
      return;
    }

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000
    };

    // 1. Immediate initial location fetch
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        console.log(`📍 Precise GPS Location Acquired: ${lat}, ${lng} (Accuracy: ~${Math.round(accuracy)}m)`);
        this.updateUserLocation(lat, lng, accuracy, true);
      },
      (error) => {
        console.warn('Initial GPS fetch error:', error.message);
        this.updateUserLocation(this.defaultLat, this.defaultLng, 15, false);
      },
      geoOptions
    );

    // 2. Continuous real-time live location tracking
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        console.log(`📡 Live GPS Track: ${lat}, ${lng} (Accuracy: ~${Math.round(accuracy)}m)`);
        this.updateUserLocation(lat, lng, accuracy, false);
      },
      (error) => {
        console.warn('Geolocation tracking error:', error.message);
      },
      geoOptions
    );
  }

  updateUserLocation(lat, lng, accuracy = 10, shouldCenter = false) {
    if (!this.map) return;

    this.currentLat = lat;
    this.currentLng = lng;
    const latLng = [lat, lng];

    // Create or update live user position marker (Glowing Orange radar pulse)
    if (!this.userMarker) {
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: `
          <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;width:32px;height:32px;background:rgba(255,85,0,0.35);border-radius:50%;animation:ping-radar 1.6s infinite ease-out;"></div>
            <div style="width:16px;height:16px;background:#ff5500;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 14px rgba(255,85,0,0.9);"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      this.userMarker = L.marker(latLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(this.map);
      this.userAccuracyCircle = L.circle(latLng, {
        radius: accuracy,
        color: '#ff5500',
        fillColor: '#ff5500',
        fillOpacity: 0.12,
        stroke: true,
        weight: 1.5
      }).addTo(this.map);

      if (shouldCenter) {
        this.map.setView(latLng, 17, { animate: true });
      }
    } else {
      this.userMarker.setLatLng(latLng);
      if (this.userAccuracyCircle) {
        this.userAccuracyCircle.setLatLng(latLng);
        this.userAccuracyCircle.setRadius(accuracy);
      }
      if (shouldCenter) {
        this.map.panTo(latLng, { animate: true });
      }
    }
  }

  centerOnUser() {
    if (!('geolocation' in navigator)) {
      alert('📍 Geolocation is not supported by your browser.');
      return;
    }

    const isSecureOrigin = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        console.log(`📍 High-Accuracy Device GPS Acquired: ${lat}, ${lng} (Accuracy: ~${Math.round(accuracy)}m)`);
        this.updateUserLocation(lat, lng, accuracy, true);
        if (this.map) {
          this.map.setView([lat, lng], 18, { animate: true });
        }
      },
      (error) => {
        console.warn('Geolocation Error:', error.code, error.message);
        if (error.code === 1) { // PERMISSION_DENIED
          if (!isSecureOrigin) {
            alert('⚠️ Browser GPS Access Blocked due to Insecure HTTP.\n\nWeb browsers only allow location access on HTTPS or Localhost. Please access via HTTPS (e.g. ngrok HTTPS link) to grant GPS access.');
          } else {
            alert('📍 Location permission was denied.\n\nPlease click the lock/settings icon in your browser address bar and set Location to "Allow".');
          }
        } else if (error.code === 2) { // POSITION_UNAVAILABLE
          alert('📍 Device GPS location unavailable. Make sure location services are enabled on your device.');
        } else if (error.code === 3) { // TIMEOUT
          console.warn('GPS request timed out, using last known position');
          if (this.currentLat && this.currentLng && this.map) {
            this.map.setView([this.currentLat, this.currentLng], 18, { animate: true });
          }
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  focusNode(nodeId) {
    if (!this.map) return;
    let coords = this.nodeGpsCoords[nodeId];
    if (!coords) {
      // Fallback for admin-created spots: derive coords from map x/y
      const node = CAMPUS_DATASET.nodes[nodeId];
      if (!node) return;
      coords = [
        this.defaultLat + (((node.coordinates && node.coordinates.x) || 300) - 300) * 0.000005,
        this.defaultLng + (((node.coordinates && node.coordinates.y) || 300) - 300) * 0.000005
      ];
      this.nodeGpsCoords[nodeId] = coords;
    }
    this.map.setView(coords, 18, { animate: true });
    if (this.nodeMarkers[nodeId]) {
      this.nodeMarkers[nodeId].openPopup();
    }
  }

  refreshMarkers() {
    this.renderNodeMarkers();
  }

  resize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 200);
    }
  }
}
