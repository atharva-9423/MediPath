/**
 * MediPath - Graph Database & Hospital Node Dataset
 * 18 spots across Medicover Hospital, Sangamner (Ground + First + Second floor).
 * Node IDs are stable API keys (kept across the rebrand); only display
 * content changed from the old campus dataset.
 */

export const CAMPUS_DATASET = {
  buildings: [
    { id: "bld_main", name: "Medicover Hospital", code: "MCH" }
  ],

  floors: [
    { id: "GF", name: "Ground Floor", shortName: "GF", mapSvg: "ground_floor" },
    { id: "1F", name: "First Floor", shortName: "1F", mapSvg: "first_floor" },
    { id: "2F", name: "Second Floor", shortName: "2F", mapSvg: "second_floor" },
    { id: "3F", name: "Third Floor", shortName: "3F", mapSvg: "third_floor" }
  ],

  nodes: {
    "node_gf_entrance": {
      id: "node_gf_entrance",
      name: "Main Hospital Entrance",
      category: "entrance",
      floor: "GF",
      building: "Medicover Hospital",
      customImage: "/panoramas/entrance.jpg",
      coordinates: { x: 150, y: 490 },
      heading: 0,
      description: "Main hospital entrance, emergency access and security gate.",
      department: "Emergency Entry",
      hours: "24/7 Open",
      facilities: ["Entrance", "Emergency", "Security"],
      hotspots: [
        { targetNodeId: "node_gf_lobby", pitch: 0, yaw: 20, text: "Walk to Reception Desk" },
        { targetNodeId: "node_gf_corridor", pitch: 0, yaw: 60, text: "Head to Main Corridor" }
      ]
    },
    "node_gf_lobby": {
      id: "node_gf_lobby",
      name: "Reception & Help Desk",
      category: "lobby",
      floor: "GF",
      building: "Medicover Hospital",
      customImage: "/panoramas/lobby.jpg",
      coordinates: { x: 270, y: 250 },
      heading: 0,
      description: "Patient reception, registration and help desk.",
      department: "Patient Services",
      hours: "24/7 Open",
      facilities: ["Reception", "Registration", "Help Desk"],
      hotspots: [
        { targetNodeId: "node_gf_entrance", pitch: 0, yaw: 200, text: "Back to Entrance" },
        { targetNodeId: "node_gf_corridor", pitch: 0, yaw: 40, text: "Walk to Main Corridor" },
        { targetNodeId: "node_gf_principal", pitch: 0, yaw: -40, text: "Go to Billing Desk" }
      ]
    },
    "node_gf_corridor": {
      id: "node_gf_corridor",
      name: "Ground Floor Corridor",
      category: "corridor",
      floor: "GF",
      building: "Medicover Hospital",
      customImage: "/panoramas/corridor.jpg",
      coordinates: { x: 400, y: 300 },
      heading: 0,
      description: "Central hallway connecting pharmacy, billing and lifts.",
      department: "Central Facilities",
      hours: "24/7 Open",
      facilities: ["Corridor"],
      hotspots: [
        { targetNodeId: "node_gf_lobby", pitch: 0, yaw: 220, text: "Back to Reception" },
        { targetNodeId: "node_gf_library", pitch: 0, yaw: 60, text: "Walk to Pharmacy" },
        { targetNodeId: "node_gf_canteen", pitch: 0, yaw: -60, text: "Go to Cafeteria" },
        { targetNodeId: "node_gf_elevator", pitch: 0, yaw: 0, text: "Take Elevator / Stairs" }
      ]
    },
    "node_gf_library": {
      id: "node_gf_library",
      name: "Pharmacy",
      category: "pharmacy",
      floor: "GF",
      building: "Medicover Hospital",
      customImage: "/panoramas/library.jpg",
      coordinates: { x: 640, y: 170 },
      heading: 0,
      description: "24x7 in-house pharmacy and medical store.",
      department: "Pharmacy",
      hours: "24/7 Open",
      facilities: ["Medicines", "Medical Store", "Prescriptions"],
      hotspots: [
        { targetNodeId: "node_gf_corridor", pitch: 0, yaw: 240, text: "Back to Corridor" }
      ]
    },
    "node_gf_principal": {
      id: "node_gf_principal",
      name: "Billing & Insurance Desk",
      category: "office",
      floor: "GF",
      building: "Medicover Hospital",
      customImage: "/panoramas/principal.jpg",
      coordinates: { x: 270, y: 420 },
      heading: 0,
      description: "Billing counter, insurance and TPA assistance.",
      department: "Billing",
      hours: "9AM - 9PM",
      facilities: ["Billing", "Insurance", "TPA", "Payments"],
      hotspots: [
        { targetNodeId: "node_gf_lobby", pitch: 0, yaw: 140, text: "Back to Reception" },
        { targetNodeId: "node_gf_corridor", pitch: 0, yaw: 80, text: "Walk to Corridor" }
      ]
    },
    "node_gf_canteen": {
      id: "node_gf_canteen",
      name: "Hospital Cafeteria",
      category: "food",
      floor: "GF",
      building: "Medicover Hospital",
      customImage: "/panoramas/canteen.jpg",
      coordinates: { x: 640, y: 440 },
      heading: 0,
      description: "Visitor cafeteria and food court.",
      department: "Food Services",
      hours: "8AM - 10PM",
      facilities: ["Food", "Coffee", "Snacks"],
      hotspots: [
        { targetNodeId: "node_gf_corridor", pitch: 0, yaw: 250, text: "Back to Corridor" }
      ]
    },
    "node_gf_elevator": {
      id: "node_gf_elevator",
      name: "Elevator & Stairs (GF)",
      category: "transit",
      floor: "GF",
      building: "Medicover Hospital",
      customImage: "/panoramas/elevator_gf.jpg",
      coordinates: { x: 450, y: 210 },
      heading: 0,
      description: "Elevators and staircase to wards and diagnostics.",
      department: "Vertical Transport",
      hours: "24/7 Open",
      facilities: ["Elevator", "Lift", "Stairs"],
      hotspots: [
        { targetNodeId: "node_gf_corridor", pitch: 0, yaw: 180, text: "Back to Corridor" },
        { targetNodeId: "node_1f_landing", pitch: 5, yaw: 0, text: "Go up to First Floor" }
      ]
    },
    "node_1f_landing": {
      id: "node_1f_landing",
      name: "First Floor Landing",
      category: "transit",
      floor: "1F",
      building: "Medicover Hospital",
      customImage: "/panoramas/landing_1f.jpg",
      coordinates: { x: 450, y: 210 },
      heading: 0,
      description: "First floor lift lobby, diagnostics wing entry.",
      department: "Diagnostics Wing",
      hours: "24/7 Open",
      facilities: ["Elevator", "Stairs"],
      hotspots: [
        { targetNodeId: "node_gf_elevator", pitch: -5, yaw: 180, text: "Go down to Ground Floor" },
        { targetNodeId: "node_1f_cs_lab", pitch: 0, yaw: 60, text: "Walk to Pathology Lab" },
        { targetNodeId: "node_1f_electronics", pitch: 0, yaw: 120, text: "Go to Radiology & MRI" },
        { targetNodeId: "node_1f_auditorium", pitch: 0, yaw: -60, text: "Go to Physiotherapy" },
        { targetNodeId: "node_2f_landing", pitch: 5, yaw: 0, text: "Go up to Second Floor" }
      ]
    },
    "node_1f_cs_lab": {
      id: "node_1f_cs_lab",
      name: "Pathology Lab",
      category: "lab",
      floor: "1F",
      building: "Medicover Hospital",
      customImage: "/panoramas/cs_lab.jpg",
      coordinates: { x: 200, y: 240 },
      heading: 0,
      description: "Blood tests, sample collection and pathology reports.",
      department: "Pathology",
      hours: "7AM - 9PM",
      facilities: ["Blood Test", "Reports", "Sample Collection"],
      hotspots: [
        { targetNodeId: "node_1f_landing", pitch: 0, yaw: 240, text: "Back to Landing" },
        { targetNodeId: "node_1f_cs_dept", pitch: 0, yaw: 40, text: "Go to OPD Chambers" }
      ]
    },
    "node_1f_electronics": {
      id: "node_1f_electronics",
      name: "Radiology & MRI Scan",
      category: "imaging",
      floor: "1F",
      building: "Medicover Hospital",
      customImage: "/panoramas/electronics.jpg",
      coordinates: { x: 160, y: 450 },
      heading: 0,
      description: "X-ray, sonography, CT and MRI imaging center.",
      department: "Radiology",
      hours: "8AM - 8PM",
      facilities: ["X-Ray", "MRI", "CT Scan", "Sonography"],
      hotspots: [
        { targetNodeId: "node_1f_landing", pitch: 0, yaw: 60, text: "Back to Landing" }
      ]
    },
    "node_1f_cs_dept": {
      id: "node_1f_cs_dept",
      name: "OPD Chambers",
      category: "dept",
      floor: "1F",
      building: "Medicover Hospital",
      customImage: "/panoramas/dept_office_1f.jpg",
      coordinates: { x: 450, y: 420 },
      heading: 0,
      description: "Doctor consultation chambers and OPD appointments.",
      department: "OPD",
      hours: "10AM - 8PM",
      facilities: ["Doctor", "Consultation", "Appointment", "OPD"],
      hotspots: [
        { targetNodeId: "node_1f_cs_lab", pitch: 0, yaw: 220, text: "Back to Pathology Lab" },
        { targetNodeId: "node_1f_landing", pitch: 0, yaw: 300, text: "Back to Landing" }
      ]
    },
    "node_1f_auditorium": {
      id: "node_1f_auditorium",
      name: "Physiotherapy Center",
      category: "physio",
      floor: "1F",
      building: "Medicover Hospital",
      customImage: "/panoramas/auditorium.jpg",
      coordinates: { x: 640, y: 260 },
      heading: 0,
      description: "Physiotherapy and rehabilitation center.",
      department: "Physiotherapy",
      hours: "9AM - 7PM",
      facilities: ["Physio", "Rehab", "Exercise"],
      hotspots: [
        { targetNodeId: "node_1f_landing", pitch: 0, yaw: 240, text: "Back to Landing" }
      ]
    },
    "node_1f_washroom": {
      id: "node_1f_washroom",
      name: "Restrooms (1F)",
      category: "facility",
      floor: "1F",
      building: "Medicover Hospital",
      customImage: "/panoramas/washroom_1f.jpg",
      coordinates: { x: 640, y: 470 },
      heading: 0,
      description: "First floor restrooms and baby-care room.",
      department: "Facilities",
      hours: "24/7 Open",
      facilities: ["Washroom", "Restroom"],
      hotspots: [
        { targetNodeId: "node_1f_landing", pitch: 0, yaw: 280, text: "Back to Landing" }
      ]
    },
    "node_2f_landing": {
      id: "node_2f_landing",
      name: "Second Floor Landing",
      category: "transit",
      floor: "2F",
      building: "Medicover Hospital",
      customImage: "/panoramas/landing_2f.jpg",
      coordinates: { x: 450, y: 210 },
      heading: 0,
      description: "Second floor lift lobby, critical-care wing entry.",
      department: "Critical Care Wing",
      hours: "24/7 Open",
      facilities: ["Elevator", "Stairs"],
      hotspots: [
        { targetNodeId: "node_1f_landing", pitch: -5, yaw: 180, text: "Go down to First Floor" },
        { targetNodeId: "node_2f_ai_lab", pitch: 0, yaw: 60, text: "Walk to ICU" },
        { targetNodeId: "node_2f_robotics", pitch: 0, yaw: -60, text: "Go to Operation Theatres" },
        { targetNodeId: "node_2f_dean_office", pitch: 0, yaw: 120, text: "Go to Director Office" }
      ]
    },
    "node_2f_ai_lab": {
      id: "node_2f_ai_lab",
      name: "ICU & Critical Care",
      category: "icu",
      floor: "2F",
      building: "Medicover Hospital",
      customImage: "/panoramas/ai_lab.jpg",
      coordinates: { x: 200, y: 250 },
      heading: 0,
      description: "Intensive care unit and critical-care monitoring.",
      department: "Critical Care",
      hours: "24/7 Open",
      facilities: ["ICU", "Ventilator", "Critical Care"],
      hotspots: [
        { targetNodeId: "node_2f_landing", pitch: 0, yaw: 240, text: "Back to Landing" },
        { targetNodeId: "node_2f_robotics", pitch: 0, yaw: 40, text: "Go to Operation Theatres" }
      ]
    },
    "node_2f_robotics": {
      id: "node_2f_robotics",
      name: "Operation Theatres",
      category: "ot",
      floor: "2F",
      building: "Medicover Hospital",
      customImage: "/panoramas/robotics.jpg",
      coordinates: { x: 640, y: 260 },
      heading: 0,
      description: "Operation theatre complex and surgical suites.",
      department: "Surgery",
      hours: "24/7 Open",
      facilities: ["Surgery", "Operation", "OT"],
      hotspots: [
        { targetNodeId: "node_2f_landing", pitch: 0, yaw: 250, text: "Back to Landing" }
      ]
    },
    "node_2f_conference": {
      id: "node_2f_conference",
      name: "Conference Hall",
      category: "meeting",
      floor: "2F",
      building: "Medicover Hospital",
      customImage: "/panoramas/conference_2f.jpg",
      coordinates: { x: 640, y: 420 },
      heading: 0,
      description: "Medical conference and CME training hall.",
      department: "Medical Education",
      hours: "9AM - 6PM",
      facilities: ["Meetings", "Training"],
      hotspots: [
        { targetNodeId: "node_2f_landing", pitch: 0, yaw: 280, text: "Back to Landing" }
      ]
    },
    "node_2f_dean_office": {
      id: "node_2f_dean_office",
      name: "Director Office",
      category: "office",
      floor: "2F",
      building: "Medicover Hospital",
      customImage: "/panoramas/dean_office_2f.jpg",
      coordinates: { x: 200, y: 420 },
      heading: 0,
      description: "Hospital director and administration office.",
      department: "Administration",
      hours: "10AM - 6PM",
      facilities: ["Admin", "Office"],
      hotspots: [
        { targetNodeId: "node_2f_landing", pitch: 0, yaw: 60, text: "Back to Landing" }
      ]
    }
  }
};

/**
 * Replace the in-memory nodes with live data from Firebase RTDB.
 * Called by rtdbSync.subscribeToNodes() whenever the database changes.
 * Because CAMPUS_DATASET.nodes is an object reference, mutating it here
 * affects every module that imported it.
 * @param {Object} newNodes — full nodes map from Firebase
 */
export function setNodes(newNodes) {
  if (!newNodes || typeof newNodes !== 'object') return;
  // Clear existing keys and merge in the new ones
  Object.keys(CAMPUS_DATASET.nodes).forEach(k => delete CAMPUS_DATASET.nodes[k]);
  Object.assign(CAMPUS_DATASET.nodes, newNodes);
}

/**
 * Return the current live nodes map.
 */
export function getNodes() {
  return CAMPUS_DATASET.nodes;
}
