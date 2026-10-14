/**
 * CampusWalk AI - Interactive 2D SVG Mini-Map Component
 * Syncs multi-floor blueprint rendering with graph state, path polyline, user location & orientation.
 */

import { CAMPUS_DATASET } from '../graph/dataset.js';

export class MiniMap {
  constructor(svgId, options = {}) {
    this.svg = document.getElementById(svgId);
    this.currentFloor = 'GF';
    this.onNodeClick = options.onNodeClick || null;

    this.currentNodeId = null;
    this.targetNodeId = null;
    this.activePath = [];
    this.currentHeading = 0;

    this._setupFloorButtons();
  }

  _setupFloorButtons() {
    const floorBtns = document.querySelectorAll('.floor-btn, .floor-badge');
    floorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.floor-btn, .floor-badge').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setFloor(btn.dataset.floor);
      });
    });
  }

  setFloor(floorId) {
    this.currentFloor = floorId;
    
    // Update badge on trigger button
    const label = document.getElementById('mini-floor-label');
    if (label) label.textContent = floorId;

    this.render();
  }

  updateState({ currentNodeId, targetNodeId, activePath, heading }) {
    if (currentNodeId) this.currentNodeId = currentNodeId;
    if (targetNodeId) this.targetNodeId = targetNodeId;
    if (activePath !== undefined) this.activePath = activePath;
    if (heading !== undefined) this.currentHeading = heading;

    // Automatically switch map view to current node's floor if valid
    const node = CAMPUS_DATASET.nodes[this.currentNodeId];
    if (node && node.floor && node.floor !== this.currentFloor) {
      const btn = document.querySelector(`.floor-btn[data-floor="${node.floor}"], .floor-badge[data-floor="${node.floor}"]`);
      if (btn) {
        // Update active classes + floor directly (avoid recursive click loops)
        document.querySelectorAll('.floor-btn, .floor-badge').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFloor = node.floor;
      }
    }

    this.render();
  }

  render() {
    if (!this.svg) return;
    this.svg.innerHTML = '';

    const nodesOnFloor = Object.values(CAMPUS_DATASET.nodes).filter(n => n.floor === this.currentFloor);

    // 1. Draw Architectural Floor Plan Rooms & Walls
    this._renderFloorPlanLayout(this.currentFloor);

    // 2. Draw Active Route Polyline (if path exists on current floor)
    this._renderPathPolyline();

    // 3. Draw Node Pins & Labels
    nodesOnFloor.forEach(node => {
      const isCurrent = node.id === this.currentNodeId;
      const isTarget = node.id === this.targetNodeId;
      const isInPath = this.activePath.includes(node.id);

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', `map-node-pin ${isCurrent ? 'active' : ''} ${isTarget ? 'target' : ''}`);
      group.setAttribute('transform', `translate(${node.coordinates.x}, ${node.coordinates.y})`);

      // Node Pin Outer Circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'node-bg');
      circle.setAttribute('r', isCurrent || isTarget ? '10' : '7');

      // Click Event
      group.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onNodeClick) this.onNodeClick(node.id);
      });

      group.appendChild(circle);

      // Render Orientation Cone on Current Node Pin
      if (isCurrent) {
        const cone = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        cone.setAttribute('class', 'map-user-cone');
        
        // Calculate orientation triangle pointing in user's heading angle
        const rad = ((this.currentHeading - 90) * Math.PI) / 180;
        const x1 = Math.cos(rad) * 24;
        const y1 = Math.sin(rad) * 24;
        const radL = rad - 0.4;
        const radR = rad + 0.4;
        const xL = Math.cos(radL) * 12;
        const yL = Math.sin(radL) * 12;
        const xR = Math.cos(radR) * 12;
        const yR = Math.sin(radR) * 12;

        cone.setAttribute('points', `0,0 ${xL},${yL} ${x1},${y1} ${xR},${yR}`);
        group.appendChild(cone);
      }

      // Room Title Text Below Pin
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'map-room-text');
      text.setAttribute('y', '20');
      text.textContent = node.name.length > 16 ? node.name.substring(0, 15) + '…' : node.name;
      group.appendChild(text);

      this.svg.appendChild(group);
    });
  }

  _renderFloorPlanLayout(floor) {
    const layoutGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layoutGroup.setAttribute('class', 'floor-layout');

    // Outer Boundary Wall
    const outerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outerRect.setAttribute('x', '40');
    outerRect.setAttribute('y', '40');
    outerRect.setAttribute('width', '720');
    outerRect.setAttribute('height', '520');
    outerRect.setAttribute('rx', '16');
    outerRect.setAttribute('class', 'map-wall');
    layoutGroup.appendChild(outerRect);

    // Floor Specific Room Partitions
    const rooms = this._getRoomsForFloor(floor);
    rooms.forEach(r => {
      const roomRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      roomRect.setAttribute('x', r.x);
      roomRect.setAttribute('y', r.y);
      roomRect.setAttribute('width', r.w);
      roomRect.setAttribute('height', r.h);
      roomRect.setAttribute('rx', '8');
      roomRect.setAttribute('class', 'map-room');
      layoutGroup.appendChild(roomRect);
    });

    this.svg.appendChild(layoutGroup);
  }

  _getRoomsForFloor(floor) {
    if (floor === 'GF') {
      return [
        { x: 60, y: 440, w: 180, h: 100, label: "Entrance" },
        { x: 180, y: 140, w: 180, h: 220, label: "Billing & Reception" },
        { x: 380, y: 140, w: 140, h: 140, label: "Elevators & Stairs" },
        { x: 540, y: 60, w: 200, h: 220, label: "Pharmacy" },
        { x: 540, y: 340, w: 200, h: 200, label: "Cafeteria" }
      ];
    } else if (floor === '1F') {
      return [
        { x: 60, y: 140, w: 280, h: 200, label: "Pathology Lab" },
        { x: 60, y: 360, w: 200, h: 180, label: "Radiology & MRI" },
        { x: 380, y: 140, w: 140, h: 140, label: "Elevators & Stairs" },
        { x: 540, y: 140, w: 200, h: 240, label: "Physiotherapy" },
        { x: 540, y: 400, w: 200, h: 140, label: "Restrooms" }
      ];
    } else {
      return [
        { x: 60, y: 140, w: 280, h: 220, label: "ICU" },
        { x: 380, y: 140, w: 140, h: 140, label: "Elevators & Stairs" },
        { x: 540, y: 140, w: 200, h: 240, label: "Operation Theatres" },
        { x: 540, y: 400, w: 200, h: 140, label: "Director Office" }
      ];
    }
  }

  _renderPathPolyline() {
    if (!this.activePath || this.activePath.length < 2) return;

    // Filter path nodes on current floor
    const points = [];
    this.activePath.forEach(id => {
      const node = CAMPUS_DATASET.nodes[id];
      if (node && node.floor === this.currentFloor) {
        points.push(`${node.coordinates.x},${node.coordinates.y}`);
      }
    });

    if (points.length < 2) return;

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('class', 'map-path-line');
    polyline.setAttribute('points', points.join(' '));
    this.svg.appendChild(polyline);
  }
}
