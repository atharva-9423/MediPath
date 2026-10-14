/**
 * CampusWalk AI — Unified Admin Tour Studio
 * 
 * Mental Model:
 * 1. Admin views the 3D panorama of any spot on campus (starts at Entrance).
 * 2. Admin drags the floating "Arrow Pin" and drops it onto a doorway/pathway.
 * 3. A clean modal opens asking for: Place Name, Floor, Arrow Label, and 360° Panorama Photo.
 * 4. Saving instantly adds the navigation arrow on screen and creates the destination spot.
 * 5. Clicking any arrow in the 3D view travels to that spot, so you can continue building the tour step-by-step!
 */

import { CAMPUS_DATASET, setNodes } from '../graph/dataset.js';
import {
  isFirebaseConnected,
  pushNodeUpdate,
  pushHotspotAdd,
  removeHotspot,
  syncAllToFirebase,
  getNodeImage
} from '../firebase/rtdbSync.js';
import { verifyAdminPassword } from '../firebase/firebaseConfig.js';

/**
 * Compress and scale uploaded 360 panorama to max 4096px width JPEG (0.88 quality).
 * Full panorama resolution is preserved so the 360 view stays crisp even zoomed
 * in — the viewer only shows ~1/4 of the full width at a time, so downscaling
 * causes visible pixelation. Uploads stay fast because photo bytes sync
 * separately from metadata (see rtdbSync split storage) and only on change.
 */
function compressPanoramaImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        const maxWidth = 4096;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', 0.88);
        resolve(compressed);
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export class AdminEditor {
  constructor(options = {}) {
    this.viewerRef = options.viewerRef || null;
    this.currentNodeId = options.currentNodeId || null;
    this.onGraphDatasetUpdated = options.onGraphDatasetUpdated || null;

    this.isUnlocked = false;
    this._droppedCoords = null; // { pitch, yaw, mappedX, mappedY }
    this._newSpotImageBase64 = null;
    this._changePhotoImageBase64 = null;

    // DOM Elements
    this._panel = document.getElementById('admin-panel');
    this._gate = document.getElementById('admin-gate');
    this._workspace = document.getElementById('admin-workspace');
    this._fbBadge = document.getElementById('admin-fb-badge');
    this._spotBadgeName = document.getElementById('admin-current-spot-name');
    this._placeSelect = document.getElementById('admin-place-select');
    this._hsBadge = document.getElementById('admin-hs-count-badge');
    this._hsListContainer = document.getElementById('admin-hs-items-list');
    this._pendingMarker = document.getElementById('admin-pending-marker');
    this._loadingScreen = document.getElementById('admin-loading-screen');
    this._loadingSub = document.getElementById('admin-loading-sub');
    this._saveToast = document.getElementById('admin-save-toast');

    // Modals
    this._createHotspotModal = document.getElementById('admin-create-hotspot-modal');
    this._changePhotoModal = document.getElementById('admin-change-photo-modal');

    this._setupListeners();
    this._watchHashChange();
    this._checkHash();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Loading Screen Indicator
  // ──────────────────────────────────────────────────────────────────────────
  _showLoading(subText = 'Syncing node data & WebGL canvas...') {
    if (this._loadingScreen) {
      if (this._loadingSub && subText) this._loadingSub.textContent = subText;
      this._loadingScreen.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons({ targets: [this._loadingScreen] });
    }
  }

  _hideLoading() {
    if (this._loadingScreen) {
      this._loadingScreen.classList.add('hidden');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Authentication & Panel Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  _watchHashChange() {
    window.addEventListener('hashchange', () => this._checkHash());
  }

  _checkHash() {
    if (window.location.hash === '#admin') {
      this.openPanel();
    }
  }

  openPanel() {
    if (!this._panel) return;
    this._panel.classList.remove('hidden');
    if (this.isUnlocked) {
      this._showWorkspace();
    } else {
      this._showGate();
    }
    if (window.lucide) window.lucide.createIcons({ targets: [this._panel] });
  }

  closePanel() {
    if (this._panel) this._panel.classList.add('hidden');
    if (window.location.hash === '#admin') {
      history.replaceState(null, null, ' ');
    }
  }

  _showGate() {
    if (this._gate) this._gate.classList.remove('hidden');
    if (this._workspace) this._workspace.classList.add('hidden');
    const pwInput = document.getElementById('admin-password-input');
    if (pwInput) {
      pwInput.value = '';
      setTimeout(() => pwInput.focus(), 60);
    }
  }

  _showWorkspace() {
    if (this._gate) this._gate.classList.add('hidden');
    if (this._workspace) this._workspace.classList.remove('hidden');
    this._updateFbBadge();
    this._showLoading('Loading campus nodes & 3D panorama...');

    // Mount panorama container into admin viewer area
    const panoramaWrapper = document.getElementById('panorama-container');
    const adminViewerArea = document.querySelector('.admin-viewer-area');
    if (panoramaWrapper && adminViewerArea && !adminViewerArea.contains(panoramaWrapper)) {
      adminViewerArea.insertBefore(panoramaWrapper, adminViewerArea.firstChild);
    }
    const panoPageWrapper = document.getElementById('panorama-view-container');
    if (panoPageWrapper) panoPageWrapper.classList.remove('hidden');

    // Default to current node or Entrance
    if (!this.currentNodeId || !CAMPUS_DATASET.nodes[this.currentNodeId]) {
      this.currentNodeId = CAMPUS_DATASET.nodes['node_gf_entrance'] ? 'node_gf_entrance' : Object.keys(CAMPUS_DATASET.nodes)[0];
    }

    this._loadCurrentSpot();

    setTimeout(() => {
      if (this.viewerRef && typeof this.viewerRef.resize === 'function') {
        this.viewerRef.resize();
      }
    }, 100);

    if (window.lucide) window.lucide.createIcons({ targets: [this._workspace] });
  }

  _login(password) {
    const pwInput = document.getElementById('admin-password-input');
    if (verifyAdminPassword(password)) {
      this.isUnlocked = true;
      if (pwInput) pwInput.classList.remove('admin-input-error');
      this._showWorkspace();
    } else {
      if (pwInput) {
        pwInput.classList.add('admin-input-error');
        pwInput.value = '';
        pwInput.placeholder = 'Incorrect password! Try again';
        pwInput.focus();
      }
    }
  }

  _updateFbBadge() {
    if (!this._fbBadge) return;
    if (isFirebaseConnected()) {
      this._fbBadge.textContent = '● Firebase Connected';
      this._fbBadge.className = 'admin-fb-badge online';
    } else {
      this._fbBadge.textContent = '● Offline Mode';
      this._fbBadge.className = 'admin-fb-badge offline';
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Spot Navigation & Viewer Sync
  // ──────────────────────────────────────────────────────────────────────────
  _loadCurrentSpot(nodeId = null) {
    if (nodeId) this.currentNodeId = nodeId;
    const node = CAMPUS_DATASET.nodes[this.currentNodeId];
    if (!node) {
      this._hideLoading();
      return;
    }

    this._showLoading(`Loading ${node.name}...`);

    // Update Top Bar Indicators
    if (this._spotBadgeName) {
      this._spotBadgeName.textContent = `${node.name} [${node.floor || 'GF'}]`;
    }

    // Populate Place Switcher Dropdown
    this._populatePlaceSelect();

    // Render Hotspots Panel (Top Right Corner)
    this._renderHotspotsPanel(node);

    // Load 3D Panorama in Viewer with loader dismissal
    if (this.viewerRef) {
      Promise.resolve(this.viewerRef.loadNode(node, {}))
        .then(() => {
          setTimeout(() => this._hideLoading(), 200);
        })
        .catch(() => this._hideLoading());
    } else {
      setTimeout(() => this._hideLoading(), 300);
    }

    // Safety fallback
    setTimeout(() => this._hideLoading(), 1400);

    // Hide any open dialogs / markers
    if (this._pendingMarker) this._pendingMarker.classList.add('hidden');
    if (this._createHotspotModal) this._createHotspotModal.classList.add('hidden');
    if (this._changePhotoModal) this._changePhotoModal.classList.add('hidden');
  }

  _renderHotspotsPanel(node) {
    if (!this._hsListContainer) return;
    this._hsListContainer.innerHTML = '';

    const hotspots = Array.isArray(node.hotspots) ? node.hotspots : [];
    if (this._hsBadge) {
      this._hsBadge.textContent = hotspots.length.toString();
    }

    if (hotspots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'admin-hs-empty';
      empty.textContent = 'No arrows on this view yet. Drag the pin icon onto the 3D view to add one!';
      this._hsListContainer.appendChild(empty);
      return;
    }

    hotspots.forEach((hs, index) => {
      const targetNode = CAMPUS_DATASET.nodes[hs.targetNodeId];
      const targetName = targetNode?.name || hs.text || hs.targetNodeId;
      const targetFloor = targetNode?.floor || 'GF';

      const item = document.createElement('div');
      item.className = 'admin-hs-item';

      // Left info: clickable to travel to that place
      const info = document.createElement('div');
      info.className = 'admin-hs-item-info';
      info.title = `Click to navigate to ${targetName}`;
      info.innerHTML = `
        <div class="admin-hs-item-name">${hs.text || targetName}</div>
        <div class="admin-hs-item-sub">
          <span>[${targetFloor}]</span> ${targetName} · <span>${Math.round(hs.yaw || 0)}°</span>
        </div>
      `;
      info.onclick = () => {
        if (hs.targetNodeId && CAMPUS_DATASET.nodes[hs.targetNodeId]) {
          this._loadCurrentSpot(hs.targetNodeId);
        } else if (this.viewerRef && this.viewerRef.viewer && typeof this.viewerRef.viewer.lookAt === 'function') {
          this.viewerRef.viewer.lookAt(hs.pitch || 0, hs.yaw || 0, 100, 1000);
        }
      };

      // Right: Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'admin-hs-delete-btn';
      delBtn.title = `Delete arrow to "${targetName}"`;
      delBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this._deleteHotspot(node, index, targetName);
      };

      item.appendChild(info);
      item.appendChild(delBtn);
      this._hsListContainer.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons({ targets: [this._hsListContainer] });
  }

  _deleteHotspot(node, index, targetName) {
    if (!confirm(`Are you sure you want to delete the navigation arrow to "${targetName}"?`)) {
      return;
    }

    // 1. Optimistic removal
    if (node.hotspots && node.hotspots[index]) {
      node.hotspots.splice(index, 1);
    }

    // 2. Instant UI & Viewer refresh
    this._renderHotspotsPanel(node);
    if (this.viewerRef) {
      this.viewerRef.loadNode(node, {});
    }
    if (this.onGraphDatasetUpdated) {
      this.onGraphDatasetUpdated();
    }
    this._showToast(`🗑 Arrow to "${targetName}" removed!`);

    // 3. Immediate automatic Firebase RTDB sync
    pushNodeUpdate(node.id, node).catch(err => console.error('[Firebase] Error deleting hotspot:', err));
  }

  _populatePlaceSelect() {
    if (!this._placeSelect) return;
    this._placeSelect.innerHTML = '';

    const nodes = Object.values(CAMPUS_DATASET.nodes);
    const floors = ['GF', '1F', '2F', '3F'];

    floors.forEach(fl => {
      const floorNodes = nodes.filter(n => (n.floor || 'GF') === fl);
      if (!floorNodes.length) return;

      const group = document.createElement('optgroup');
      group.label = `Floor ${fl}`;
      floorNodes.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.textContent = n.name;
        if (n.id === this.currentNodeId) opt.selected = true;
        group.appendChild(opt);
      });
      this._placeSelect.appendChild(group);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Click-to-Place Editor Mode
  // ──────────────────────────────────────────────────────────────────────────
  _setupClickToPlace() {
    const overlay = document.getElementById('admin-click-overlay');
    if (!overlay) return;

    overlay.addEventListener('click', (e) => {
      if (!this.isUnlocked || !this.currentNodeId) return;

      // Ignore clicks on the cancel button itself (it has its own handler)
      if (e.target.closest('#btn-admin-cancel-place')) return;

      const viewerEl = document.getElementById('panorama-view-container') ||
                       document.getElementById('admin-viewer-dropzone');
      const pv = this.viewerRef ? this.viewerRef.viewer : null;
      if (!pv || !viewerEl) return;

      const rect = viewerEl.getBoundingClientRect();
      let pitch = 0, yaw = 0;

      try {
        if (typeof pv.mouseEventToCoords === 'function') {
          // Most accurate: Pannellum's own projection
          const coords = pv.mouseEventToCoords(e);
          pitch = parseFloat(coords[0].toFixed(1));
          yaw   = parseFloat(coords[1].toFixed(1));
        } else {
          // Fallback: manual linear mapping from click position
          const normalX = (e.clientX - rect.left)  / rect.width  - 0.5;
          const normalY = (e.clientY - rect.top)   / rect.height - 0.5;
          const hfov = pv.getHfov ? pv.getHfov() : 100;
          const vfov = hfov * (rect.height / rect.width);
          yaw   = parseFloat((pv.getYaw()   + normalX * hfov).toFixed(1));
          pitch = parseFloat((pv.getPitch() - normalY * vfov).toFixed(1));
        }
      } catch (_) {
        pitch = parseFloat((pv.getPitch ? pv.getPitch() : 0).toFixed(1));
        yaw   = parseFloat((pv.getYaw   ? pv.getYaw()   : 0).toFixed(1));
      }

      // Map 2D floor coordinates from yaw angle
      const curr = CAMPUS_DATASET.nodes[this.currentNodeId] || {};
      const currX = curr.coordinates?.x || 300;
      const currY = curr.coordinates?.y || 300;
      const rad = (yaw * Math.PI) / 180;
      const mappedX = Math.round(Math.max(50, Math.min(950, currX + Math.sin(rad) * 50)));
      const mappedY = Math.round(Math.max(50, Math.min(950, currY - Math.cos(rad) * 50)));

      this._droppedCoords = { pitch, yaw, mappedX, mappedY };

      // Place marker at clicked position (relative to the overlay/dropzone)
      const dropzoneRect = document.getElementById('admin-viewer-dropzone')?.getBoundingClientRect() || rect;
      this._snapMarkerAt(e.clientX, e.clientY, dropzoneRect);

      // Exit editor mode THEN open modal
      this._exitEditorMode(false); // false = don't hide marker yet
      this._openCreateHotspotModal();
    });
  }

  _enterEditorMode() {
    const overlay = document.getElementById('admin-click-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons({ targets: [overlay] });
    }
    // Hide any stale marker
    if (this._pendingMarker) this._pendingMarker.classList.add('hidden');
  }

  _exitEditorMode(hideMarker = true) {
    const overlay = document.getElementById('admin-click-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (hideMarker && this._pendingMarker) this._pendingMarker.classList.add('hidden');
  }


  _snapMarkerAt(clientX, clientY, rect) {
    if (!this._pendingMarker) return;
    const r = rect || document.getElementById('admin-viewer-dropzone')?.getBoundingClientRect();
    if (!r) return;
    const x = Math.round(clientX - r.left);
    const y = Math.round(clientY - r.top);
    this._pendingMarker.style.left = `${x}px`;
    this._pendingMarker.style.top  = `${y}px`;
    this._pendingMarker.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons({ targets: [this._pendingMarker] });
  }

  _handleDropCoordinates(clientX, clientY) {
    if (!this.isUnlocked || !this.currentNodeId) return;

    const wrapper = document.getElementById('panorama-view-container') ||
                    document.getElementById('admin-viewer-dropzone');
    if (!wrapper) return;

    const pv = this.viewerRef ? this.viewerRef.viewer : null;
    if (!pv) return;

    const rect = wrapper.getBoundingClientRect();
    let pitch = 0, yaw = 0;

    try {
      if (typeof pv.mouseEventToCoords === 'function') {
        const fakeEvent = { clientX, clientY, target: wrapper };
        const coords = pv.mouseEventToCoords(fakeEvent);
        pitch = parseFloat(coords[0].toFixed(1));
        yaw   = parseFloat(coords[1].toFixed(1));
      } else {
        const normalX = (clientX - rect.left) / rect.width - 0.5;
        const normalY = (clientY - rect.top)  / rect.height - 0.5;
        const hfov = pv.getHfov ? pv.getHfov() : 100;
        const vfov = hfov * (rect.height / rect.width);
        yaw   = parseFloat((pv.getYaw()   + normalX * hfov).toFixed(1));
        pitch = parseFloat((pv.getPitch() - normalY * vfov).toFixed(1));
      }
    } catch (_) {
      pitch = parseFloat((pv.getPitch ? pv.getPitch() : 0).toFixed(1));
      yaw   = parseFloat((pv.getYaw   ? pv.getYaw()   : 0).toFixed(1));
    }

    // Map 2D floor coordinates using angle offset from current node
    const curr = CAMPUS_DATASET.nodes[this.currentNodeId] || {};
    const currX = curr.coordinates?.x || 300;
    const currY = curr.coordinates?.y || 300;
    const rad = (yaw * Math.PI) / 180;
    const dist = 50;
    const mappedX = Math.round(Math.max(50, Math.min(950, currX + Math.sin(rad) * dist)));
    const mappedY = Math.round(Math.max(50, Math.min(950, currY - Math.cos(rad) * dist)));

    this._droppedCoords = { pitch, yaw, mappedX, mappedY };
    this._openCreateHotspotModal();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Create Hotspot & Destination Spot Modal
  // ──────────────────────────────────────────────────────────────────────────
  _openCreateHotspotModal() {
    const curr = CAMPUS_DATASET.nodes[this.currentNodeId] || {};
    const nameInput = document.getElementById('hs-new-name');
    const floorSelect = document.getElementById('hs-new-floor');
    const labelInput = document.getElementById('hs-new-label');
    const returnCheck = document.getElementById('hs-new-return-arrow');

    if (nameInput) nameInput.value = '';
    if (floorSelect) floorSelect.value = curr.floor || 'GF';
    if (labelInput) labelInput.value = '';
    if (returnCheck) returnCheck.checked = true;

    // Reset Image Upload
    this._newSpotImageBase64 = null;
    const preview = document.getElementById('hs-new-image-preview');
    const previewImg = document.getElementById('hs-new-preview-img');
    const dropZone = document.getElementById('hs-new-image-drop');
    const urlInput = document.getElementById('hs-new-image-url');
    const fileInput = document.getElementById('hs-new-image-file');

    if (preview) preview.classList.add('hidden');
    if (previewImg) previewImg.src = '';
    if (dropZone) dropZone.style.display = '';
    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';

    // ── Mode toggle: always start on "New Place" ──
    this._hsMode = 'new';
    const sectionNew = document.getElementById('hs-section-new');
    const sectionExisting = document.getElementById('hs-section-existing');
    const btnModeNew = document.getElementById('hs-mode-new');
    const btnModeExisting = document.getElementById('hs-mode-existing');

    const switchMode = (mode) => {
      this._hsMode = mode;
      if (mode === 'new') {
        sectionNew?.classList.remove('hidden');
        sectionExisting?.classList.add('hidden');
        btnModeNew?.classList.add('hs-mode-active');
        btnModeExisting?.classList.remove('hs-mode-active');
        setTimeout(() => nameInput?.focus(), 60);
      } else {
        sectionNew?.classList.add('hidden');
        sectionExisting?.classList.remove('hidden');
        btnModeNew?.classList.remove('hs-mode-active');
        btnModeExisting?.classList.add('hs-mode-active');
        // Populate existing nodes dropdown (exclude current)
        const sel = document.getElementById('hs-existing-node-select');
        if (sel) {
          sel.innerHTML = '';
          Object.values(CAMPUS_DATASET.nodes)
            .filter(n => n.id !== this.currentNodeId)
            .forEach(n => {
              const opt = document.createElement('option');
              opt.value = n.id;
              opt.textContent = `${n.name} (${n.floor || '?'})`;
              sel.appendChild(opt);
            });
          if (!sel.options.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No other places exist yet';
            sel.appendChild(opt);
          }
        }
        const existingLabelInput = document.getElementById('hs-existing-label');
        if (existingLabelInput) existingLabelInput.value = '';
        setTimeout(() => sel?.focus(), 60);
      }
      if (window.lucide) window.lucide.createIcons({ targets: [document.getElementById('hs-section-new'), document.getElementById('hs-section-existing')].filter(Boolean) });
    };

    // Always start fresh on "New" mode
    switchMode('new');
    if (btnModeNew) btnModeNew.onclick = () => switchMode('new');
    if (btnModeExisting) btnModeExisting.onclick = () => switchMode('existing');

    // Auto-fill label when user types place name
    if (nameInput) {
      nameInput.oninput = () => {
        const val = nameInput.value.trim();
        if (labelInput && (!labelInput.dataset.manual || labelInput.value === `Walk to `)) {
          labelInput.value = val ? `Walk to ${val}` : '';
        }
      };
    }

    if (this._createHotspotModal) {
      this._createHotspotModal.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons({ targets: [this._createHotspotModal] });
      this._setupNewSpotImageUpload();
      setTimeout(() => nameInput && nameInput.focus(), 60);
    }
  }

  _setupNewSpotImageUpload() {
    const dropZone   = document.getElementById('hs-new-image-drop');
    const fileInput  = document.getElementById('hs-new-image-file');
    const preview    = document.getElementById('hs-new-image-preview');
    const previewImg = document.getElementById('hs-new-preview-img');
    const clearBtn   = document.getElementById('btn-hs-new-clear-img');
    const urlInput   = document.getElementById('hs-new-image-url');

    const loadFile = async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      this._showToast('⏳ Compressing 360° photo for instant sync...');
      const compressedDataUrl = await compressPanoramaImage(file);
      if (compressedDataUrl) {
        this._newSpotImageBase64 = compressedDataUrl;
        if (previewImg) previewImg.src = compressedDataUrl;
        if (preview) preview.classList.remove('hidden');
        if (dropZone) dropZone.style.display = 'none';
        if (urlInput) urlInput.value = '';
      }
    };

    if (dropZone) {
      dropZone.onclick = () => fileInput && fileInput.click();
      dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
      dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
      dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) loadFile(file);
      };
    }

    if (fileInput) {
      fileInput.onchange = () => fileInput.files?.[0] && loadFile(fileInput.files[0]);
    }

    if (urlInput) {
      urlInput.oninput = () => {
        const val = urlInput.value.trim();
        if (val) {
          this._newSpotImageBase64 = null;
          if (previewImg) previewImg.src = val;
          if (preview) preview.classList.remove('hidden');
          if (dropZone) dropZone.style.display = 'none';
        }
      };
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        this._newSpotImageBase64 = null;
        if (previewImg) previewImg.src = '';
        if (preview) preview.classList.add('hidden');
        if (dropZone) dropZone.style.display = '';
        if (fileInput) fileInput.value = '';
        if (urlInput) urlInput.value = '';
      };
    }
  }

  _saveNewHotspot() {
    if (this._hsMode === 'existing') {
      this._saveExistingPlaceHotspot();
    } else {
      this._saveNewPlaceHotspot();
    }
  }

  _saveExistingPlaceHotspot() {
    const sel = document.getElementById('hs-existing-node-select');
    const targetNodeId = sel?.value?.trim();
    if (!targetNodeId || !CAMPUS_DATASET.nodes[targetNodeId]) {
      alert('Please select an existing place from the list.');
      return;
    }

    const targetNode = CAMPUS_DATASET.nodes[targetNodeId];
    const rawLabel = document.getElementById('hs-existing-label')?.value?.trim();
    const label = rawLabel || `Go to ${targetNode.name}`;

    const currNode = CAMPUS_DATASET.nodes[this.currentNodeId] || {};
    const { pitch, yaw } = this._droppedCoords || { pitch: 0, yaw: 0 };

    // Attach arrow to current node pointing at the existing place
    if (!currNode.hotspots) currNode.hotspots = [];
    const hotspot = {
      targetNodeId,
      pitch: parseFloat(pitch.toFixed(1)),
      yaw:   parseFloat(yaw.toFixed(1)),
      text:  label
    };
    currNode.hotspots.push(hotspot);

    // Close Modal and remove marker immediately
    if (this._createHotspotModal) this._createHotspotModal.classList.add('hidden');
    if (this._pendingMarker) this._pendingMarker.classList.add('hidden');
    this._exitEditorMode(true);

    // Instant update
    this._loadCurrentSpot();
    if (this.onGraphDatasetUpdated) this.onGraphDatasetUpdated();
    this._showToast(`↩️ Arrow to "${targetNode.name}" added!`);

    // Sync to Firebase immediately
    pushNodeUpdate(this.currentNodeId, currNode)
      .catch(err => console.error('[Firebase] Save error:', err));
  }

  _saveNewPlaceHotspot() {
    const name = document.getElementById('hs-new-name')?.value?.trim();
    if (!name) {
      alert('Please enter a name for the destination place.');
      document.getElementById('hs-new-name')?.focus();
      return;
    }

    const floor = document.getElementById('hs-new-floor')?.value || 'GF';
    const label = document.getElementById('hs-new-label')?.value?.trim() || `Walk to ${name}`;
    const returnArrow = document.getElementById('hs-new-return-arrow')?.checked;

    // Resolve panorama image for new spot
    const urlVal = document.getElementById('hs-new-image-url')?.value?.trim();
    const destinationImage = this._newSpotImageBase64 || urlVal || '';

    const currNode = CAMPUS_DATASET.nodes[this.currentNodeId] || {};
    const { pitch, yaw, mappedX, mappedY } = this._droppedCoords || { pitch: 0, yaw: 0, mappedX: 300, mappedY: 300 };

    // Generate Clean ID from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const newSpotId = `node_${floor.toLowerCase()}_${slug}_${Date.now().toString().slice(-4)}`;

    // Build return hotspot if requested
    const returnHotspots = [];
    if (returnArrow && this.currentNodeId) {
      returnHotspots.push({
        targetNodeId: this.currentNodeId,
        pitch: parseFloat((-pitch).toFixed(1)),
        yaw: parseFloat(((yaw + 180) % 360).toFixed(1)),
        text: `Back to ${currNode.name || 'Previous Area'}`
      });
    }

    // 1. Construct the new spot
    const newSpot = {
      id: newSpotId,
      name: name,
      floor: floor,
      building: currNode.building || 'Main Academic Building',
      category: 'lab',
      description: '',
      department: currNode.department || '',
      hours: '08:00 AM - 06:00 PM',
      customImage: destinationImage,
      coordinates: { x: mappedX, y: mappedY },
      heading: Math.round(((yaw % 360) + 360) % 360),
      hotspots: returnHotspots,
      facilities: []
    };

    // 2. Attach forward arrow to current node
    if (!currNode.hotspots) currNode.hotspots = [];
    const forwardHotspot = {
      targetNodeId: newSpotId,
      pitch: parseFloat(pitch.toFixed(1)),
      yaw: parseFloat(yaw.toFixed(1)),
      text: label
    };
    currNode.hotspots.push(forwardHotspot);

    // 3. Optimistic instant in-memory update
    CAMPUS_DATASET.nodes[newSpotId] = newSpot;

    // Close Modal and remove marker immediately
    if (this._createHotspotModal) this._createHotspotModal.classList.add('hidden');
    if (this._pendingMarker) this._pendingMarker.classList.add('hidden');
    this._exitEditorMode(true);

    // 4. Update UI & reload viewer immediately (0ms)
    this._loadCurrentSpot();
    if (this.onGraphDatasetUpdated) this.onGraphDatasetUpdated();
    this._showToast(`🎉 Arrow to "${name}" added!`);

    // 5. Immediate automatic Firebase RTDB sync for both nodes
    Promise.all([
      pushNodeUpdate(newSpotId, newSpot),
      pushNodeUpdate(this.currentNodeId, currNode)
    ]).catch(err => console.error('[Firebase] Save error:', err));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Change Current Spot Photo Modal
  // ──────────────────────────────────────────────────────────────────────────
  _openChangePhotoModal() {
    const currNode = CAMPUS_DATASET.nodes[this.currentNodeId];
    if (!currNode) return;

    const labelName = document.getElementById('admin-change-photo-place-name');
    if (labelName) labelName.textContent = currNode.name;

    this._changePhotoImageBase64 = null;
    const preview = document.getElementById('cp-image-preview');
    const previewImg = document.getElementById('cp-preview-img');
    const dropZone = document.getElementById('cp-image-drop');
    const urlInput = document.getElementById('cp-image-url');
    const fileInput = document.getElementById('cp-image-file');

    if (currNode.customImage) {
      if (previewImg) previewImg.src = currNode.customImage;
      if (preview) preview.classList.remove('hidden');
      if (dropZone) dropZone.style.display = 'none';
      if (urlInput) urlInput.value = !currNode.customImage.startsWith('data:') ? currNode.customImage : '';
    } else if (currNode.photo) {
      // Split-storage photo (bytes live under campus/images) — fetch for preview
      if (preview) preview.classList.add('hidden');
      if (dropZone) dropZone.style.display = '';
      if (urlInput) urlInput.value = '';
      const nodeIdAtOpen = this.currentNodeId;
      getNodeImage(nodeIdAtOpen).then((dataUrl) => {
        if (dataUrl && nodeIdAtOpen === this.currentNodeId && this._changePhotoModal &&
            !this._changePhotoModal.classList.contains('hidden')) {
          if (previewImg) previewImg.src = dataUrl;
          if (preview) preview.classList.remove('hidden');
          if (dropZone) dropZone.style.display = 'none';
        }
      }).catch(() => {});
    } else {
      if (preview) preview.classList.add('hidden');
      if (previewImg) previewImg.src = '';
      if (dropZone) dropZone.style.display = '';
      if (urlInput) urlInput.value = '';
    }

    if (this._changePhotoModal) {
      this._changePhotoModal.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons({ targets: [this._changePhotoModal] });
      this._setupChangePhotoImageUpload();
    }
  }

  _setupChangePhotoImageUpload() {
    const dropZone   = document.getElementById('cp-image-drop');
    const fileInput  = document.getElementById('cp-image-file');
    const preview    = document.getElementById('cp-image-preview');
    const previewImg = document.getElementById('cp-preview-img');
    const clearBtn   = document.getElementById('btn-cp-clear-img');
    const urlInput   = document.getElementById('cp-image-url');

    const loadFile = async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      this._showToast('⏳ Compressing 360° photo for instant sync...');
      const compressedDataUrl = await compressPanoramaImage(file);
      if (compressedDataUrl) {
        this._changePhotoImageBase64 = compressedDataUrl;
        if (previewImg) previewImg.src = compressedDataUrl;
        if (preview) preview.classList.remove('hidden');
        if (dropZone) dropZone.style.display = 'none';
        if (urlInput) urlInput.value = '';
      }
    };

    if (dropZone) {
      dropZone.onclick = () => fileInput && fileInput.click();
      dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
      dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
      dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) loadFile(file);
      };
    }

    if (fileInput) {
      fileInput.onchange = () => fileInput.files?.[0] && loadFile(fileInput.files[0]);
    }

    if (urlInput) {
      urlInput.oninput = () => {
        const val = urlInput.value.trim();
        if (val) {
          this._changePhotoImageBase64 = null;
          if (previewImg) previewImg.src = val;
          if (preview) preview.classList.remove('hidden');
          if (dropZone) dropZone.style.display = 'none';
        }
      };
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        this._changePhotoImageBase64 = '';
        if (previewImg) previewImg.src = '';
        if (preview) preview.classList.add('hidden');
        if (dropZone) dropZone.style.display = '';
        if (fileInput) fileInput.value = '';
        if (urlInput) urlInput.value = '';
      };
    }
  }

  _saveChangePhoto() {
    const currNode = CAMPUS_DATASET.nodes[this.currentNodeId];
    if (!currNode) return;

    const urlVal = document.getElementById('cp-image-url')?.value?.trim();
    const newImage = this._changePhotoImageBase64 !== null ? this._changePhotoImageBase64 : (urlVal || '');

    if (!newImage) {
      alert('Please upload or paste a URL for the new 360° photo first.');
      return;
    }

    currNode.customImage = newImage;

    // ── Bust stale cache FIRST so viewer picks up the new image ──
    const viewer = this.viewerRef;
    const bustAndReload = async () => {
      if (viewer && typeof viewer.clearNodeCache === 'function') {
        await viewer.clearNodeCache(this.currentNodeId);
      }
      this._loadCurrentSpot();
      if (this._changePhotoModal) this._changePhotoModal.classList.add('hidden');
      this._showToast('✅ 360° Photo updated!');
    };
    bustAndReload();

    // Sync to RTDB (non-blocking)
    pushNodeUpdate(this.currentNodeId, currNode).catch(err => console.error('[Firebase] Photo update error:', err));
  }

  _showToast(msg = '✅ Saved to Firebase!') {
    if (!this._saveToast) return;
    this._saveToast.textContent = msg;
    this._saveToast.classList.remove('hidden');
    setTimeout(() => this._saveToast.classList.add('hidden'), 2200);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Event Listeners Setup
  // ──────────────────────────────────────────────────────────────────────────
  _setupListeners() {
    // Gate
    const loginForm = document.getElementById('admin-login-form');
    const btnLogin = document.getElementById('btn-admin-login');
    const pwInput = document.getElementById('admin-password-input');
    
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (pwInput) this._login(pwInput.value);
      });
    } else if (btnLogin) {
      btnLogin.addEventListener('click', () => pwInput && this._login(pwInput.value));
    }
    if (pwInput) pwInput.addEventListener('keydown', (e) => e.key === 'Enter' && this._login(pwInput.value));

    const btnCloseGate = document.getElementById('btn-admin-close-gate');
    if (btnCloseGate) btnCloseGate.addEventListener('click', () => this.closePanel());

    // Top Bar
    const btnExit = document.getElementById('btn-admin-exit');
    if (btnExit) btnExit.addEventListener('click', () => this.closePanel());

    const btnChangePhoto = document.getElementById('btn-admin-change-photo');
    if (btnChangePhoto) btnChangePhoto.addEventListener('click', () => this._openChangePhotoModal());

    const btnSyncAll = document.getElementById('btn-admin-sync-all');
    if (btnSyncAll) {
      btnSyncAll.addEventListener('click', async () => {
        const ok = await syncAllToFirebase();
        if (ok) this._showToast('✅ All data synced to Firebase RTDB!');
        else alert('Firebase sync failed. Check firebaseConfig.js credentials.');
      });
    }

    const btnResetAll = document.getElementById('btn-admin-reset-all');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete ALL default places and reset to a clean slate with only the Entrance?')) {
          return;
        }
        setNodes({
          "node_gf_entrance": {
            id: "node_gf_entrance",
            name: "Main Hospital Entrance",
            category: "entrance",
            floor: "GF",
            building: "Medicover Hospital",
            customImage: "/panoramas/entrance.jpg",
            coordinates: { x: 500, y: 500 },
            heading: 0,
            description: "Main hospital entrance and emergency access.",
            department: "Emergency Entry",
            hours: "24/7 Open",
            facilities: ["Entrance"],
            hotspots: []
          }
        });
        this.currentNodeId = 'node_gf_entrance';
        this._loadCurrentSpot('node_gf_entrance');
        if (this.onGraphDatasetUpdated) this.onGraphDatasetUpdated();
        await syncAllToFirebase();
        this._showToast('✨ All default places deleted! Ready for fresh tour setup.');
      });
    }

    if (this._placeSelect) {
      this._placeSelect.addEventListener('change', () => {
        const selectedId = this._placeSelect.value;
        if (selectedId) this._loadCurrentSpot(selectedId);
      });
    }

    // Click-to-Place Setup
    this._setupClickToPlace();

    // Add Hotspot button
    const btnAddHotspot = document.getElementById('btn-admin-add-hotspot');
    if (btnAddHotspot) {
      btnAddHotspot.addEventListener('click', () => {
        if (!this.isUnlocked || !this.currentNodeId) return;
        this._enterEditorMode();
      });
    }

    // Cancel placement
    const btnCancelPlace = document.getElementById('btn-admin-cancel-place');
    if (btnCancelPlace) {
      btnCancelPlace.addEventListener('click', (e) => {
        e.stopPropagation();
        this._exitEditorMode(true);
      });
    }

    // Create Hotspot Modal buttons
    const btnCloseHsModal = document.getElementById('btn-close-hotspot-modal');
    const btnCancelHsModal = document.getElementById('btn-cancel-new-hotspot');
    const btnSaveHsModal = document.getElementById('btn-save-new-hotspot');

    const closeCreateModal = () => {
      if (this._createHotspotModal) this._createHotspotModal.classList.add('hidden');
      if (this._pendingMarker) this._pendingMarker.classList.add('hidden');
      this._exitEditorMode(true); // also clean up overlay if modal was dismissed
    };

    if (btnCloseHsModal) btnCloseHsModal.addEventListener('click', closeCreateModal);
    if (btnCancelHsModal) btnCancelHsModal.addEventListener('click', closeCreateModal);
    if (btnSaveHsModal) btnSaveHsModal.addEventListener('click', () => this._saveNewHotspot());

    // Change Photo Modal buttons
    const btnCloseCpModal = document.getElementById('btn-close-change-photo');
    const btnCancelCpModal = document.getElementById('btn-cancel-change-photo');
    const btnSaveCpModal = document.getElementById('btn-save-change-photo');

    const closeCpModal = () => {
      if (this._changePhotoModal) this._changePhotoModal.classList.add('hidden');
    };

    if (btnCloseCpModal) btnCloseCpModal.addEventListener('click', closeCpModal);
    if (btnCancelCpModal) btnCancelCpModal.addEventListener('click', closeCpModal);
    if (btnSaveCpModal) btnSaveCpModal.addEventListener('click', () => this._saveChangePhoto());
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API — called by app.js
  // ──────────────────────────────────────────────────────────────────────────
  updatePitchYaw(pitch, yaw) {
    this._currentPitch = pitch;
    this._currentYaw = yaw;
  }

  setCurrentNode(nodeId) {
    this.currentNodeId = nodeId;
    if (this.isUnlocked && this._panel && !this._panel.classList.contains('hidden')) {
      this._loadCurrentSpot(nodeId);
    }
  }

  setViewerRef(viewer) {
    this.viewerRef = viewer;
  }
}
