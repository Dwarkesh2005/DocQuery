// ============================================================
// Phase 8: Advanced RAG Configuration & Defaults
// ============================================================
// Centralized configuration for Hybrid Retrieval, RRF Fusion,
// Reranking, Context Selection, Answer Modes, and Evaluation.

const RAG_CONFIG = {
  // Retrieval Top-K defaults
  vectorTopK: 20,
  keywordTopK: 20,
  fusedTopK: 20,
  rerankTopK: 10,
  finalContextTopK: 6,

  // Reciprocal Rank Fusion constant (standard literature default: 60)
  rrfK: 60,

  // Feature Flags
  enableHybrid: true,
  enableQueryRewrite: true,
  enableReranking: true,
  enableQueryUnderstanding: true,

  // Context Selection Budgets
  maxContextChunks: 6,
  maxContextTokens: 4000,

  // Answer Modes
  // STRICT: Only answer when direct evidence is found in documents; strict no-hallucination.
  // BALANCED: Standard enterprise tone with grounded reasoning based on context.
  // CONVERSATIONAL: Natural conversational tone with multi-turn persona grounding.
  answerMode: 'STRICT',

  // Supported Answer Modes List
  SUPPORTED_ANSWER_MODES: ['STRICT', 'BALANCED', 'CONVERSATIONAL'],

  // Reranker Providers
  rerankerProvider: 'score', // 'none' | 'score' | 'cohere'

  // Query Understanding
  queryUnderstandingTimeoutMs: 3000,
  queryRewriteTimeoutMs: 3000,
};

module.exports = {
  RAG_CONFIG,
};
