const { RAG_CONFIG } = require('../../../config/rag.config');
const { env } = require('../../../config/env');
const { logger } = require('../../../config/logger');

// ============================================================
// Context Selection Service — Budget & Diversity Optimizer
// ============================================================
// Selects the optimal subset of reranked chunks to inject into the LLM context.
//
// Responsibilities:
//   1. Hard limit on chunk count (maxChunks)
//   2. Strict token context budget enforcement (maxTokens)
//   3. Deduplication of identical or near-identical text
//   4. Document diversity (ensures multi-document representation where relevant)
//   5. Preservation of verified citation metadata

class ContextSelectorService {
  /**
   * Select a bounded, deduplicated context window from reranked candidate chunks.
   *
   * @param {Array<object>} rankedChunks - Reranked chunk candidates in descending order of relevance
   * @param {object} [options]
   * @param {number} [options.maxChunks] - Max number of chunks allowed
   * @param {number} [options.maxTokens] - Max estimated tokens allowed
   * @returns {{ selectedChunks: Array<object>, totalTokens: number, selectedCount: number, truncated: boolean }}
   */
  selectContext(rankedChunks = [], options = {}) {
    if (!Array.isArray(rankedChunks) || rankedChunks.length === 0) {
      return {
        selectedChunks: [],
        totalTokens: 0,
        selectedCount: 0,
        truncated: false,
      };
    }

    const maxChunks = options.maxChunks || env.MAX_CONTEXT_CHUNKS || RAG_CONFIG.maxContextChunks || 6;
    const maxTokens = options.maxTokens || env.MAX_CONTEXT_TOKENS || RAG_CONFIG.maxContextTokens || 4000;

    const seenContents = new Set();
    const seenChunkIds = new Set();
    const selectedChunks = [];
    let accumulatedTokens = 0;
    let truncated = false;

    // Document diversity tracking (max 3 chunks from single document if others exist)
    const docCounts = new Map();

    for (const chunk of rankedChunks) {
      if (selectedChunks.length >= maxChunks) {
        truncated = true;
        break;
      }

      if (!chunk || !chunk.content) continue;

      // 1. Exact ID Deduplication
      if (chunk.chunkId && seenChunkIds.has(chunk.chunkId)) {
        continue;
      }

      // 2. Normalized Content Deduplication
      const contentSnippet = chunk.content.trim().toLowerCase().slice(0, 150);
      if (seenContents.has(contentSnippet)) {
        continue;
      }

      // 3. Approximate Token Estimation (1 token ~= 4 chars + 20 tokens formatting overhead)
      const chunkTokens = Math.ceil(chunk.content.length / 4) + 20;

      if (selectedChunks.length > 0 && accumulatedTokens + chunkTokens > maxTokens) {
        truncated = true;
        break;
      }

      // 4. Document Diversity Penalty Check
      const docId = chunk.documentId || 'unknown';
      const countForDoc = docCounts.get(docId) || 0;
      if (countForDoc >= 3 && rankedChunks.length > 5) {
        // Check if there are other unseen documents waiting
        const remainingDifferentDoc = rankedChunks.slice(selectedChunks.length).some(
          (c) => c.documentId && c.documentId !== docId && !seenChunkIds.has(c.chunkId)
        );
        if (remainingDifferentDoc) {
          continue; // Prioritize diversity
        }
      }

      // Add chunk
      if (chunk.chunkId) seenChunkIds.add(chunk.chunkId);
      seenContents.add(contentSnippet);
      docCounts.set(docId, countForDoc + 1);
      accumulatedTokens += chunkTokens;

      selectedChunks.push({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        content: chunk.content,
        score: chunk.score,
        vectorScore: chunk.vectorScore ?? chunk.score,
        pageNumber: chunk.pageNumber ?? null,
        chunkIndex: chunk.chunkIndex,
        metadata: chunk.metadata || {},
      });
    }

    logger.debug(
      {
        candidateCount: rankedChunks.length,
        selectedCount: selectedChunks.length,
        accumulatedTokens,
        maxTokens,
        truncated,
      },
      'Context selection completed'
    );

    return {
      selectedChunks,
      totalTokens: accumulatedTokens,
      selectedCount: selectedChunks.length,
      truncated,
    };
  }
}

const contextSelectorService = new ContextSelectorService();

module.exports = {
  ContextSelectorService,
  contextSelectorService,
};
