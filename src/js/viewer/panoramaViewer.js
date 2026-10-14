/**
 * CampusWalk AI - 360 Panorama Viewer Engine
 * Wraps Pannellum / Canvas 360 viewer with dynamic hotspots, cross-fading, pitch/yaw reticle,
 * compass heading realignment, and WebGL texture memory management.
 */

import { getFromCache, saveToCache, deleteFromCache } from '../utils/panoramaCache.js';
import { getNodeImage } from '../firebase/rtdbSync.js';

export class PanoramaViewer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.onHotspotClick = options.onHotspotClick || null;
    this.onViewChange = options.onViewChange || null;
    
    // Dual-Buffer canvas elements to eliminate black screen during scene transitions
    this.containerA = document.getElementById('panorama-viewer-a');
    this.containerB = document.getElementById('panorama-viewer-b');
    this.activeBuffer = 'A'; // 'A' or 'B'
    
    this.viewerA = null;
    this.viewerB = null;
    
    this.currentNodeId = null;
    this.cachedTextureUrls = new Map(); // LRU Texture Cache
    this.cachedPaddedUrls = new Map();  // Pre-rendered 2:1 Padded Canvas Cache

    // Motion blur overlay element (sits above canvases, below UI)
    this.blurOverlay = document.getElementById('motion-blur-overlay');
  }

  /**
   * Getter for active Pannellum viewer instance
   */
  get viewer() {
    return this.activeBuffer === 'A' ? this.viewerA : this.viewerB;
  }

  /**
   * Load and render a campus panorama node with zero black screen
   * @param {Object} node 
   * @param {Object} options { targetHeading, highlightedHotspotNodeId }
   */
  async loadNode(node, options = {}) {
    if (!node) return;

    // Determine target buffer canvas and current active canvas
    const targetBufferKey = this.activeBuffer === 'A' ? 'B' : 'A';
    const targetContainerId = targetBufferKey === 'A' ? 'panorama-viewer-a' : 'panorama-viewer-b';
    const targetContainer = targetBufferKey === 'A' ? this.containerA : this.containerB;
    const currentContainer = this.activeBuffer === 'A' ? this.containerA : this.containerB;
    const oldViewer = this.activeBuffer === 'A' ? this.viewerA : this.viewerB;

    // 1. Retrieve pre-rendered 2:1 padded canvas texture — check RAM → IndexedDB → generate
    let imageSrc;
    let rawSrc;
    if (this.cachedPaddedUrls.has(node.id)) {
      // RAM hit — fastest path
      imageSrc = this.cachedPaddedUrls.get(node.id);
      rawSrc = imageSrc;
    } else {
      // Try IndexedDB persistent cache first (survives page reloads)
      const stored = await getFromCache(node.id);
      if (stored) {
        imageSrc = stored;
        rawSrc = stored;
        this.cachedPaddedUrls.set(node.id, stored); // promote to RAM cache
      } else {
        // Cache miss — generate and persist
        rawSrc = await this._getPanoramaImageSrc(node);
        imageSrc = await this._padImageToEquirectangular(rawSrc);
        this.cachedPaddedUrls.set(node.id, imageSrc);
        saveToCache(node.id, imageSrc); // write to IndexedDB (non-blocking)
      }
    }

    // 2. Prepare target container for WebGL 3D canvas rendering
    if (targetContainer) {
      targetContainer.innerHTML = '';
      targetContainer.className = 'panorama-canvas';
    }

    // --- MOTION BLUR SEQUENCE ---
    // Ramp up GPU motion blur overlay over current 3D panorama while next WebGL scene compiles
    const overlay = this.blurOverlay;
    if (overlay) {
      overlay.classList.remove('blur-clearing');
      overlay.classList.add('blur-active');
    }

    // 2:1 Equirectangular full spherical tilt boundaries (-85° to +85°)
    const minPitch = -85;
    const maxPitch = 85;

    const yaw = options.targetHeading !== undefined ? options.targetHeading : (node.heading || 0);
    const pitch = options.targetPitch !== undefined ? options.targetPitch : (node.pitch !== undefined ? node.pitch : 0);

    // Build hotspots
    const formattedHotspots = (node.hotspots || []).map(h => {
      const isHighlighted = options.highlightedHotspotNodeId === h.targetNodeId;
      return {
        pitch: h.pitch,
        yaw: h.yaw,
        cssClass: isHighlighted ? 'custom-hotspot route-active' : 'custom-hotspot',
        createTooltipFunc: (hotspotDiv) => {
          hotspotDiv.innerHTML = `
            <div class="hotspot-pulse"></div>
            <div class="hotspot-inner">
              <i data-lucide="${isHighlighted ? 'navigation' : 'arrow-up'}"></i>
            </div>
            <div class="hotspot-tooltip">${h.text}</div>
          `;
          hotspotDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onHotspotClick) this.onHotspotClick(node.id, h.targetNodeId);
          });
          if (window.lucide) window.lucide.createIcons({ targets: [hotspotDiv] });
        }
      };
    });

    // 4. Render next panorama WebGL canvas into target buffer container
    let newViewer = null;
    if (window.pannellum && targetContainer) {
      newViewer = window.pannellum.viewer(targetContainerId, {
        type: 'equirectangular',
        panorama: imageSrc,
        autoLoad: true,
        showControls: false,
        haov: 360,
        vaov: 180,
        hfov: window.innerWidth < 768 ? 70 : 110, // Mobile: slightly zoomed in (70°), Desktop: completely zoomed out (110°)
        minHfov: 30,
        maxHfov: 125,
        pitch: pitch,
        minPitch: minPitch,
        maxPitch: maxPitch,
        yaw: yaw,
        hotSpots: formattedHotspots,
        compass: false,
        friction: 0.15
      });

      if (targetBufferKey === 'A') {
        this.viewerA = newViewer;
      } else {
        this.viewerB = newViewer;
      }

      newViewer.on('load', () => {
        // Target 3D panorama WebGL canvas is 100% loaded & painted on GPU
        if (targetContainer) targetContainer.classList.add('arrived');

        // Reveal 3D view: fade out motion blur overlay
        if (overlay) {
          overlay.classList.remove('blur-active');
          overlay.classList.add('blur-clearing');
        }

        setTimeout(() => {
          if (targetContainer) {
            targetContainer.className = 'panorama-canvas active';
          }
          if (currentContainer) {
            currentContainer.className = 'panorama-canvas';
            currentContainer.innerHTML = '';
          }

          this.activeBuffer = targetBufferKey;

          // Resume Gyro if enabled
          if (this.isGyroEnabled && typeof newViewer.startOrientation === 'function') {
            try { newViewer.startOrientation(); } catch (e) {}
          }

          // Safely destroy old WebGL instance behind the scenes
          if (oldViewer) {
            try { oldViewer.destroy(); } catch (e) {}
          }

          if (overlay) {
            overlay.classList.remove('blur-clearing');
          }
        }, 300);
      });

      newViewer.on('animatefinished', () => {
        if (this.onViewChange) {
          this.onViewChange(this.getPitchYaw());
        }
      });
    }
  }

  /**
   * Pre-render and cache equirectangular image textures in PARALLEL (Promise.all).
   * Cache hierarchy: RAM → IndexedDB → generate.
   * Generated images are written to IndexedDB so they survive page reloads.
   * @param {Array} adjacentNodes - Array of node objects to preload simultaneously
   */
  async preloadAdjacentNodes(adjacentNodes = []) {
    if (!Array.isArray(adjacentNodes)) return;

    const tasks = adjacentNodes
      .filter(node => node && node.id && !this.cachedPaddedUrls.has(node.id))
      .map(async (node) => {
        try {
          // Check IndexedDB first — already-cached nodes skip generation entirely
          const stored = await getFromCache(node.id);
          if (stored) {
            this.cachedPaddedUrls.set(node.id, stored);
            return;
          }

          // Generate and persist
          const rawSrc    = await this._getPanoramaImageSrc(node);
          const paddedSrc = await this._padImageToEquirectangular(rawSrc);
          this.cachedPaddedUrls.set(node.id, paddedSrc);
          saveToCache(node.id, paddedSrc); // persist to IndexedDB (non-blocking)
        } catch (e) {
          console.warn(`[PanoramaViewer] Pre-render failed for node ${node.id}:`, e);
        }
      });

    await Promise.all(tasks);
  }

  /**
   * Get current Pitch and Yaw from viewer (for Admin Editor)
   */
  getPitchYaw() {
    const activeViewer = this.viewer;
    if (!activeViewer) return { pitch: 0, yaw: 0 };
    try {
      const pitch = typeof activeViewer.getPitch === 'function' ? activeViewer.getPitch() : 0;
      const yaw = typeof activeViewer.getYaw === 'function' ? activeViewer.getYaw() : 0;
      return {
        pitch: parseFloat(Number(pitch).toFixed(1)),
        yaw: parseFloat(Number(yaw).toFixed(1))
      };
    } catch {
      return { pitch: 0, yaw: 0 };
    }
  }

  /**
   * Bust the RAM and IndexedDB cache for a specific node.
   * Call this whenever a node's panorama image is replaced so the next
   * loadNode() call always re-processes the fresh image.
   * @param {string} nodeId
   */
  async clearNodeCache(nodeId) {
    if (!nodeId) return;
    this.cachedPaddedUrls.delete(nodeId);
    await deleteFromCache(nodeId);
  }

  /**
   * Force Pannellum to recalculate its dimensions.
   * Call this after the container becomes visible (e.g. tab switch).
   */
  resize() {
    if (this.viewer && typeof this.viewer.resize === 'function') {
      this.viewer.resize();
    }
  }

  /**
   * Toggle Gyroscope (Device Orientation) mode on/off
   * Handles iOS 13+ permission requests, Pannellum orientation controls, and desktop motion simulation fallback.
   * @returns {Promise<boolean>} new gyro state (true = ON, false = OFF)
   */
  async toggleGyro() {
    if (!this.viewer) return false;

    // If currently active, turn off
    if (this.isGyroEnabled) {
      if (typeof this.viewer.stopOrientation === 'function') {
        try { this.viewer.stopOrientation(); } catch (e) {}
      }
      this._stopDesktopMotionFallback();
      this.isGyroEnabled = false;
      return false;
    }

    // Request iOS 13+ DeviceOrientation permission if required
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          alert('Gyroscope permission is required for 3D Motion mode.');
          return false;
        }
      } catch (e) {
        console.warn('DeviceOrientation permission error:', e);
      }
    }

    // Try Pannellum native orientation controls
    let pannellumSuccess = false;
    if (typeof this.viewer.startOrientation === 'function') {
      try {
        this.viewer.startOrientation();
        pannellumSuccess = true;
      } catch (err) {
        console.warn("Pannellum startOrientation error:", err);
      }
    }

    // Enable desktop mouse tilt fallback if on desktop device without real sensors
    this._startDesktopMotionFallback();
    this.isGyroEnabled = true;
    return true;
  }

  /**
   * Desktop Motion Simulation Fallback
   * Allows testing 3D motion tracking using mouse position when physical gyro is unavailable.
   */
  _startDesktopMotionFallback() {
    if (this._desktopMotionHandler) return;

    this._desktopMotionHandler = (e) => {
      if (!this.isGyroEnabled || !this.viewer) return;
      
      // Map mouse position relative to screen center
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const deltaX = (e.clientX - centerX) / centerX; // -1 to 1
      const deltaY = (e.clientY - centerY) / centerY; // -1 to 1

      const targetYaw = deltaX * 180;
      const targetPitch = -deltaY * 50;

      try {
        if (typeof this.viewer.setPitch === 'function' && typeof this.viewer.setYaw === 'function') {
          this.viewer.setPitch(targetPitch, false);
          this.viewer.setYaw(targetYaw, false);
        }
      } catch (err) {}
    };

    window.addEventListener('mousemove', this._desktopMotionHandler);
  }

  _stopDesktopMotionFallback() {
    if (this._desktopMotionHandler) {
      window.removeEventListener('mousemove', this._desktopMotionHandler);
      this._desktopMotionHandler = null;
    }
  }

  /**
   * Detect the correct vaov for a panorama image from its natural dimensions.
   * vaov = haov * (height / width)
   * This prevents vertical stretching on non-standard aspect ratio panoramas.
   * @param {string} src - image URL or data URL
   * @param {number} haov - horizontal angle of view (default 360)
   * @returns {Promise<number>} computed vaov in degrees
   */
  _detectImageVaov(src, haov = 360) {
    return new Promise((resolve) => {
      // For canvas data URLs generated internally, we know they're 4096×2048 → vaov=180
      if (src.startsWith('data:')) {
        return resolve(180);
      }

      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalHeight / img.naturalWidth;
        const vaov = haov * ratio;
        console.log(`[PanoramaViewer] Detected image ${img.naturalWidth}×${img.naturalHeight}, ratio=${ratio.toFixed(3)}, vaov=${vaov.toFixed(1)}°`);
        resolve(vaov);
      };
      img.onerror = () => {
        console.warn('[PanoramaViewer] Could not load image to detect dimensions, defaulting vaov=180');
        resolve(180);
      };
      img.src = src;
    });
  }

  /**
   * Smoothly rotate viewer heading towards target yaw angle
   */
  setHeading(yawAngle) {
    if (this.viewer) {
      this.viewer.setYaw(yawAngle, 400);
    }
  }

  /**
   * Generate clean equirectangular 360 canvas texture for offline reliability.
   * Resolution order (fastest first):
   *  1. inline customImage — legacy data: URLs AND small URL paths (instant)
   *  2. node.photo flag → IndexedDB → RTDB `campus/images` (lazy, cached)
   *  3. procedural generated panorama (always works offline)
   */
  async _getPanoramaImageSrc(node) {
    if (node.customImage) return node.customImage;

    // Uploaded photo stored split from metadata — lazy-load bytes on demand
    if (node.photo) {
      try {
        const img = await getNodeImage(node.id);
        if (img) return img;
      } catch (e) {
        console.warn(`[PanoramaViewer] RTDB image fetch failed for ${node.id}:`, e);
      }
    }

    // Check LRU cache
    if (this.cachedTextureUrls.has(node.id)) {
      return this.cachedTextureUrls.get(node.id);
    }

    const dataUrl = this._createProceduralEquirectangularPanorama(node);
    this.cachedTextureUrls.set(node.id, dataUrl);
    return dataUrl;
  }

  /**
   * Render dynamic 2:1 Equirectangular 360 Canvas texture
   */
  _createProceduralEquirectangularPanorama(node) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Floor Theme colors based on category
    let wallColorTop = '#0f172a';
    let wallColorBottom = '#1e293b';
    let accentLineColor = '#6366f1';

    if (node.floor === 'GF') {
      wallColorTop = '#0b132b';
      wallColorBottom = '#1c2541';
      accentLineColor = '#06b6d4';
    } else if (node.floor === '2F') {
      wallColorTop = '#180e29';
      wallColorBottom = '#2d1b4e';
      accentLineColor = '#ec4899';
    }

    // 1. Background Gradient (Wall & Atmosphere)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#020617'); // Ceiling
    bgGrad.addColorStop(0.25, wallColorTop);
    bgGrad.addColorStop(0.65, wallColorBottom);
    bgGrad.addColorStop(1, '#090d16'); // Floor
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Ceiling Recessed Lighting Grids
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 4;
    for (let x = 0; x < canvas.width; x += 256) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 150);
      ctx.stroke();
    }
    // Ceiling Glow Strips
    const glowGrad = ctx.createLinearGradient(0, 100, 0, 150);
    glowGrad.addColorStop(0, accentLineColor);
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 100, canvas.width, 50);

    // 3. Wall Panels & Architectural Grid (Perspective 360 lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    for (let x = 0; x < canvas.width; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 150);
      ctx.lineTo(x, 700);
      ctx.stroke();
    }

    // Horizontal Accent Dado Rail
    ctx.fillStyle = accentLineColor;
    ctx.shadowColor = accentLineColor;
    ctx.shadowBlur = 15;
    ctx.fillRect(0, 450, canvas.width, 6);
    ctx.shadowBlur = 0;

    // 4. Tiled Floor Perspective Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    for (let y = 700; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    for (let x = 0; x < canvas.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 700);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // 5. Room Name & Department Signage on Wall (Centered at Yaw 0)
    const signX = canvas.width / 2;
    const signY = 320;

    // Signboard Box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = accentLineColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(signX - 300, signY - 80, 600, 160, 20);
    ctx.fill();
    ctx.stroke();

    // Sign Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.name.toUpperCase(), signX, signY - 20);

    ctx.fillStyle = accentLineColor;
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText(`${node.building} • FLOOR ${node.floor}`, signX, signY + 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px Inter, sans-serif';
    ctx.fillText(`Department of ${node.department}`, signX, signY + 50);

    // 6. Cardinal Directions (N, E, S, W markers on horizon)
    const directions = [
      { text: 'NORTH [0°]', x: canvas.width / 2 },
      { text: 'EAST [90°]', x: (canvas.width * 3) / 4 },
      { text: 'SOUTH [180°]', x: canvas.width },
      { text: 'WEST [270°]', x: canvas.width / 4 }
    ];

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 16px Inter, sans-serif';
    directions.forEach(d => {
      ctx.fillText(`▲ ${d.text}`, d.x, 680);
      if (d.x === canvas.width) {
        ctx.fillText(`▲ ${d.text}`, 0, 680);
      }
    });

    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /**
   * Converts any panorama image into a proper 2:1 equirectangular canvas.
   * - If the image is already 2:1 (width = 2 × height), it's returned as-is.
   * - Otherwise the image is drawn centered vertically on a 2:1 canvas.
   * - The empty top/bottom bands are filled with a dark gradient matching app theme.
   * This means Pannellum always receives a native 2:1 image → vaov:180 is accurate
   * → NO stretching, and full -85°/+85° vertical tilt remains unlocked.
   *
   * @param {string} src - raw image URL
   * @returns {Promise<string>} data URL of the padded 2:1 image
   */
  _padImageToEquirectangular(src) {
    return new Promise((resolve) => {
      // data: URLs from canvas generation are already correct 2:1
      if (src.startsWith('data:')) return resolve(src);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const ratio = w / h;

        // Already a 2:1 equirectangular — use as-is
        if (Math.abs(ratio - 2) < 0.05) return resolve(src);

        // Build 2:1 output canvas
        const outW = w;
        const outH = Math.round(w / 2);
        const bandH = Math.round((outH - h) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');

        if (bandH > 0) {
          // --- TOP BAND: stretch the top ~4px of the image to fill the band ---
          // This picks up the actual ceiling/sky colour from the photo and extends it
          // naturally upward — no mirrors, no arbitrary dark fill.
          const sampleH = Math.min(4, h);
          ctx.drawImage(img,
            0, 0, w, sampleH,    // source: top sampleH rows of image
            0, 0, outW, bandH    // dest: stretched to fill top band
          );

          // Subtle darkening vignette toward the top pole so it fades naturally
          const topFade = ctx.createLinearGradient(0, 0, 0, bandH);
          topFade.addColorStop(0, 'rgba(0,0,0,0.45)');
          topFade.addColorStop(0.6, 'rgba(0,0,0,0.1)');
          topFade.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = topFade;
          ctx.fillRect(0, 0, outW, bandH);
        }

        // --- DRAW ORIGINAL IMAGE centered vertically ---
        ctx.drawImage(img, 0, bandH, w, h);

        if (bandH > 0) {
          // --- BOTTOM BAND: stretch the bottom ~4px of the image to fill the band ---
          const botY = bandH + h;
          const sampleH = Math.min(4, h);
          ctx.drawImage(img,
            0, h - sampleH, w, sampleH,   // source: bottom sampleH rows
            0, botY, outW, outH - botY     // dest: stretched to fill bottom band
          );

          // Subtle darkening vignette toward the bottom pole
          const botFade = ctx.createLinearGradient(0, botY, 0, outH);
          botFade.addColorStop(0, 'rgba(0,0,0,0)');
          botFade.addColorStop(0.4, 'rgba(0,0,0,0.1)');
          botFade.addColorStop(1, 'rgba(0,0,0,0.45)');
          ctx.fillStyle = botFade;
          ctx.fillRect(0, botY, outW, outH - botY);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };

      img.onerror = () => {
        console.warn('[PanoramaViewer] _padImageToEquirectangular: could not load image, using raw src.');
        resolve(src);
      };

      img.src = src;
    });
  }
}
