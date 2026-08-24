const { documentIntelligenceService } = require('../src/modules/documents/services/document-intelligence.service');
const { documentVersionService } = require('../src/modules/documents/services/document-version.service');
const { prisma, cleanDatabase } = require('./setup');

describe('Phase 9.5 — Document Intelligence & Versioning', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('DocumentIntelligenceService', () => {
    it('should detect document language accurately', () => {
      const enText = 'This is an English policy document with terms and conditions.';
      const esText = 'Este es un documento en espanol con politicas de privacidad y terminos para los usuarios.';

      expect(documentIntelligenceService.detectLanguage(enText)).toBe('en');
      expect(documentIntelligenceService.detectLanguage(esText)).toBe('es');
    });

    it('should classify document category by content heuristics', () => {
      const legalText = 'This Non-Disclosure Agreement and Privacy Policy governs the terms of use.';
      const techText = 'The REST API endpoint communicates with PostgreSQL and Docker cluster.';
      const hrText = 'Employee handbook vacation policy regarding annual paid leave and benefits.';

      expect(documentIntelligenceService.classifyDocument(legalText)).toBe('LEGAL');
      expect(documentIntelligenceService.classifyDocument(techText)).toBe('TECHNICAL');
      expect(documentIntelligenceService.classifyDocument(hrText)).toBe('POLICY');
    });

    it('should extract structured sections and headings', () => {
      const mdText = '# 1. Introduction\nWelcome to DocQuery.\n\n## 1.1 Architecture\nDetails here.\n\n### 1.1.1 Database\nPostgres.';
      const sections = documentIntelligenceService.detectSections(mdText);

      expect(sections.length).toBe(3);
      expect(sections[0].heading).toBe('1. Introduction');
      expect(sections[1].heading).toBe('1.1 Architecture');
    });

    it('should extract key named entities and keywords', () => {
      const text = 'Google and Microsoft use Kubernetes and Docker to scale microservices architecture.';
      const entities = documentIntelligenceService.extractEntities(text);
      const keywords = documentIntelligenceService.extractKeywords(text);

      expect(entities).toContain('Google');
      expect(entities).toContain('Microsoft');
      expect(keywords).toContain('kubernetes');
      expect(keywords).toContain('microservices');
    });
  });

  describe('DocumentVersionService', () => {
    it('should compute deterministic SHA-256 hashes for content', () => {
      const content = 'DocQuery Enterprise v9 content';
      const hash1 = documentVersionService.calculateHash(Buffer.from(content));
      const hash2 = documentVersionService.calculateHash(Buffer.from(content));

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should create sequential versions for document revisions', async () => {
      const org = await prisma.organization.create({ data: { name: 'Version Org' } });
      const user = await prisma.user.create({ data: { email: 'ver@test.com', passwordHash: 'h', name: 'V' } });
      const doc = await prisma.document.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          name: 'Doc.pdf',
          filePath: 'uploads/doc.pdf',
          fileSize: 100,
          mimeType: 'application/pdf',
        },
      });

      const v1 = await documentVersionService.createVersion({
        documentId: doc.id,
        contentHash: 'hash1',
        filePath: 'uploads/v1.pdf',
        fileSize: 100,
        createdBy: user.id,
      });

      const v2 = await documentVersionService.createVersion({
        documentId: doc.id,
        contentHash: 'hash2',
        filePath: 'uploads/v2.pdf',
        fileSize: 120,
        createdBy: user.id,
      });

      expect(v1.versionNumber).toBe(1);
      expect(v2.versionNumber).toBe(2);

      const allVersions = await documentVersionService.listVersions(doc.id);
      expect(allVersions.length).toBe(2);
    });
  });
});
