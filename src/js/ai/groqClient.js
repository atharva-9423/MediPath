/**
 * MediPath - Groq API Client & Intent Extractor
 * Uses Llama 3 on Groq Cloud to process natural language navigation queries with JSON mode.
 */

import { CAMPUS_DATASET } from '../graph/dataset.js';
import { NLPFallbackEngine } from './nlpFallback.js';

export class GroqAIClient {
  constructor() {
    this.fallbackEngine = new NLPFallbackEngine();
  }

  getApiKey() {
    return localStorage.getItem('groq_api_key') || '';
  }

  getModel() {
    return localStorage.getItem('groq_model') || 'llama-3.3-70b-versatile';
  }

  /**
   * Understand user prompt and extract destination node ID
   * @param {string} prompt 
   * @returns {Promise<Object>} Result with targetNode, reasoning, matches
   */
  async parseDestination(prompt) {
    const apiKey = this.getApiKey();

    // Fallback if no API Key provided
    if (!apiKey) {
      console.log('No Groq API Key found. Using local NLP engine.');
      return this.fallbackEngine.processQuery(prompt);
    }

    const availableNodes = Object.values(CAMPUS_DATASET.nodes).map(n => ({
      id: n.id,
      name: n.name,
      floor: n.floor,
      department: n.department,
      description: n.description
    }));

    const systemPrompt = `You are MediPath, a hospital navigation assistant for Medicover Hospital, Sangamner.
Your job is to identify the user's intended destination from their query and return JSON.

AVAILABLE HOSPITAL LOCATIONS:
${JSON.stringify(availableNodes, null, 2)}

Strict Output JSON Format:
{
  "target_node_id": "exact_node_id_here",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this destination was chosen."
}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: this.getModel(),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);

      const targetNode = CAMPUS_DATASET.nodes[content.target_node_id];

      if (targetNode) {
        return {
          targetNode,
          reasoning: content.reasoning || `Groq AI matched destination "${targetNode.name}"`,
          matches: [targetNode]
        };
      } else {
        return this.fallbackEngine.processQuery(prompt);
      }
    } catch (err) {
      console.warn('Groq API call failed or timed out. Falling back to local NLP engine.', err);
      return this.fallbackEngine.processQuery(prompt);
    }
  }
}
