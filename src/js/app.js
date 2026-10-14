/**
 * CampusWalk AI - Main Application Entry & Coordinator
 * Bootstraps 360 Viewer, Graph Solver, 2D Mini-Map, Live GPS Map, AI Engine, Speech & Admin Editor.
 */

import { CampusGraph } from './graph/campusGraph.js';
import { PanoramaViewer } from './viewer/panoramaViewer.js';
import { MiniMap } from './ui/miniMap.js';
import { LiveMap } from './map/liveMap.js';
import { NavigationUI } from './ui/navigationUI.js';
import { GroqAIClient } from './ai/groqClient.js';
import { VoiceAssistant } from './utils/voice.js';
import { AdminEditor } from './ui/adminEditor.js';
import { initFirebase, seedIfEmpty, subscribeToNodes } from './firebase/rtdbSync.js';
import { setNodes } from './graph/dataset.js';

class CampusWalkApp {
  constructor() {
    this.graph = new CampusGraph();
    this.aiClient = new GroqAIClient();
    this.voice = new VoiceAssistant();

    this.currentNodeId = 'node_gf_entrance';
    this.targetNodeId = null;
    this.activeRoute = null;
    this.currentStepIndex = 0;

    this.viewer = new PanoramaViewer('panorama-viewer', {
      onHotspotClick: (fromId, targetId) => this.handleHotspotClick(fromId, targetId),
      onViewChange: (pitchYaw) => {
        if (this.adminEditor && typeof this.adminEditor.updatePitchYaw === 'function') {
          this.adminEditor.updatePitchYaw(pitchYaw.pitch, pitchYaw.yaw);
        }
        if (this.miniMap) {
          this.miniMap.updateState({ heading: pitchYaw.yaw });
        }
      }
    });

    this.miniMap = new MiniMap('minimap-svg', {
      onNodeClick: (nodeId) => this.navigateToNode(nodeId)
    });

    this.liveMap = new LiveMap('google-2d-map', {
      onNodeClick: (nodeId) => this.navigateToNode(nodeId)
    });

    this.adminEditor = new AdminEditor({
      onGraphDatasetUpdated: () => {
        this.graph.rebuild();
        this.miniMap.render();
        if (this.liveMap && typeof this.liveMap.refreshMarkers === 'function') {
          this.liveMap.refreshMarkers();
        }
      }
    });
    // Give admin editor access to the panorama viewer
    this.adminEditor.setViewerRef(this.viewer);

    this.ui = new NavigationUI({
      onSearchQuery: (query) => this.handleAISearch(query),
      onSelectDestination: (nodeId) => this.startNavigationToDestination(nodeId),
      onCancelNavigation: () => this.cancelActiveNavigation(),
      onVoiceSearchTrigger: () => this.handleVoiceSearch(),
      onSpeechToggle: (enabled) => this.voice.toggleSpeech(enabled),
      liveMapInstance: this.liveMap,
      viewerInstance: this.viewer
    });

    // Voice overlay cancel must also stop the microphone
    document.getElementById('btn-cancel-voice')?.addEventListener('click', () => {
      this.voice.stopListening();
    });
    // Settings speech checkbox live-wires immediately
    document.getElementById('setting-auto-speech')?.addEventListener('change', (e) => {
      this.voice.toggleSpeech(e.target.checked);
    });

    this.init();
  }

  async init() {
    console.log('🚀 Initializing MediPath Navigation Engine...');

    // 1. Instantly render initial node on Frame 1 (Zero-wait First Paint)
    this.navigateToNode(this.currentNodeId);
    this.ui.switchTab('home');

    // Initialize Lucide icons across document immediately
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // 2. Request fullscreen on first user interaction
    this._setupFullscreen();

    // 3. Concurrently initialize Firebase RTDB & background preloading (Non-blocking)
    (async () => {
      try {
        const firebaseOk = await initFirebase();

        if (firebaseOk) {
          await seedIfEmpty();

          // Subscribe to live node updates
          this._rtdbUnsubscribe = await subscribeToNodes((nodes) => {
            this._applyRemoteNodes(nodes);
          });
        }

        // Background cache warming for adjacent panoramas
        const allNodes = this.graph.getAllNodes();
        this.viewer.preloadAdjacentNodes(allNodes).catch(() => {});
      } catch (err) {
        console.warn('[Init] Background sync warning:', err);
      }
    })();
  }

