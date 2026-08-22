-- Create HNSW index on document_chunks embedding column for cosine distance / similarity
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx"
ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
