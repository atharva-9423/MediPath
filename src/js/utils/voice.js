/**
 * CampusWalk AI - Voice & Speech Assistant Utility
 * Wraps Web Speech API (SpeechRecognition for voice input & SpeechSynthesis for audio guidance).
 */

export class VoiceAssistant {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis || null;
    this.isListening = false;
    this.autoSpeechEnabled = true;

    this._initRecognition();
  }

  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    } else {
      console.warn('Web Speech API (SpeechRecognition) is not supported in this browser.');
    }
  }

  /**
   * Listen for user voice query
   * @param {Function} onResult 
   * @param {Function} onError 
   */
  startListening(onResult, onError) {
    if (!this.recognition) {
      if (onError) onError('Voice recognition is not supported in your browser.');
      return;
    }

    if (this.isListening) return;

    this.isListening = true;

    this.recognition.onresult = (event) => {
      this.isListening = false;
      const transcript = event.results[0][0].transcript;
      if (onResult) onResult(transcript);
    };

    this.recognition.onerror = (event) => {
      this.isListening = false;
      if (onError) onError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };

    try {
      this.recognition.start();
    } catch (e) {
      this.isListening = false;
      if (onError) onError(e.message);
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  /**
   * Speak turn-by-turn text aloud using Web SpeechSynthesis
   * @param {string} text 
   */
  speak(text) {
    if (!this.synthesis || !this.autoSpeechEnabled) return;

    // Cancel any ongoing speech
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    this.synthesis.speak(utterance);
  }

  toggleSpeech(enabled) {
    this.autoSpeechEnabled = enabled;
    if (!enabled && this.synthesis) {
      this.synthesis.cancel();
    }
  }
}
