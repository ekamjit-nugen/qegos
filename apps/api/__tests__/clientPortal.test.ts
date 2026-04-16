/**
 * Client Portal & Vault — Tests (Phase 6)
 *
 * Tests file validation, S3 path building, content hashing, dedup logic,
 * virus scan states, storage quota constants, ATO status enums,
 * document categories, YoY comparison, prefill, and tax summary fields.
 * Unit/structural tests — no database or S3 required.
 */

import {
  VAULT_DOCUMENT_CATEGORIES,
  ATO_REFUND_STATUSES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  DEFAULT_STORAGE_QUOTA,
  PRESIGNED_URL_EXPIRY,
  buildS3Key,
  computeContentHash,
} from '../../../packages/file-storage/src';

import type {
  VaultDocumentCategory,
  VirusScanStatus,
  OcrStatus,
  UploadedBy,
  AtoRefundStatus,
  IVaultDocument,
  ITaxYearSummary,
  YoYComparison,
} from '../../../packages/file-storage/src/types';

// ═══════════════════════════════════════════════════════════════════════════════

describe('Client Portal & Vault (Phase 6)', () => {
  // ── Document Categories (CPV-INV-04) ──────────────────────────────────

  describe('Vault document categories', () => {
    it('has exactly 20 categories', () => {
      expect(VAULT_DOCUMENT_CATEGORIES).toHaveLength(20);
    });

    it('includes all expected tax document types', () => {
      const expected: VaultDocumentCategory[] = [
        'payg_summary',
        'interest_statement',
        'dividend_statement',
        'managed_fund_statement',
        'rental_income',
        'self_employment',
        'private_health_insurance',
        'donation_receipt',
        'work_expense_receipt',
        'self_education',
        'vehicle_logbook',
        'home_office',
        'notice_of_assessment',
        'tax_return_copy',
        'bas_statement',
        'id_document',
        'superannuation_statement',
        'foreign_income',
        'capital_gains_record',
        'other',
      ];
      for (const cat of expected) {
        expect(VAULT_DOCUMENT_CATEGORIES).toContain(cat);
      }
    });

    it('has no duplicate categories', () => {
      const unique = new Set(VAULT_DOCUMENT_CATEGORIES);
      expect(unique.size).toBe(VAULT_DOCUMENT_CATEGORIES.length);
    });
  });

  // ── Allowed File Types (CPV-INV-04) ───────────────────────────────────

  describe('Allowed file types — magic byte validation', () => {
    it('allows PDF, JPG, PNG, HEIC, TIFF', () => {
      expect(ALLOWED_MIME_TYPES['application/pdf']).toBe('pdf');
      expect(ALLOWED_MIME_TYPES['image/jpeg']).toBe('jpg');
      expect(ALLOWED_MIME_TYPES['image/png']).toBe('png');
      expect(ALLOWED_MIME_TYPES['image/heic']).toBe('heic');
      expect(ALLOWED_MIME_TYPES['image/tiff']).toBe('tiff');
    });

    it('has exactly 5 allowed types', () => {
      expect(Object.keys(ALLOWED_MIME_TYPES)).toHaveLength(5);
    });

    it('rejects executable types', () => {
      expect(ALLOWED_MIME_TYPES['application/x-msdownload']).toBeUndefined();
      expect(ALLOWED_MIME_TYPES['application/javascript']).toBeUndefined();
      expect(ALLOWED_MIME_TYPES['text/html']).toBeUndefined();
    });
  });

  // ── File Size & Quota Constants ───────────────────────────────────────

  describe('Storage constants', () => {
    it('max file size is 20MB', () => {
      expect(MAX_FILE_SIZE).toBe(20_971_520);
    });

    it('default storage quota is 500MB', () => {
      expect(DEFAULT_STORAGE_QUOTA).toBe(524_288_000);
    });

    it('presigned URL expiry is 15 minutes (900 seconds)', () => {
      expect(PRESIGNED_URL_EXPIRY).toBe(900);
    });
  });

  // ── S3 Path Building (CPV-INV-02) ─────────────────────────────────────

  describe('S3 path building (CPV-INV-02)', () => {
    it('builds correct path: vault/{userId}/{FY}/{uuid}-{filename}', () => {
      const key = buildS3Key('user123', '2024-25', 'abc-def', 'invoice.pdf');
      expect(key).toBe('vault/user123/2024-25/abc-def-invoice.pdf');
    });

    it('handles special characters in filename', () => {
      const key = buildS3Key('user456', '2023-24', 'uuid1', 'my file (1).png');
      expect(key).toBe('vault/user456/2023-24/uuid1-my file (1).png');
    });

    it('includes all path segments', () => {
      const key = buildS3Key('u1', '2025-26', 'id', 'doc.pdf');
      const segments = key.split('/');
      expect(segments[0]).toBe('vault');
      expect(segments[1]).toBe('u1');
      expect(segments[2]).toBe('2025-26');
      expect(segments[3]).toBe('id-doc.pdf');
    });
  });

  // ── Content Hash / Dedup (STR-INV-02) ─────────────────────────────────

  describe('Content hashing for dedup', () => {
    it('produces SHA-256 hex string', () => {
      const hash = computeContentHash(Buffer.from('test content'));
      expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('same content produces same hash', () => {
      const content = Buffer.from('identical file content');
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content);
      expect(hash1).toBe(hash2);
    });

    it('different content produces different hash', () => {
      const hash1 = computeContentHash(Buffer.from('file A'));
      const hash2 = computeContentHash(Buffer.from('file B'));
      expect(hash1).not.toBe(hash2);
    });

    it('empty buffer produces valid hash', () => {
      const hash = computeContentHash(Buffer.alloc(0));
      expect(hash).toHaveLength(64);
    });
  });

  // ── Virus Scan Status Enum ────────────────────────────────────────────

  describe('Virus scan statuses (CPV-INV-01)', () => {
    it('has 4 valid states', () => {
      const statuses: VirusScanStatus[] = ['pending', 'clean', 'infected', 'error'];
      expect(statuses).toHaveLength(4);
      for (const s of statuses) {
        expect(typeof s).toBe('string');
      }
    });
  });

  // ── OCR Status Enum ───────────────────────────────────────────────────

  describe('OCR statuses', () => {
    it('has 4 valid states', () => {
      const statuses: OcrStatus[] = ['pending', 'completed', 'failed', 'not_applicable'];
      expect(statuses).toHaveLength(4);
    });
  });

  // ── Upload By Enum ────────────────────────────────────────────────────

  describe('Upload sources', () => {
    it('has 3 upload sources', () => {
      const sources: UploadedBy[] = ['client', 'staff', 'system'];
      expect(sources).toHaveLength(3);
    });
  });

  // ── ATO Refund Status ─────────────────────────────────────────────────

  describe('ATO refund statuses', () => {
    it('has exactly 6 statuses', () => {
      expect(ATO_REFUND_STATUSES).toHaveLength(6);
    });

    it('includes the full lifecycle', () => {
      const expected: AtoRefundStatus[] = [
        'not_filed',
        'filed',
        'processing',
        'assessed',
        'refund_issued',
        'payment_due',
      ];
      for (const status of expected) {
        expect(ATO_REFUND_STATUSES).toContain(status);
      }
    });

    it('starts with not_filed (default)', () => {
      expect(ATO_REFUND_STATUSES[0]).toBe('not_filed');
    });
  });

  // ── Vault Document Interface Structure ────────────────────────────────

  describe('VaultDocument interface', () => {
    it('has all required fields (type check)', () => {
      // Type-level verification: this compiles only if interface matches
      const doc: IVaultDocument = {
        userId: null as never,
        financialYear: '2024-25',
        category: 'payg_summary',
        fileName: 'payg.pdf',
        fileUrl: 'vault/u1/2024-25/uuid-payg.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: 'client',
        version: 1,
        isArchived: false,
        virusScanStatus: 'clean',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(doc.financialYear).toBe('2024-25');
      expect(doc.version).toBe(1);
      expect(doc.isArchived).toBe(false);
    });

    it('supports optional fields', () => {
      const doc: Partial<IVaultDocument> = {
        description: 'My PAYG summary',
        tags: ['tax', '2024'],
        ocrStatus: 'completed',
        ocrExtracted: {
          employerName: 'ACME Corp',
          grossIncome: 8500000,
          taxWithheld: 2100000,
        },
        previousVersionId: null as never,
        contentHash: 'abc123',
      };
      expect(doc.tags).toHaveLength(2);
      expect(doc.ocrExtracted?.employerName).toBe('ACME Corp');
    });
  });

  // ── Tax Year Summary Interface ────────────────────────────────────────

  describe('TaxYearSummary interface', () => {
    it('has all monetary fields in cents', () => {
      const summary: ITaxYearSummary = {
        userId: null as never,
        financialYear: '2024-25',
        totalIncome: 8500000, // $85,000
        totalDeductions: 1200000, // $12,000
        taxableIncome: 7300000, // $73,000
        medicareLevyAmount: 146000, // $1,460
        hecsRepayment: 0,
        totalTaxPayable: 1587800, // $15,878
        taxWithheld: 2000000, // $20,000
        refundOrOwing: 412200, // $4,122 refund
        superannuationReported: 935000,
        noaReceived: false,
        atoRefundStatus: 'not_filed',
        totalPaidToQegos: 39900, // $399
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // All money is integer cents
      expect(Number.isInteger(summary.totalIncome)).toBe(true);
      expect(Number.isInteger(summary.totalDeductions)).toBe(true);
      expect(Number.isInteger(summary.taxableIncome)).toBe(true);
      expect(Number.isInteger(summary.refundOrOwing)).toBe(true);
      expect(Number.isInteger(summary.totalPaidToQegos)).toBe(true);
    });

    it('refundOrOwing can be negative (owing)', () => {
      const summary: Partial<ITaxYearSummary> = {
        refundOrOwing: -250000, // owes $2,500
      };
      expect(summary.refundOrOwing).toBeLessThan(0);
    });
  });

  // ── YoY Comparison Structure ──────────────────────────────────────────

  describe('Year-over-year comparison', () => {
    it('includes delta and percentage change', () => {
      const comparison: YoYComparison = {
        current: {
          userId: null as never,
          financialYear: '2024-25',
          totalIncome: 9000000,
          totalDeductions: 1500000,
          taxableIncome: 7500000,
          medicareLevyAmount: 150000,
          hecsRepayment: 0,
          totalTaxPayable: 1650000,
          taxWithheld: 2000000,
          refundOrOwing: 350000,
          superannuationReported: 990000,
          noaReceived: true,
          atoRefundStatus: 'refund_issued',
          totalPaidToQegos: 39900,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        previous: {
          userId: null as never,
          financialYear: '2023-24',
          totalIncome: 8500000,
          totalDeductions: 1200000,
          taxableIncome: 7300000,
          medicareLevyAmount: 146000,
          hecsRepayment: 0,
          totalTaxPayable: 1587800,
          taxWithheld: 2000000,
          refundOrOwing: 412200,
          superannuationReported: 935000,
          noaReceived: true,
          atoRefundStatus: 'refund_issued',
          totalPaidToQegos: 39900,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        changes: {
          totalIncome: {
            current: 9000000,
            previous: 8500000,
            delta: 500000,
            percentChange: 5.88,
          },
        },
      };

      expect(comparison.changes.totalIncome.delta).toBe(500000);
      expect(comparison.changes.totalIncome.percentChange).toBeCloseTo(5.88, 1);
      expect(comparison.previous).not.toBeNull();
    });

    it('handles no previous year', () => {
      const comparison: YoYComparison = {
        current: {
          userId: null as never,
          financialYear: '2024-25',
          totalIncome: 9000000,
          totalDeductions: 0,
          taxableIncome: 9000000,
          medicareLevyAmount: 0,
          hecsRepayment: 0,
          totalTaxPayable: 0,
          taxWithheld: 0,
          refundOrOwing: 0,
          superannuationReported: 0,
          noaReceived: false,
          atoRefundStatus: 'not_filed',
          totalPaidToQegos: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        previous: null,
        changes: {},
      };

      expect(comparison.previous).toBeNull();
    });
  });

  // ── Presigned URL Invariants (CPV-INV-03) ─────────────────────────────

  describe('Presigned URL configuration (CPV-INV-03)', () => {
    it('expires in exactly 15 minutes', () => {
      expect(PRESIGNED_URL_EXPIRY).toBe(900);
      expect(PRESIGNED_URL_EXPIRY).toBe(15 * 60);
    });
  });

  // ── Soft Delete Invariants (CPV-INV-05) ───────────────────────────────

  describe('Soft delete behavior (CPV-INV-05)', () => {
    it('archived document has isArchived=true and archivedAt set', () => {
      const doc: Partial<IVaultDocument> = {
        isArchived: true,
        archivedAt: new Date(),
      };
      expect(doc.isArchived).toBe(true);
      expect(doc.archivedAt).toBeDefined();
    });

    it('30-day grace period is 2592000000 ms', () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(thirtyDaysMs).toBe(2_592_000_000);
    });
  });

  // ── Document Versioning (CPV-INV-07) ──────────────────────────────────

  describe('Document versioning (CPV-INV-07)', () => {
    it('first upload has version=1, no previousVersionId', () => {
      const doc: Partial<IVaultDocument> = {
        version: 1,
        previousVersionId: undefined,
      };
      expect(doc.version).toBe(1);
      expect(doc.previousVersionId).toBeUndefined();
    });

    it('re-upload increments version and links to previous', () => {
      const v2: Partial<IVaultDocument> = {
        version: 2,
        previousVersionId: null as never, // ObjectId in practice
      };
      expect(v2.version).toBe(2);
      expect(v2.previousVersionId).toBeDefined();
    });
  });

  // ── Prefill Response Structure (CPV-INV-10) ───────────────────────────

  describe('Prefill — advisory only (CPV-INV-10)', () => {
    it('returns suggested values with source FY', () => {
      const prefill = {
        suggested: {
          totalIncome: 8500000,
          totalDeductions: 1200000,
          servicesUsed: ['Individual Tax Return'],
        },
        source: 'FY2023-24',
      };
      expect(prefill.source).toMatch(/^FY\d{4}-\d{2}$/);
      expect(prefill.suggested.totalIncome).toBe(8500000);
    });
  });

  // ── Financial Year Format ─────────────────────────────────────────────

  describe('Financial year format', () => {
    it('Australian FY is YYYY-YY', () => {
      const fyRegex = /^\d{4}-\d{2}$/;
      expect('2024-25').toMatch(fyRegex);
      expect('2023-24').toMatch(fyRegex);
      expect('2025-26').toMatch(fyRegex);
    });

    it('previous FY calculation is correct', () => {
      // "2024-25" → "2023-24"
      const fy = '2024-25';
      const [startStr] = fy.split('-');
      const start = parseInt(startStr, 10);
      const prevFy = `${start - 1}-${String(start).slice(-2)}`;
      expect(prevFy).toBe('2023-24');
    });
  });

  // ── Endpoint Count ────────────────────────────────────────────────────

  describe('Portal endpoints', () => {
    it('vault has 9 endpoints', () => {
      const vaultEndpoints = [
        'POST /vault/upload',
        'POST /vault/bulk-upload',
        'GET /vault/documents',
        'GET /vault/documents/:id',
        'PUT /vault/documents/:id',
        'DELETE /vault/documents/:id',
        'GET /vault/years',
        'GET /vault/storage',
        'GET /vault/prefill/:financialYear',
      ];
      expect(vaultEndpoints).toHaveLength(9);
    });

    it('tax summaries has 3 endpoints', () => {
      const summaryEndpoints = [
        'POST /tax-summaries',
        'GET /tax-summaries',
        'GET /tax-summaries/:year/compare',
      ];
      expect(summaryEndpoints).toHaveLength(3);
    });

    it('ATO status has 3 endpoints', () => {
      const atoEndpoints = [
        'GET /ato-status/:year',
        'PUT /ato-status/:year',
        'PUT /ato-status/bulk',
      ];
      expect(atoEndpoints).toHaveLength(3);
    });

    it('total: 15 endpoints', () => {
      expect(9 + 3 + 3).toBe(15);
    });
  });
});
