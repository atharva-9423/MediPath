/**
 * CampusWalk AI - Tactical Navigation UI Manager
 * Handles 5-tab tactical navigation dock, tactical bottom sheet, breadcrumb updates, and modal interactions.
 */

import { CAMPUS_DATASET } from '../graph/dataset.js';

export class NavigationUI {
  constructor({ onSearchQuery, onSelectDestination, onCancelNavigation, onVoiceSearchTrigger, liveMapInstance, viewerInstance, onSpeechToggle } = {}) {
    this.onSearchQuery = onSearchQuery || null;
    this.onSelectDestination = onSelectDestination || null;
    this.onCancelNavigation = onCancelNavigation || null;
    this.onVoiceSearchTrigger = onVoiceSearchTrigger || null;
    this.onSpeechToggle = onSpeechToggle || null;
    this.liveMapInstance = liveMapInstance || null;
    this.viewerInstance = viewerInstance || null;

    this._initElements();
    this._bindEvents();
  }

  _initElements() {
    this.exploreHeader = document.getElementById('explore-header');
    this.homeViewContainer = document.getElementById('home-view-container');
    this.hudControlsGroup = document.getElementById('hud-controls-group');
    this.tacticalSheet = document.getElementById('tactical-bottom-sheet');
    this.mapViewContainer = document.getElementById('map-view-container');
    this.navBanner = document.getElementById('nav-banner');
    this.searchModal = document.getElementById('search-modal');
    this.settingsModal = document.getElementById('settings-modal');
    this.voiceOverlay = document.getElementById('voice-overlay');
    
    this.searchInput = document.getElementById('ai-search-input');
    this.homeSearchInput = document.getElementById('home-search-input');
    this.btnHomeMic = document.getElementById('btn-home-mic');
    this.dockTabs = document.querySelectorAll('.tactical-dock-tab');
    this.panoramaViewContainer = document.getElementById('panorama-view-container');
    this.panoramaLocationLabel = document.getElementById('panorama-location-label');
    this.dynamicIsland = document.getElementById('dynamic-island');
    this.islandName = document.getElementById('island-location-name');
    this.islandSub = document.getElementById('island-location-sub');
    this.btnCollapseIsland = document.getElementById('btn-collapse-island');
    this.islandSearchInput = document.getElementById('island-search-input');
    this.islandSearchDropdown = document.getElementById('island-search-dropdown');
    this.btnIslandMic = document.getElementById('btn-island-mic');
    this.btnToggleGyro = document.getElementById('btn-toggle-gyro');
    this.btnFloatingGyro = document.getElementById('btn-floating-gyro');
    this.gyroStatusLabel = document.getElementById('gyro-status-label');

    // Dedicated Full-Screen Search Page Elements
    this.searchViewContainer = document.getElementById('search-view-container');
    this.dedicatedSearchInput = document.getElementById('dedicated-search-input');
    this.btnClearSearch = document.getElementById('btn-clear-search');
    this.btnPageSearchMic = document.getElementById('btn-page-search-mic');
    this.dedicatedSearchResultsList = document.getElementById('dedicated-search-results-list');
    this.searchEmptyState = document.getElementById('search-empty-state');
    this.searchCountPill = document.getElementById('search-count-pill');
    this.searchPageAiBox = document.getElementById('search-page-ai-box');
    this.searchPageAiText = document.getElementById('search-page-ai-text');

    // Dynamic Sheet Elements
    this.sheetTitle = document.getElementById('sheet-node-title');
    this.sheetSub = document.getElementById('sheet-node-sub');
    this.statFloor = document.getElementById('sheet-stat-floor');
    this.statHours = document.getElementById('sheet-stat-hours');
    this.statCapacity = document.getElementById('sheet-stat-capacity');
    this.statStatus = document.getElementById('sheet-stat-status');
    this.destinationsList = document.getElementById('sheet-destinations-list');
    this.btnNavigate = document.getElementById('btn-sheet-navigate');
    this.hudBreadcrumb = document.getElementById('hud-breadcrumb-text');

    // Dynamic Island Active Navigation Elements
    this.islandCompactIcon = document.getElementById('island-compact-icon');
    this.islandModeBadge = document.getElementById('island-mode-badge');
    this.islandNormalSearchBox = document.getElementById('island-normal-search-box');
    this.islandNavControlsPanel = document.getElementById('island-nav-controls-panel');
    this.islandNavArrowIcon = document.getElementById('island-nav-arrow-icon');
    this.islandNavInstruction = document.getElementById('island-nav-instruction');
    this.islandNavMetrics = document.getElementById('island-nav-metrics');
    this.btnIslandSpeech = document.getElementById('btn-island-speech');
    this.btnIslandExitNav = document.getElementById('btn-island-exit-nav');
  }