  /**
   * Small signature of the fields that affect the visible 3D scene.
   * Inline data: URLs are normalized so the uploader's own RTDB echo
   * (stripped remote copy vs local inline copy) doesn't trigger a reload.
   */
  _nodeSyncSig(node) {
    if (!node) return '';
    let img = node.customImage || '';
    if (typeof img === 'string' && img.startsWith('data:')) {
      img = '[img]'; // local inline bytes == remote split photo, don't flicker
    } else if (node.photo && !img) {
      img = '[img]';
    }
    return JSON.stringify({
      h: node.hotspots || [],
      n: node.name,
      f: node.floor,
      b: node.building,
      p: node.photo ? 1 : 0,
      pr: node.photoRev || 0,
      img
    });
  }

  /**
   * Apply a remote node snapshot instantly:
   * - metadata (hotspots, names) swaps in with zero network cost (tiny payload)
   * - the 3D viewer reloads ONLY if the current spot visibly changed
   * - a photoRev bump busts that node's caches so the new photo loads fresh
   */
  async _applyRemoteNodes(nodes) {
    if (!nodes || typeof nodes !== 'object') return;
    const prevCurrent = this.graph.getNode(this.currentNodeId);
    const prevSig = this._nodeSyncSig(prevCurrent);
    const prevPhotoRev = prevCurrent?.photoRev || 0;

    setNodes(nodes);
    this.graph.rebuild();
    this.miniMap.render();
    if (this.liveMap && typeof this.liveMap.refreshMarkers === 'function') {
      this.liveMap.refreshMarkers();
    }

    const currentNode = this.graph.getNode(this.currentNodeId);
    if (!currentNode) return;
    if (this._nodeSyncSig(currentNode) === prevSig) return; // nothing visible changed

    if ((currentNode.photoRev || 0) !== prevPhotoRev) {
      // New photo published for the spot on screen — drop stale bytes first
      try { await this.viewer.clearNodeCache(this.currentNodeId); } catch {}
    }
    this.viewer.loadNode(currentNode, {}).catch(() => {});
  }

  _setupFullscreen() {    const requestFS = () => {
      const el = document.documentElement;
      const rfs =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;
      if (rfs) {
        rfs.call(el).catch(() => {});
      }
      // Remove listeners after first interaction
      document.removeEventListener('touchstart', requestFS);
      document.removeEventListener('click', requestFS);
    };

    // Listen for first tap or click
    document.addEventListener('touchstart', requestFS, { once: true });
    document.addEventListener('click', requestFS, { once: true });
  }

  /**
   * Navigate directly to a target panorama node
   */
  async navigateToNode(nodeId, targetHeading = undefined) {
    const node = this.graph.getNode(nodeId);
    if (!node) return;

    this.currentNodeId = nodeId;
    this.adminEditor.setCurrentNode(nodeId);

    // Find next node in active navigation route if routing
    let highlightedHotspotNodeId = null;
    if (this.activeRoute && this.currentStepIndex < this.activeRoute.path.length - 1) {
      if (this.activeRoute.path[this.currentStepIndex] === nodeId) {
        highlightedHotspotNodeId = this.activeRoute.path[this.currentStepIndex + 1];
      }
    }

    // Load 360 viewer node
    await this.viewer.loadNode(node, {
      targetHeading,
      highlightedHotspotNodeId
    });

    // Update Adjacent Nodes for Tactical Sheet
    const adjacentNodes = (node.hotspots || []).map(h => h.targetNodeId);
    this.ui.showLocationDetails(node, adjacentNodes);

    // Pre-render adjacent panoramas around current location in background
    const adjacentNodeObjects = (node.hotspots || [])
      .map(h => this.graph.getNode(h.targetNodeId))
      .filter(Boolean);
    this.viewer.preloadAdjacentNodes(adjacentNodeObjects);

    // Update 2D Map Focus
    if (this.liveMap) {
      this.liveMap.focusNode(nodeId);
    }

    // Update Mini-Map State
    this.miniMap.updateState({
      currentNodeId: this.currentNodeId,
      targetNodeId: this.targetNodeId,
      activePath: this.activeRoute ? this.activeRoute.path : [],
      heading: this.viewer.getPitchYaw().yaw
    });

    // If destination reached during active route
    if (this.activeRoute && nodeId === this.targetNodeId) {
      this.voice.speak(`You have arrived at your destination: ${node.name}`);
      alert(`🎉 Destination Reached: ${node.name}!`);
      this.cancelActiveNavigation();
    }
  }

