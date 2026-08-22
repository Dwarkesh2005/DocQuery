const { EmbeddingService } = require('../src/modules/documents/services/embedding.service');
const { MockEmbeddingProvider } = require('../src/modules/documents/services/providers/mock.provider');

describe('EmbeddingService & Providers', () => {
  describe('MockEmbeddingProvider', () => {
    const provider = new MockEmbeddingProvider(1536);

    it('should generate vectors of exact dimension 1536', async () => {
      const embeddings = await provider.generateEmbeddings(['Hello world', 'Another chunk']);
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toHaveLength(1536);
      expect(embeddings[1]).toHaveLength(1536);
    });

    it('should generate deterministic vectors for identical text', async () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const [v1] = await provider.generateEmbeddings([text]);
      const [v2] = await provider.generateEmbeddings([text]);

      expect(v1).toEqual(v2);
    });

    it('should produce unit-normalized vectors (L2 norm approx 1.0)', async () => {
      const [v1] = await provider.generateEmbeddings(['Testing normalization']);
      const norm = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    });
  });

  describe('EmbeddingService', () => {
    it('should generate a single embedding vector', async () => {
      const service = new EmbeddingService({
        provider: new MockEmbeddingProvider(1536),
      });

      const vector = await service.generateEmbedding('Single chunk text');
      expect(vector).toHaveLength(1536);
      expect(typeof vector[0]).toBe('number');
    });

    it('should batch requests when input size exceeds batchSize', async () => {
      const provider = new MockEmbeddingProvider(1536);
      const spy = jest.spyOn(provider, 'generateEmbeddings');

      const service = new EmbeddingService({
        provider,
        batchSize: 3,
      });

      const texts = ['text1', 'text2', 'text3', 'text4', 'text5', 'text6', 'text7'];
      const embeddings = await service.generateEmbeddings(texts);

      expect(embeddings).toHaveLength(7);
      // 7 items with batch size 3 should take 3 calls (3, 3, 1)
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should throw an error on dimension mismatch', async () => {
      // Provider returns 768 dimensions when 1536 is expected
      const badProvider = new MockEmbeddingProvider(768);
      const service = new EmbeddingService({
        provider: badProvider,
      });

      await expect(service.generateEmbeddings(['Test'])).rejects.toThrow(
        /Embedding dimension mismatch: expected 1536, but got 768/
      );
    });
  });
});