  _bindEvents() {
    // 1. 5-Tab Tactical Navigation Switcher (pill tabs + orange action btn)
    const allNavBtns = document.querySelectorAll('.tactical-dock-tab, .dock-action-btn');
    allNavBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // iOS Dynamic Island Expand & Collapse Interaction
    if (this.dynamicIsland) {
      this.dynamicIsland.addEventListener('click', (e) => {
        // If click came from an interactive button or input inside expanded island, ignore toggle
        if (e.target.closest('button') || e.target.closest('input')) return;
        this.dynamicIsland.classList.toggle('expanded');
        // Closing the capsule always dismisses the results panel with it
        if (!this.dynamicIsland.classList.contains('expanded')) {
          this.hideIslandDropdown();
          if (this.islandSearchInput) this.islandSearchInput.blur();
        }
      });
    }

    if (this.btnCollapseIsland) {
      this.btnCollapseIsland.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.dynamicIsland) {
          this.dynamicIsland.classList.remove('expanded');
        }
        this.hideIslandDropdown();
      });
    }

    // Dynamic Island Search Bar & Mic — live dropdown, no page redirect
    if (this.islandSearchInput) {
      this.islandSearchInput.addEventListener('click', (e) => e.stopPropagation());
      this.islandSearchInput.addEventListener('input', () => {
        this.renderIslandDropdown(this.islandSearchInput.value.trim());
      });
      this.islandSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = this.islandSearchDropdown
            ? this.islandSearchDropdown.querySelector('.island-result-item')
            : null;
          if (first && first.dataset.nodeId) {
            this._selectIslandResult(first.dataset.nodeId);
          } else {
            this.renderIslandDropdown(this.islandSearchInput.value.trim());
          }
        } else if (e.key === 'Escape') {
          this.hideIslandDropdown();
          this.islandSearchInput.blur();
        }
      });
    }

    if (this.islandSearchDropdown) {
      this.islandSearchDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    if (this.btnIslandMic) {
      this.btnIslandMic.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onVoiceSearchTrigger) this.onVoiceSearchTrigger();
      });
    }

    // Dynamic Island Active Navigation Buttons (Exit Nav & Sound)
    if (this.btnIslandExitNav) {
      this.btnIslandExitNav.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onCancelNavigation) this.onCancelNavigation();
      });
    }

    if (this.btnIslandSpeech) {
      this.btnIslandSpeech.addEventListener('click', (e) => {
        e.stopPropagation();
        this._isAudioMuted = !this._isAudioMuted;
        if (this._isAudioMuted) {
          this.btnIslandSpeech.innerHTML = `<i data-lucide="volume-x"></i> Muted`;
        } else {
          this.btnIslandSpeech.innerHTML = `<i data-lucide="volume-2"></i> Sound`;
        }
        if (window.lucide) window.lucide.createIcons({ targets: [this.btnIslandSpeech] });
      });
    }

    // 3D View Gyroscope Mode Toggle Handler
    const handleGyroToggle = async (e) => {
      if (e) e.stopPropagation();
      if (!this.viewerInstance || typeof this.viewerInstance.toggleGyro !== 'function') return;

      const isActive = await this.viewerInstance.toggleGyro();
      if (isActive) {
        if (this.btnToggleGyro) this.btnToggleGyro.classList.add('active');
        if (this.btnFloatingGyro) this.btnFloatingGyro.classList.add('active');
        if (this.gyroStatusLabel) this.gyroStatusLabel.textContent = 'GYRO ON';
      } else {
        if (this.btnToggleGyro) this.btnToggleGyro.classList.remove('active');
        if (this.btnFloatingGyro) this.btnFloatingGyro.classList.remove('active');
        if (this.gyroStatusLabel) this.gyroStatusLabel.textContent = 'GYRO OFF';
      }
    };

    if (this.btnToggleGyro) this.btnToggleGyro.addEventListener('click', handleGyroToggle);
    if (this.btnFloatingGyro) this.btnFloatingGyro.addEventListener('click', handleGyroToggle);

    // Auto-close Dynamic Island when clicking outside of it
    // (clicks inside the floating results panel don't collapse it)
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#island-search-dropdown')) return;
      if (this.dynamicIsland && this.dynamicIsland.classList.contains('expanded')) {
        if (!this.dynamicIsland.contains(e.target)) {
          this.dynamicIsland.classList.remove('expanded');
          this.hideIslandDropdown();
        }
      }
    });

    // Bento Cards Interactions
    const bentoMapCard = document.getElementById('bento-card-map');
    if (bentoMapCard) {
      bentoMapCard.addEventListener('click', () => this.switchTab('map'));
    }

    const bentoVoiceCard = document.getElementById('bento-card-voice');
    if (bentoVoiceCard) {
      bentoVoiceCard.addEventListener('click', () => {
        if (this.onVoiceSearchTrigger) this.onVoiceSearchTrigger();
      });
    }

    const gotoCards = document.querySelectorAll('.bento-card[data-goto-node]');
    gotoCards.forEach(card => {
      card.addEventListener('click', () => {
        const nodeId = card.dataset.gotoNode;
        if (nodeId && this.onSelectDestination) {
          this.switchTab('map');
          this.onSelectDestination(nodeId);
        }
      });
    });

    // Home Search Input & Mic
    if (this.homeSearchInput) {
      this.homeSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = this.homeSearchInput.value.trim();
          if (query && this.onSearchQuery) {
            this.onSearchQuery(query);
          }
        }
      });
    }

    if (this.btnHomeMic) {
      this.btnHomeMic.addEventListener('click', () => {
        if (this.onVoiceSearchTrigger) this.onVoiceSearchTrigger();
      });
    }

    // 2. Filter Chips in Tactical Sheet
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filterSheetDestinations(chip.dataset.category);
      });
    });

    // 3. Search Input ENTER Key Handler
    if (this.searchInput) {
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = this.searchInput.value.trim();
          if (query && this.onSearchQuery) {
            this.onSearchQuery(query);
          }
        }
      });
    }

    // 4. Voice Search Trigger Button
    const btnVoice = document.getElementById('btn-voice-search');
    if (btnVoice) {
      btnVoice.addEventListener('click', () => {
        if (this.onVoiceSearchTrigger) this.onVoiceSearchTrigger();
      });
    }

    const btnCancelVoice = document.getElementById('btn-cancel-voice');
    if (btnCancelVoice) {
      btnCancelVoice.addEventListener('click', () => {
        this.hideVoiceOverlay();
      });
    }

    // 5. Navigate Button in Sheet
    if (this.btnNavigate) {
      this.btnNavigate.addEventListener('click', () => {
        const currentNodeId = this.currentNodeId || 'node_1f_cs_lab';
        if (this.onSelectDestination) {
          this.onSelectDestination(currentNodeId);
        }
      });
    }

    // 6. Settings Modal Handlers
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const settingsForm = document.getElementById('settings-form');

    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => {
        this.settingsModal.classList.add('hidden');
      });
    }

    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = document.getElementById('groq-api-key').value.trim();
        const model = document.getElementById('groq-model-select').value;
        localStorage.setItem('groq_api_key', key);
        localStorage.setItem('groq_model', model);
        const autoSpeechEl = document.getElementById('setting-auto-speech');
        if (autoSpeechEl && this.onSpeechToggle) {
          this.onSpeechToggle(autoSpeechEl.checked);
        }
        this.settingsModal.classList.add('hidden');
        alert('Settings saved successfully!');
      });
    }

    // 7. Search Modal Close
    const btnCloseSearch = document.getElementById('btn-close-search');
    if (btnCloseSearch) {
      btnCloseSearch.addEventListener('click', () => {
        this.searchModal.classList.add('hidden');
      });
    }

    // 8. Cancel Navigation Button & Locate Me
    const btnLocate = document.getElementById('btn-locate-me');
    if (btnLocate) {
      btnLocate.addEventListener('click', () => {
        if (this.liveMapInstance) {
          this.liveMapInstance.centerOnUser();
        }
      });
    }

    const btnCancelNav = document.getElementById('btn-cancel-nav');
    if (btnCancelNav) {
      btnCancelNav.addEventListener('click', () => {
        if (this.onCancelNavigation) this.onCancelNavigation();
      });
    }

    // 9. Dedicated Search Page Live Typing Filter & Category Chips
    if (this.dedicatedSearchInput) {
      this.dedicatedSearchInput.addEventListener('input', () => {
        const query = this.dedicatedSearchInput.value.trim();
        if (this.btnClearSearch) {
          if (query.length > 0) {
            this.btnClearSearch.classList.remove('hidden');
          } else {
            this.btnClearSearch.classList.add('hidden');
          }
        }
        const activeChip = document.querySelector('#search-category-pills .search-pill-chip.active');
        const category = activeChip ? activeChip.dataset.category : 'all';
        this.renderDedicatedSearchResults(query, category);
      });
    }

    if (this.btnClearSearch) {
      this.btnClearSearch.addEventListener('click', () => {
        if (this.dedicatedSearchInput) {
          this.dedicatedSearchInput.value = '';
          this.dedicatedSearchInput.focus();
        }
        this.btnClearSearch.classList.add('hidden');
        const activeChip = document.querySelector('#search-category-pills .search-pill-chip.active');
        const category = activeChip ? activeChip.dataset.category : 'all';
        this.renderDedicatedSearchResults('', category);
      });
    }

    if (this.btnPageSearchMic) {
      this.btnPageSearchMic.addEventListener('click', () => {
        if (this.onVoiceSearchTrigger) this.onVoiceSearchTrigger();
      });
    }

    // Search Category Pill Chips Handler
    const searchPillChips = document.querySelectorAll('#search-category-pills .search-pill-chip');
    searchPillChips.forEach(chip => {
      chip.addEventListener('click', () => {
        searchPillChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const query = this.dedicatedSearchInput ? this.dedicatedSearchInput.value.trim() : '';
        this.renderDedicatedSearchResults(query, chip.dataset.category);
      });
    });

    // 10. Item clicks inside Destination List
    this.bindDestinationListEvents();
  }

  bindDestinationListEvents() {
    if (!this.destinationsList) return;
    const items = this.destinationsList.querySelectorAll('.tactical-dest-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const nodeId = item.dataset.nodeId;
        if (nodeId && this.onSelectDestination) {
          this.switchTab('map');
          this.onSelectDestination(nodeId);
        }
      });
    });
  }

  _islandResultIcon(node) {
    const cat = (node.category || '').toLowerCase();
    const name = (node.name || '').toLowerCase();
    if (cat === 'lab' || name.includes('pathology') || name.includes('blood')) return 'microscope';
    if (cat === 'pharmacy' || name.includes('pharmacy') || name.includes('medicine')) return 'pill';
    if (cat === 'imaging' || name.includes('radiology') || name.includes('scan') || name.includes('x-ray')) return 'scan-line';
    if (cat === 'icu' || name.includes('icu') || name.includes('critical')) return 'heart-pulse';
    if (cat === 'ot' || name.includes('operation') || name.includes('surgery')) return 'activity';
    if (cat === 'physio' || name.includes('physio')) return 'dumbbell';
    if (cat === 'dept' || name.includes('opd') || name.includes('doctor') || name.includes('consult')) return 'stethoscope';
    if (cat === 'office' || name.includes('billing') || name.includes('office') || name.includes('director')) return 'receipt';
    if (cat === 'food' || name.includes('cafeteria') || name.includes('canteen')) return 'utensils';
    if (cat === 'transit' || name.includes('elevator') || name.includes('landing') || name.includes('stair')) return 'arrow-up-down';
    if (cat === 'entrance' || name.includes('entrance') || name.includes('emergency') || name.includes('gate')) return 'siren';
    if (cat === 'lobby' || name.includes('reception') || name.includes('help desk')) return 'bell-concierge';
    if (name.includes('corridor')) return 'footprints';
    return 'map-pin';
  }

  /**
   * Live dropdown results inside the Dynamic Island — user stays in 3D view,
   * no redirect to the search page.
   */
  renderIslandDropdown(query = '') {
    const dd = this.islandSearchDropdown;
    if (!dd) return;
    const q = (query || '').toLowerCase();

    if (!q) {
      this.hideIslandDropdown();
      return;
    }

    const matches = Object.values(CAMPUS_DATASET.nodes).filter(n => {
      const name = (n.name || '').toLowerCase();
      const bldg = (n.building || '').toLowerCase();
      const dept = (n.department || '').toLowerCase();
      const fl = String(n.floor || '').toLowerCase();
      const cat = (n.category || '').toLowerCase();
      return name.includes(q) || bldg.includes(q) || dept.includes(q) || fl.includes(q) || cat.includes(q);
    }).slice(0, 6);

    if (matches.length === 0) {
      dd.innerHTML = `<div class="island-no-results">No places match "${query}"</div>`;
    } else {
      dd.innerHTML = matches.map(node => {
        const floorStr = String(node.floor || '').toUpperCase();
        return `
          <div class="island-result-item" data-node-id="${node.id}">
            <div class="island-result-icon"><i data-lucide="${this._islandResultIcon(node)}"></i></div>
            <div class="island-result-text">
              <strong>${node.name}</strong>
              <span>${floorStr}${node.building ? ' • ' + node.building : ''}</span>
            </div>
            <i data-lucide="navigation" class="island-result-go"></i>
          </div>
        `;
      }).join('');

      dd.querySelectorAll('.island-result-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this._selectIslandResult(item.dataset.nodeId);
        });
      });
    }

    dd.classList.remove('hidden');
    this._positionIslandDropdown();
    if (window.lucide) window.lucide.createIcons({ targets: [dd] });
  }

  /**
   * Pin the floating panel exactly below the capsule's live bottom edge
   * (plus a gap), so the first row can never slide under the island —
   * regardless of compact / expanded / navigating heights.
   */
  _positionIslandDropdown() {
    const dd = this.islandSearchDropdown;
    if (!dd || !this.dynamicIsland) return;
    const container = this.panoramaViewContainer || dd.offsetParent;
    if (!container) return;
    try {
      const islandRect = this.dynamicIsland.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      dd.style.top = `${Math.round(islandRect.bottom - containerRect.top + 10)}px`;
    } catch {}
  }

  hideIslandDropdown() {
    if (this.islandSearchDropdown) {
      this.islandSearchDropdown.classList.add('hidden');
      this.islandSearchDropdown.innerHTML = '';
    }
  }

  /**
   * User picked a dropdown result — stay in 3D view and start navigation.
   */
  _selectIslandResult(nodeId) {
    if (!nodeId) return;
    this.hideIslandDropdown();
    if (this.islandSearchInput) this.islandSearchInput.value = '';
    if (this.dynamicIsland) this.dynamicIsland.classList.remove('expanded');
    if (this.onSelectDestination) this.onSelectDestination(nodeId);
  }

  switchTab(tabName) {
    // A tab switch always dismisses the island results panel (no stale rows)
    this.hideIslandDropdown();
    if (this.islandSearchInput) this.islandSearchInput.blur();
    const allNavBtns = document.querySelectorAll('.tactical-dock-tab, .dock-action-btn');
    allNavBtns.forEach(t => {
      if (t.dataset.tab === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    // Always hide panorama page unless guide tab
    if (this.panoramaViewContainer) this.panoramaViewContainer.classList.add('hidden');
    // Always hide dedicated search page unless search tab
    if (this.searchViewContainer) this.searchViewContainer.classList.add('hidden');

    if (tabName === 'home') {
      if (this.homeViewContainer) this.homeViewContainer.classList.remove('hidden');
      if (this.mapViewContainer) this.mapViewContainer.classList.add('hidden');
      if (this.hudControlsGroup) this.hudControlsGroup.classList.add('hidden');
      if (this.tacticalSheet) this.tacticalSheet.classList.add('hidden');
    } else if (tabName === 'map') {
      if (this.homeViewContainer) this.homeViewContainer.classList.add('hidden');
      if (this.mapViewContainer) this.mapViewContainer.classList.remove('hidden');
      if (this.hudControlsGroup) this.hudControlsGroup.classList.remove('hidden');
      if (this.tacticalSheet) this.tacticalSheet.classList.remove('hidden');
      if (this.liveMapInstance) {
        setTimeout(() => {
          this.liveMapInstance.resize();
          this.liveMapInstance.centerOnUser();
        }, 100);
      }
    } else if (tabName === 'guide') {
      // 3D Panorama View — show container, update label, resize viewer
      if (this.homeViewContainer) this.homeViewContainer.classList.add('hidden');
      if (this.mapViewContainer) this.mapViewContainer.classList.add('hidden');
      if (this.panoramaViewContainer) this.panoramaViewContainer.classList.remove('hidden');
      // Update HUD label from current node name
      if (this.panoramaLocationLabel && this._currentNodeName) {
        this.panoramaLocationLabel.textContent = this._currentNodeName;
      }
      // Resize Pannellum after container becomes visible
      if (this.viewerInstance && typeof this.viewerInstance.resize === 'function') {
        setTimeout(() => this.viewerInstance.resize(), 80);
      }
    } else if (tabName === 'search') {
      // Dedicated Full-Screen Search Page
      if (this.homeViewContainer) this.homeViewContainer.classList.add('hidden');
      if (this.mapViewContainer) this.mapViewContainer.classList.add('hidden');
      if (this.hudControlsGroup) this.hudControlsGroup.classList.add('hidden');
      if (this.tacticalSheet) this.tacticalSheet.classList.add('hidden');
      if (this.searchViewContainer) this.searchViewContainer.classList.remove('hidden');

      // Initial render of all search results
      const currentQuery = this.dedicatedSearchInput ? this.dedicatedSearchInput.value.trim() : '';
      const activeChip = document.querySelector('#search-category-pills .search-pill-chip.active');
      const category = activeChip ? activeChip.dataset.category : 'all';
      this.renderDedicatedSearchResults(currentQuery, category);

      if (this.dedicatedSearchInput) {
        setTimeout(() => this.dedicatedSearchInput.focus(), 60);
      }
    } else if (tabName === 'profile') {
      if (this.settingsModal) this.settingsModal.classList.remove('hidden');
    }
  }

  showLocationDetails(node, adjacentNodes = []) {
    if (!node) return;
    this.currentNodeId = node.id;
    this._currentNodeName = node.name || 'Main Entrance';

    // Keep panorama Dynamic Island labels in sync with current node (only when NOT actively navigating)
    const isNavigating = this.dynamicIsland && this.dynamicIsland.classList.contains('navigating');
    if (!isNavigating) {
      if (this.panoramaLocationLabel) {
        this.panoramaLocationLabel.textContent = this._currentNodeName;
      }
      if (this.islandName) {
        this.islandName.textContent = this._currentNodeName;
      }
      if (this.islandSub) {
        const bldg = (node.building || 'MEDICOVER HOSPITAL').toUpperCase();
        const floorStr = String(node.floor || '01').padStart(2, '0');
        this.islandSub.textContent = `${bldg} • FLOOR ${floorStr}`;
      }
    }

    // Update Header Breadcrumbs
    if (this.hudBreadcrumb) {
      const nodeNum = node.id.replace(/[^0-9]/g, '') || '047';
      this.hudBreadcrumb.innerHTML = `
        <span class="campus-tag">MEDICOVER</span>
        <span class="slash">/</span>
        <span class="block-tag">${(node.building || 'MEDICOVER HOSPITAL').toUpperCase()}</span>
        <span class="slash">/</span>
        <span class="node-tag">NODE ${nodeNum.padStart(3, '0')}</span>
      `;
    }

    // Update Sheet Header
    if (this.sheetTitle) this.sheetTitle.textContent = node.name;
    if (this.sheetSub) {
      const floorNum = String(node.floor || '01').padStart(2, '0');
      this.sheetSub.textContent = `FLOOR ${floorNum}`;
    }

    // Sync minimal floor-badge stack in the bottom sheet (GF / 1F / 2F)
    const floorBadges = document.querySelectorAll('.hud-floor-stack .floor-badge');
    if (floorBadges.length) {
      floorBadges.forEach(b => {
        if (b.dataset.floor === node.floor) b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    // Update Stat Row
    if (this.statFloor) this.statFloor.textContent = node.floor || '01';
    if (this.statHours) this.statHours.textContent = node.hours || '9–6 PM';
    if (this.statCapacity) this.statCapacity.textContent = node.capacity || '60';
    if (this.statStatus) this.statStatus.textContent = node.status || 'OPEN';

    // Populate Destination List with Adjacent / Nearby Nodes
    if (this.destinationsList && adjacentNodes.length > 0) {
      this.destinationsList.innerHTML = adjacentNodes.map((adjId, idx) => {
        const adjNode = CAMPUS_DATASET.nodes[adjId];
        if (!adjNode) return '';
        const adjNum = adjId.replace(/[^0-9]/g, '') || '01';
        const distM = (idx + 1) * 25 + 15;
        const timeS = distM > 60 ? `${Math.round(distM/60)}m` : `${Math.round(distM/1.2)}s`;

        return `
          <div class="tactical-dest-item" data-node-id="${adjNode.id}">
            <div class="dest-left">
              <span class="dest-index">${(idx + 1).toString().padStart(2, '0')}</span>
              <div class="dest-info">
                <strong class="dest-name">${adjNode.name}</strong>
                <span class="dest-meta">NODE-${adjNum.padStart(3, '0')} · ${(adjNode.department || adjNode.building || 'DEPARTMENT').toUpperCase()}</span>
              </div>
            </div>
            <div class="dest-right">
              <span class="dest-distance">${distM}m</span>
              <span class="dest-time">${timeS}</span>
            </div>
          </div>
        `;
      }).join('');

      this.bindDestinationListEvents();
    }
  }

  filterSheetDestinations(category) {
    let nodes = Object.values(CAMPUS_DATASET.nodes);
    if (category !== 'nearby') {
      nodes = nodes.filter(n => n.category === category);
    }

    if (this.destinationsList) {
      this.destinationsList.innerHTML = nodes.slice(0, 5).map((node, idx) => {
        const nodeNum = node.id.replace(/[^0-9]/g, '') || '01';
        const distM = (idx + 1) * 35 + 20;
        const timeS = distM > 60 ? `${Math.round(distM/60)}m` : `${Math.round(distM/1.2)}s`;

        return `
          <div class="tactical-dest-item" data-node-id="${node.id}">
            <div class="dest-left">
              <span class="dest-index">${(idx + 1).toString().padStart(2, '0')}</span>
              <div class="dest-info">
                <strong class="dest-name">${node.name}</strong>
                <span class="dest-meta">NODE-${nodeNum.padStart(3, '0')} · ${(node.department || node.building || 'DEPARTMENT').toUpperCase()}</span>
              </div>
            </div>
            <div class="dest-right">
              <span class="dest-distance">${distM}m</span>
              <span class="dest-time">${timeS}</span>
            </div>
          </div>
        `;
      }).join('');

      this.bindDestinationListEvents();
    }
  }

  showTurnByTurnStep(stepInstruction, currentStepIndex, totalSteps, remainingMeters, targetName = null) {
    if (!stepInstruction) return;

    // Update 2D Map Navigation Banner
    if (this.navBanner) {
      this.navBanner.classList.remove('hidden');
      const textEl = document.getElementById('nav-instruction-text');
      const metricsEl = document.getElementById('nav-metrics-text');
      const iconBox = document.getElementById('nav-step-icon');
      if (textEl) textEl.textContent = stepInstruction.text;
      if (metricsEl) metricsEl.textContent = `Step ${currentStepIndex} of ${totalSteps} • ~${remainingMeters}m remaining`;
      if (iconBox) {
        iconBox.innerHTML = `<i data-lucide="${stepInstruction.icon || 'arrow-up'}"></i>`;
        if (window.lucide) window.lucide.createIcons({ targets: [iconBox] });
      }
    }

    // Mark Dynamic Island as navigating
    if (this.dynamicIsland) {
      this.dynamicIsland.classList.add('navigating');
    }

    // In Compact Pill Mode: Directly display live text instruction instead of place name!
    if (this.panoramaLocationLabel) {
      this.panoramaLocationLabel.textContent = stepInstruction.text;
    }

    // Switch Dynamic Island Expanded View to Active Navigation Mode
    if (this.islandModeBadge) this.islandModeBadge.textContent = 'NAVIGATING TO';

    // Set Target Destination Name in expanded header title
    if (this.islandName && targetName) {
      this.islandName.textContent = targetName;
    }

    if (this.islandNormalSearchBox) this.islandNormalSearchBox.classList.add('hidden');
    if (this.islandNavControlsPanel) this.islandNavControlsPanel.classList.remove('hidden');
    this.hideIslandDropdown();

    if (this.islandNavInstruction) this.islandNavInstruction.textContent = stepInstruction.text;
    if (this.islandNavMetrics) {
      this.islandNavMetrics.textContent = `Step ${currentStepIndex} of ${totalSteps} • ~${remainingMeters}m remaining`;
    }

    if (this.islandNavArrowIcon) {
      this.islandNavArrowIcon.innerHTML = `<i data-lucide="${stepInstruction.icon || 'navigation'}"></i>`;
      if (window.lucide) window.lucide.createIcons({ targets: [this.islandNavArrowIcon] });
    }

    if (this.islandCompactIcon) {
      const parent = this.islandCompactIcon.parentElement;
      if (parent) {
        parent.innerHTML = `<span class="island-dot"></span><i data-lucide="${stepInstruction.icon || 'navigation'}" class="island-icon nav-active-icon"></i>`;
        if (window.lucide) window.lucide.createIcons({ targets: [parent] });
      }
    }
  }

  hideTurnByTurnBanner() {
    if (this.navBanner) this.navBanner.classList.add('hidden');

    // Reset Dynamic Island to Normal Mode
    if (this.dynamicIsland) {
      this.dynamicIsland.classList.remove('navigating');
    }

    if (this.panoramaLocationLabel) {
      this.panoramaLocationLabel.textContent = this._currentNodeName || 'Main Entrance';
    }

    if (this.islandLocationName) {
      this.islandLocationName.textContent = this._currentNodeName || 'Main Entrance';
    }

    if (this.islandModeBadge) this.islandModeBadge.textContent = '3D VIEW';
    if (this.islandNormalSearchBox) this.islandNormalSearchBox.classList.remove('hidden');
    if (this.islandNavControlsPanel) this.islandNavControlsPanel.classList.add('hidden');

    const container = document.querySelector('.island-left');
    if (container) {
      container.innerHTML = `
        <span class="island-dot"></span>
        <i data-lucide="box" class="island-icon" id="island-compact-icon"></i>
      `;
      if (window.lucide) window.lucide.createIcons({ targets: [container] });
    }
  }

  showSearchResults(query, reasoning, matches) {
    this.switchTab('search');

    if (this.dedicatedSearchInput) {
      this.dedicatedSearchInput.value = query || '';
      if (this.btnClearSearch) {
        if (query && query.length > 0) {
          this.btnClearSearch.classList.remove('hidden');
        } else {
          this.btnClearSearch.classList.add('hidden');
        }
      }
    }

    this.renderDedicatedSearchResults(query, 'all', reasoning, matches);
  }

  renderDedicatedSearchResults(query = '', category = 'all', aiReasoning = null, explicitMatches = null) {
    let nodes = explicitMatches || Object.values(CAMPUS_DATASET.nodes);

    // Category / Floor filtering (exact floor match)
    if (category !== 'all') {
      const cat = String(category).toUpperCase();
      if (['GF', '1F', '2F', '3F'].includes(cat)) {
        nodes = nodes.filter(n => String(n.floor || '').toUpperCase() === cat);
      } else {
        nodes = nodes.filter(n => n.category === category);
      }
    }

    // Text query filtering
    if (query && !explicitMatches) {
      const q = query.toLowerCase();
      nodes = nodes.filter(n => {
        const name = (n.name || '').toLowerCase();
        const bldg = (n.building || '').toLowerCase();
        const dept = (n.department || '').toLowerCase();
        const fl = String(n.floor || '').toLowerCase();
        const cat = (n.category || '').toLowerCase();
        return name.includes(q) || bldg.includes(q) || dept.includes(q) || fl.includes(q) || cat.includes(q);
      });
    }

    // Update result count pill
    if (this.searchCountPill) {
      this.searchCountPill.textContent = `${nodes.length} ${nodes.length === 1 ? 'Place' : 'Places'}`;
    }

    // AI Reasoning Box
    if (this.searchPageAiBox && this.searchPageAiText) {
      if (aiReasoning) {
        this.searchPageAiBox.classList.remove('hidden');
        this.searchPageAiText.textContent = aiReasoning;
      } else {
        this.searchPageAiBox.classList.add('hidden');
      }
    }

    // Handle Empty State
    if (!this.dedicatedSearchResultsList || !this.searchEmptyState) return;

    if (nodes.length === 0) {
      this.dedicatedSearchResultsList.innerHTML = '';
      this.searchEmptyState.classList.remove('hidden');
      return;
    }

    this.searchEmptyState.classList.add('hidden');

    // Render Well-Organized Structured Cards
    this.dedicatedSearchResultsList.innerHTML = nodes.map(node => {
      const cat = node.category || 'facility';
      const nm = (node.name || '').toLowerCase();
      let iconName = 'map-pin';
      let badgeClass = 'badge-facility';

      if (cat === 'lab' || nm.includes('pathology') || nm.includes('blood')) {
        iconName = 'microscope';
        badgeClass = 'badge-lab';
      } else if (cat === 'pharmacy' || nm.includes('pharmacy') || nm.includes('medicine')) {
        iconName = 'pill';
        badgeClass = 'badge-lab';
      } else if (cat === 'imaging' || nm.includes('radiology') || nm.includes('scan') || nm.includes('x-ray')) {
        iconName = 'scan-line';
        badgeClass = 'badge-lab';
      } else if (cat === 'icu' || nm.includes('icu') || nm.includes('critical')) {
        iconName = 'heart-pulse';
        badgeClass = 'badge-classroom';
      } else if (cat === 'ot' || nm.includes('operation') || nm.includes('surgery')) {
        iconName = 'activity';
        badgeClass = 'badge-classroom';
      } else if (cat === 'physio' || nm.includes('physio')) {
        iconName = 'dumbbell';
        badgeClass = 'badge-facility';
      } else if (cat === 'dept' || nm.includes('opd') || nm.includes('doctor')) {
        iconName = 'stethoscope';
        badgeClass = 'badge-dept';
      } else if (cat === 'office' || nm.includes('billing') || nm.includes('office') || nm.includes('director')) {
        iconName = 'receipt';
        badgeClass = 'badge-dept';
      } else if (cat === 'food' || nm.includes('cafeteria') || nm.includes('canteen')) {
        iconName = 'utensils';
        badgeClass = 'badge-facility';
      } else if (cat === 'transit' || nm.includes('elevator') || nm.includes('landing')) {
        iconName = 'arrow-up-down';
        badgeClass = 'badge-dept';
      } else if (cat === 'entrance' || nm.includes('entrance') || nm.includes('emergency')) {
        iconName = 'siren';
        badgeClass = 'badge-dept';
      } else if (cat === 'lobby' || nm.includes('reception')) {
        iconName = 'bell-concierge';
        badgeClass = 'badge-dept';
      }

      const floorStr = String(node.floor || '01').padStart(2, '0');
      const bldgStr = node.building || 'Main Building';

      return `
        <div class="search-result-card" data-node-id="${node.id}">
          <div class="result-card-top">
            <div class="result-icon-badge">
              <i data-lucide="${iconName}"></i>
            </div>
            <div class="result-title-block">
              <h3 class="result-card-name">${node.name}</h3>
              <p class="result-card-sub">Floor ${floorStr} &bull; ${bldgStr}</p>
            </div>
          </div>

          <div class="result-card-actions">
            <button class="btn-action-view3d" data-action="3d" data-node-id="${node.id}">
              <i data-lucide="box"></i> 3D View
            </button>
            <button class="btn-action-map2d" data-action="2d" data-node-id="${node.id}">
              <i data-lucide="map-pin"></i> 2D Map
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind click events on card action buttons
    const cards = this.dedicatedSearchResultsList.querySelectorAll('.search-result-card');
    cards.forEach(card => {
      const nodeId = card.dataset.nodeId;
      const btn3D = card.querySelector('.btn-action-view3d');
      const btn2D = card.querySelector('.btn-action-map2d');

      if (btn3D) {
        btn3D.addEventListener('click', (e) => {
          e.stopPropagation();
          this.switchTab('guide');
          if (this.onSelectDestination) {
            this.onSelectDestination(nodeId);
          }
        });
      }

      if (btn2D) {
        btn2D.addEventListener('click', (e) => {
          e.stopPropagation();
          this.switchTab('map');
          if (this.onSelectDestination) {
            this.onSelectDestination(nodeId);
          }
        });
      }

      // Default card body click leads to 3D view
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.switchTab('guide');
        if (this.onSelectDestination) {
          this.onSelectDestination(nodeId);
        }
      });
    });

    if (window.lucide) window.lucide.createIcons({ targets: [this.dedicatedSearchResultsList] });
  }

  openCategorySearch(category) {
    this.switchTab('search');
    const chip = document.querySelector(`#search-category-pills .search-pill-chip[data-category="${category}"]`);
    if (chip) {
      document.querySelectorAll('#search-category-pills .search-pill-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    }
    const query = this.dedicatedSearchInput ? this.dedicatedSearchInput.value.trim() : '';
    this.renderDedicatedSearchResults(query, category);
  }

  showVoiceOverlay() {
    if (this.voiceOverlay) this.voiceOverlay.classList.remove('hidden');
  }

  hideVoiceOverlay() {
    if (this.voiceOverlay) this.voiceOverlay.classList.add('hidden');
  }

  updateVoiceStatusText(text) {
    const el = document.getElementById('voice-status-text');
    if (el) el.textContent = text;
  }
}
