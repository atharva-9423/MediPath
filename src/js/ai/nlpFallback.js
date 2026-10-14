/**
 * MediPath - Local NLP & Fuzzy Intent Parser
 * Performs client-side destination extraction when offline or when no Groq API Key is supplied.
 */

import { CAMPUS_DATASET } from '../graph/dataset.js';

export class NLPFallbackEngine {
  constructor() {
    // NOTE: nodes are read live from CAMPUS_DATASET on every query
    // (never cached) so Firebase updates are always reflected.

    // Keyword Aliases Dictionary (MediPath hospital terms)
    this.aliases = {
      "pathology": "node_1f_cs_lab",
      "blood test": "node_1f_cs_lab",
      "blood report": "node_1f_cs_lab",
      "lab report": "node_1f_cs_lab",
      "sample": "node_1f_cs_lab",

      "x-ray": "node_1f_electronics",
      "xray": "node_1f_electronics",
      "mri": "node_1f_electronics",
      "ct scan": "node_1f_electronics",
      "scan": "node_1f_electronics",
      "radiology": "node_1f_electronics",
      "sonography": "node_1f_electronics",
      "ultrasound": "node_1f_electronics",

      "opd": "node_1f_cs_dept",
      "doctor": "node_1f_cs_dept",
      "consultation": "node_1f_cs_dept",
      "appointment": "node_1f_cs_dept",
      "chamber": "node_1f_cs_dept",

      "physio": "node_1f_auditorium",
      "physiotherapy": "node_1f_auditorium",
      "rehab": "node_1f_auditorium",

      "icu": "node_2f_ai_lab",
      "critical care": "node_2f_ai_lab",
      "ventilator": "node_2f_ai_lab",
      "intensive": "node_2f_ai_lab",

      "operation": "node_2f_robotics",
      "surgery": "node_2f_robotics",
      "theatre": "node_2f_robotics",
      "theater": "node_2f_robotics",
      "ot ": "node_2f_robotics",

      "director": "node_2f_dean_office",
      "director office": "node_2f_dean_office",
      "admin office": "node_2f_dean_office",

      "conference": "node_2f_conference",
      "meeting room": "node_2f_conference",
      "cme": "node_2f_conference",

      "pharmacy": "node_gf_library",
      "medicine": "node_gf_library",
      "medical store": "node_gf_library",
      "drugs": "node_gf_library",
      "prescription": "node_gf_library",

      "billing": "node_gf_principal",
      "payment": "node_gf_principal",
      "insurance": "node_gf_principal",
      "tpa": "node_gf_principal",
      "bill": "node_gf_principal",

      "cafeteria": "node_gf_canteen",
      "canteen": "node_gf_canteen",
      "food": "node_gf_canteen",
      "coffee": "node_gf_canteen",
      "eat": "node_gf_canteen",

      "elevator": "node_gf_elevator",
      "lift": "node_gf_elevator",
      "stairs": "node_gf_elevator",

      "washroom": "node_1f_washroom",
      "restroom": "node_1f_washroom",
      "toilet": "node_1f_washroom",
      "bathroom": "node_1f_washroom",

      "emergency": "node_gf_entrance",
      "entrance": "node_gf_entrance",
      "gate": "node_gf_entrance",
      "casualty": "node_gf_entrance",
      "reception": "node_gf_lobby",
      "help desk": "node_gf_lobby",
      "lobby": "node_gf_lobby",
      "registration": "node_gf_lobby"
    };
  }

  /**
   * Process natural language query and extract top matching node
   * @param {string} query 
   * @returns {Object} Result object with targetNode, reasoning, and allMatches
   */
  processQuery(query) {
    const cleaned = (query || '').toLowerCase().trim();
    if (!cleaned) return { targetNode: null, reasoning: "Query was empty.", matches: [] };

    const liveNodes = Object.values(CAMPUS_DATASET.nodes);

    // 1. Direct Alias Match (skip aliases whose target node doesn't exist)
    for (const [alias, nodeId] of Object.entries(this.aliases)) {
      if (cleaned.includes(alias)) {
        const node = CAMPUS_DATASET.nodes[nodeId];
        if (!node) continue;
        return {
          targetNode: node,
          reasoning: `Extracted intent "${alias}" mapped to ${node.name}`,
          matches: [node]
        };
      }
    }

    // 2. Fuzzy Score matching against Node Name, Description, Department & Facilities
    const scoredNodes = liveNodes.map(node => {
      let score = 0;
      const facilities = Array.isArray(node.facilities) ? node.facilities.join(" ") : '';
      const textToSearch = `${node.name || ''} ${node.description || ''} ${node.department || ''} ${facilities}`.toLowerCase();

      const words = cleaned.split(/\s+/).filter(w => w.length > 2);
      words.forEach(word => {
        if (textToSearch.includes(word)) {
          score += 10;
        }
        if (node.name.toLowerCase().includes(word)) {
          score += 25; // Bonus for title match
        }
      });

      return { node, score };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredNodes.length > 0) {
      return {
        targetNode: scoredNodes[0].node,
          reasoning: `Matched top relevant hospital location "${scoredNodes[0].node.name}"`,
        matches: scoredNodes.map(s => s.node)
      };
    }

    return {
      targetNode: null,
      reasoning: `No specific hospital location matched "${query}". Please select from list below.`,
      matches: liveNodes.slice(0, 5)
    };
  }
}
