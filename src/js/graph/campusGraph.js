/**
 * CampusWalk AI - Graph Engine & Pathfinding Solver
 * Implements Dijkstra & BFS for shortest path navigation across multi-floor graph topology.
 */

import { CAMPUS_DATASET } from './dataset.js';

export class CampusGraph {
  constructor() {
    this.nodes = CAMPUS_DATASET.nodes;
    this.adjacencyMap = new Map();
    this._buildAdjacencyGraph();
  }

  /**
   * Rebuild adjacency map in-place using latest node data.
   * Call this after setNodes() updates CAMPUS_DATASET.nodes from Firebase.
   */
  rebuild() {
    this.nodes = CAMPUS_DATASET.nodes;
    this.adjacencyMap.clear();
    this._buildAdjacencyGraph();
  }

  /**
   * Build adjacency list from node hotspot links
   */
  _buildAdjacencyGraph() {
    for (const [nodeId, nodeData] of Object.entries(this.nodes)) {
      if (!this.adjacencyMap.has(nodeId)) {
        this.adjacencyMap.set(nodeId, []);
      }

      const hotspots = Array.isArray(nodeData.hotspots) ? nodeData.hotspots : [];
      hotspots.forEach(hotspot => {
        const targetId = hotspot.targetNodeId;
        const targetNode = this.nodes[targetId];

        if (targetNode) {
          // Compute Euclidean distance on map floor plan + floor transition penalty
          const dist = this._calculateEdgeWeight(nodeData, targetNode);
          
          this.adjacencyMap.get(nodeId).push({
            nodeId: targetId,
            weight: dist,
            text: hotspot.text,
            pitch: hotspot.pitch,
            yaw: hotspot.yaw
          });
        }
      });
    }
  }

  /**
   * Calculate edge weight (Euclidean 2D distance + penalty for floor changes)
   */
  _calculateEdgeWeight(nodeA, nodeB) {
    const dx = nodeA.coordinates.x - nodeB.coordinates.x;
    const dy = nodeA.coordinates.y - nodeB.coordinates.y;
    let dist = Math.sqrt(dx * dx + dy * dy) * 0.1; // Scale down to approximate meters

    // Floor transition penalty (elevators / stairs take extra time)
    if (nodeA.floor !== nodeB.floor) {
      dist += 25; // 25m equivalent penalty for elevator/stair transition
    }

    return Math.max(5, Math.round(dist));
  }

  /**
   * Compute shortest path using Dijkstra's Algorithm
   * @param {string} startNodeId 
   * @param {string} targetNodeId 
   * @returns {Object|null} Path result object
   */
  findShortestPath(startNodeId, targetNodeId) {
    if (!this.nodes[startNodeId] || !this.nodes[targetNodeId]) {
      return null;
    }

    if (startNodeId === targetNodeId) {
      return {
        path: [startNodeId],
        totalDistanceMeters: 0,
        estimatedTimeSeconds: 0,
        instructions: [{ step: 1, text: "You are already at your destination.", nodeId: startNodeId }]
      };
    }

    const distances = {};
    const previous = {};
    const unvisited = new Set();

    for (const nodeId of Object.keys(this.nodes)) {
      distances[nodeId] = Infinity;
      previous[nodeId] = null;
      unvisited.add(nodeId);
    }

    distances[startNodeId] = 0;

    while (unvisited.size > 0) {
      // Find node with minimum distance
      let currentId = null;
      let minDistance = Infinity;

      for (const nodeId of unvisited) {
        if (distances[nodeId] < minDistance) {
          minDistance = distances[nodeId];
          currentId = nodeId;
        }
      }

      if (currentId === null || currentId === targetNodeId) {
        break; // Target reached or unreachable
      }

      unvisited.delete(currentId);

      const neighbors = this.adjacencyMap.get(currentId) || [];
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor.nodeId)) continue;

        const alt = distances[currentId] + neighbor.weight;
        if (alt < distances[neighbor.nodeId]) {
          distances[neighbor.nodeId] = alt;
          previous[neighbor.nodeId] = currentId;
        }
      }
    }

    // Reconstruct path
    const path = [];
    let curr = targetNodeId;
    while (curr !== null) {
      path.unshift(curr);
      curr = previous[curr];
    }

    // If path starts with startNodeId, route found!
    if (path[0] !== startNodeId) {
      return null; // Unreachable
    }

    const totalDistance = Math.round(distances[targetNodeId]);
    const estSeconds = Math.round(totalDistance * 1.2); // ~1.2s per meter walking speed
    const instructions = this.generateTurnByTurnInstructions(path);

    return {
      path,
      totalDistanceMeters: totalDistance,
      estimatedTimeSeconds: estSeconds,
      instructions
    };
  }

  /**
   * Generate human readable turn-by-turn guidance for path
   * @param {Array<string>} path 
   * @returns {Array<Object>}
   */
  generateTurnByTurnInstructions(path) {
    const instructions = [];
    const floorOrder = { 'GF': 0, '1F': 1, '2F': 2, '3F': 3 };

    for (let i = 0; i < path.length - 1; i++) {
      const fromId = path[i];
      const toId = path[i + 1];
      const fromNode = this.nodes[fromId];
      const toNode = this.nodes[toId];
      if (!fromNode || !toNode) continue;

      const edge = (this.adjacencyMap.get(fromId) || []).find(e => e.nodeId === toId);
      const actionText = edge ? edge.text : `Walk toward ${toNode.name}`;

      let icon = "arrow-up";
      if (fromNode.floor !== toNode.floor) {
        const fromLevel = floorOrder[fromNode.floor] ?? 0;
        const toLevel = floorOrder[toNode.floor] ?? 0;
        icon = toLevel > fromLevel ? "arrow-up-circle" : "arrow-down-circle";
      } else if (edge && edge.yaw > 30) {
        icon = "arrow-up-right";
      } else if (edge && edge.yaw < -30) {
        icon = "arrow-up-left";
      }

      instructions.push({
        step: i + 1,
        fromNodeId: fromId,
        toNodeId: toId,
        text: actionText,
        icon: icon,
        fromFloor: fromNode.floor,
        toFloor: toNode.floor,
        targetName: toNode.name
      });
    }

    return instructions;
  }

  getNode(nodeId) {
    return this.nodes[nodeId] || null;
  }

  getAllNodes() {
    return Object.values(this.nodes);
  }

  getNodesByFloor(floorId) {
    return Object.values(this.nodes).filter(n => n.floor === floorId);
  }
}
