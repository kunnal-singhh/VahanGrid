/**
 * ============================================================================
 * VAHANGRID MOBILITY COPILOT (AI SERVICE)
 * ============================================================================
 * 
 * ARCHITECTURAL NOTICE:
 * Handles natural language assistance for EV range calculations, route feasibility,
 * and multi-network roaming explanations.
 * 
 * In production phases:
 * - Will connect to Python / FastAPI LLM reasoning microservice with RAG over live CPO data
 * ============================================================================
 */

import { AI_MOCK_KNOWLEDGE } from '../data/mockData';

export const aiService = {
  /**
   * Generates conversational assistance based on query context.
   */
  async queryCopilot({ query, userSoc = 70, vehicle = null }) {
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
  }
};