  /**
   * Handle user hotspot click on 360 viewer
   */
  async handleHotspotClick(fromId, targetId) {
    // If active route, check if user clicked along the path
    if (this.activeRoute) {
      const nextExpectedNode = this.activeRoute.path[this.currentStepIndex + 1];
      if (targetId === nextExpectedNode) {
        this.currentStepIndex++;
        this.updateNavigationProgress();
      }
    }

    await this.navigateToNode(targetId);
  }

  /**
   * Handle natural language AI search
   */
  async handleAISearch(query) {
    console.log(`🤖 Processing navigation query: "${query}"`);
    
    // Process query using Groq API / Local NLP engine
    const result = await this.aiClient.parseDestination(query);

    if (result.targetNode) {
      this.ui.showSearchResults(query, result.reasoning, result.matches);
    } else if (result.matches && result.matches.length > 0) {
      // No confident match — still show closest candidates instead of a dead-end alert
      this.ui.showSearchResults(query, result.reasoning, result.matches);
    } else {
      alert(`Could not find a matching hospital location for "${query}".`);
    }
  }

  /**
   * Start turn-by-turn navigation from current node to target destination
   */
  async startNavigationToDestination(destinationNodeId) {
    this.ui.switchTab('guide');
    this.targetNodeId = destinationNodeId;

    // Calculate shortest path using Dijkstra
    const route = this.graph.findShortestPath(this.currentNodeId, this.targetNodeId);

    if (!route || route.path.length === 0) {
      alert('Could not calculate a route to the selected destination.');
      return;
    }

    this.activeRoute = route;
    this.currentStepIndex = 0;

    console.log(`🗺️ Path Calculated (${route.totalDistanceMeters}m):`, route.path);

    // Update Mini-Map
    this.miniMap.updateState({
      currentNodeId: this.currentNodeId,
      targetNodeId: this.targetNodeId,
      activePath: this.activeRoute.path
    });

    // Reload current node to highlight next hotspot
    await this.navigateToNode(this.currentNodeId);
    this.updateNavigationProgress();
  }

  updateNavigationProgress() {
    if (!this.activeRoute) return;

    const currentInstruction = this.activeRoute.instructions[this.currentStepIndex];
    const totalSteps = this.activeRoute.instructions.length;
    const remainingMeters = this.activeRoute.totalDistanceMeters;
    const targetNode = this.graph.getNode(this.targetNodeId);
    const targetName = targetNode ? targetNode.name : 'Destination';

    if (currentInstruction) {
      this.ui.showTurnByTurnStep(currentInstruction, this.currentStepIndex + 1, totalSteps, remainingMeters, targetName);
      this.voice.speak(currentInstruction.text);
    }
  }

  cancelActiveNavigation() {
    this.activeRoute = null;
    this.targetNodeId = null;
    this.currentStepIndex = 0;
    this.ui.hideTurnByTurnBanner();
    this.miniMap.updateState({ activePath: [], targetNodeId: null });
  }

  /**
   * Handle Web Speech API Voice Search
   */
  handleVoiceSearch() {
    this.ui.showVoiceOverlay();
    this.ui.updateVoiceStatusText('Listening for destination...');

    this.voice.startListening(
      (transcript) => {
        this.ui.updateVoiceStatusText(`Heard: "${transcript}"`);
        setTimeout(() => {
          this.ui.hideVoiceOverlay();
          const searchInput = document.getElementById('ai-search-input');
          if (searchInput) searchInput.value = transcript;
          this.handleAISearch(transcript);
        }, 800);
      },
      (error) => {
        this.ui.updateVoiceStatusText(`Voice Error: ${error}`);
        setTimeout(() => this.ui.hideVoiceOverlay(), 1500);
      }
    );
  }
}

// Bootstrap Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new CampusWalkApp();
});
