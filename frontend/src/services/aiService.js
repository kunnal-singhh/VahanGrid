/**
 * ============================================================================
 * VAHANGRID MOBILITY COPILOT (AI SERVICE)
 * ============================================================================
 *
 * Uses Google Gemini API (@google/genai) for real AI responses.
 * Falls back to built-in mock knowledge if the API key is missing or the
 * network call fails, so the app never hard-crashes.
 *
 * Key format: AQ.* (Google's auth key format introduced May 2026)
 * ============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import { AI_MOCK_KNOWLEDGE } from '../data/mockData';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

// System prompt that gives Gemini the VahanGrid persona and India EV context
const SYSTEM_PROMPT = `You are the VahanGrid Mobility Copilot, an expert AI assistant for India's unified EV charging platform.

Your role:
- Help EV drivers with range feasibility, route planning, and charging stop recommendations across India
- Explain tariffs, pricing, and costs from CPOs like Tata Power EZ Charge, Statiq, ChargeZone, Jio-bp pulse, and Kazam
- Guide users through wallet top-ups, CDR receipts, and payment settlements
- Explain OCPP 2.0.1 charging protocols in plain language
- Give accurate advice about popular Indian EVs: Tata Nexon EV, MG ZS EV, Mahindra XUV400, Hyundai Ioniq 5, etc.

Formatting rules:
- Keep responses concise and practical (2–4 sentences max unless detail is asked)
- Use ₹ for Indian Rupees, kWh for energy, km for distance
- Use bullet points for lists
- Be friendly but professional
- Always respond in the same language as the user's question`;

/**
 * Call Gemini API with the user's query and context.
 */
async function callGemini({ query, userSoc, vehicle, conversationHistory = [] }) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  // Build context string appended to the user message
  const contextLines = [];
  if (typeof userSoc === 'number') contextLines.push(`Current battery SoC: ${userSoc}%`);
  if (vehicle) {
    contextLines.push(
      `Vehicle: ${vehicle.manufacturer} ${vehicle.model} ${vehicle.variant || ''}`.trim()
    );
    if (vehicle.battery_capacity_kwh) {
      contextLines.push(`Battery capacity: ${vehicle.battery_capacity_kwh} kWh`);
    }
    if (vehicle.max_dc_power_kw) {
      contextLines.push(`Max DC charging speed: ${vehicle.max_dc_power_kw} kW`);
    }
  }

  const contextBlock =
    contextLines.length > 0 ? `\n\n[Context: ${contextLines.join(' | ')}]` : '';

  const userMessage = query + contextBlock;

  // Build contents array for multi-turn if we have history
  const contents = [
    ...conversationHistory,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
    config: { systemInstruction: SYSTEM_PROMPT },
    contents,
  });

  return response.text;
}

export const aiService = {
  /**
   * Generates conversational assistance based on query context.
   * Tries real Gemini API first; falls back to mock responses on failure.
   *
   * @param {{ query: string, userSoc?: number, vehicle?: object, conversationHistory?: Array }} params
   * @returns {Promise<string>} Markdown-formatted AI response
   */
  async queryCopilot({ query, userSoc = 70, vehicle = null, conversationHistory = [] }) {
    // --- Try real Gemini API ---
    if (GEMINI_API_KEY) {
      try {
        return await callGemini({ query, userSoc, vehicle, conversationHistory });
      } catch (err) {
        console.warn('[aiService] Gemini API call failed, using mock fallback:', err.message);
      }
    }

    // --- Mock fallback (works offline / without key) ---
    await new Promise((resolve) => setTimeout(resolve, 600));

    const lower = (query || '').toLowerCase();

    if (
      lower.includes('reach') ||
      lower.includes('range') ||
      lower.includes('battery') ||
      lower.includes('delhi') ||
      lower.includes('noida') ||
      lower.includes('lucknow')
    ) {
      const match = lower.match(/(\d+)%?/);
      const soc = match ? parseInt(match[1], 10) : userSoc;
      const destination = lower.includes('lucknow')
        ? 'Lucknow'
        : lower.includes('noida')
        ? 'Noida'
        : 'New Delhi';
      return AI_MOCK_KNOWLEDGE.range(soc, destination, vehicle);
    }

    if (lower.includes('cheap') || lower.includes('tariff') || lower.includes('price') || lower.includes('cost')) {
      return AI_MOCK_KNOWLEDGE.cheapest;
    }

    if (
      lower.includes('offline') ||
      lower.includes('internet') ||
      lower.includes('network') ||
      lower.includes('edge')
    ) {
      return AI_MOCK_KNOWLEDGE.offline;
    }

    if (
      lower.includes('pay') ||
      lower.includes('wallet') ||
      lower.includes('upi') ||
      lower.includes('pass') ||
      lower.includes('vahanpass')
    ) {
      return AI_MOCK_KNOWLEDGE.payment;
    }

    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return `Hello! I am your **VahanGrid Mobility Copilot** ⚡🇮🇳\n\nI can assist you with:\n• Corridor range feasibility checks\n• Real-time CPO tariff comparisons\n• VahanPass cross-network roaming rules\n• Offline edge charging protocols`;
    }

    return AI_MOCK_KNOWLEDGE.default;
  },
};
