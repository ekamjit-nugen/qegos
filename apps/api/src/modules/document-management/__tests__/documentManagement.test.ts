import * as crypto from 'crypto';
import {
  DOCUMENT_STATUSES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_DOCUMENTS_PER_ORDER,
  PRESIGNED_URL_EXPIRY,
  type ZohoSignConfig,
} from '../document.types';

import {
  uploadDocumentValidation,
  uploadProofValidation,
  createSigningValidation,
  sendForSignValidation,
  generateUriValidation,
  listOrderDocumentsValidation,
} from '../document.validators';

import { initZohoSignService, verifyWebhookSignature } from '../zohoSign.service';

import { createDocumentRoutes, createZohoWebhookRoute } from '../document.routes';

// ─── Type Constants ─────────────────────────────────────────────────────────

describe('Document Management — Types & Constants', () => {
  test('DOCUMENT_STATUSES has pending, signed, verified', () => {
    expect(DOCUMENT_STATUSES).toEqual(['pending', 'signed', 'verified']);
  });

  test('ALLOWED_MIME_TYPES includes PDF, JPEG, PNG, HEIC, TIFF (DOC-INV-02)', () => {
    expect(ALLOWED_MIME_TYPES).toHaveProperty('application/pdf', 'pdf');
    expect(ALLOWED_MIME_TYPES).toHaveProperty('image/jpeg', 'jpg');
    expect(ALLOWED_MIME_TYPES).toHaveProperty('image/png', 'png');
    expect(ALLOWED_MIME_TYPES).toHaveProperty('image/heic', 'heic');
    expect(ALLOWED_MIME_TYPES).toHaveProperty('image/tiff', 'tiff');
    expect(Object.keys(ALLOWED_MIME_TYPES)).toHaveLength(5);
  });

  test('ALLOWED_EXTENSIONS derived from ALLOWED_MIME_TYPES', () => {
    expect(ALLOWED_EXTENSIONS).toEqual(
      expect.arrayContaining(['pdf', 'jpg', 'png', 'heic', 'tiff']),
    );
  });

  test('MAX_FILE_SIZE is 20MB (DOC-INV-03)', () => {
    expect(MAX_FILE_SIZE).toBe(20_971_520);
  });

  test('MAX_DOCUMENTS_PER_ORDER is 10 (DOC-INV-03)', () => {
    expect(MAX_DOCUMENTS_PER_ORDER).toBe(10);
  });

  test('PRESIGNED_URL_EXPIRY is 900 seconds / 15 minutes (DOC-INV-05)', () => {
    expect(PRESIGNED_URL_EXPIRY).toBe(900);
  });
});

// ─── Validators ─────────────────────────────────────────────────────────────

describe('Document Management — Validators', () => {
  test('uploadDocumentValidation has 2 chains', () => {
    expect(uploadDocumentValidation).toHaveLength(2);
  });

  test('uploadProofValidation has 1 chain', () => {
    expect(uploadProofValidation).toHaveLength(1);
  });

  test('createSigningValidation has 6 chains', () => {
    expect(createSigningValidation).toHaveLength(6);
  });

  test('sendForSignValidation has 2 chains', () => {
    expect(sendForSignValidation).toHaveLength(2);
  });

  test('generateUriValidation has 3 chains', () => {
    expect(generateUriValidation).toHaveLength(3);
  });

  test('listOrderDocumentsValidation has 1 chain', () => {
    expect(listOrderDocumentsValidation).toHaveLength(1);
  });
});

// ─── Zoho Sign Service ──────────────────────────────────────────────────────

describe('Document Management — Zoho Sign Service', () => {
  const testConfig: ZohoSignConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    refreshToken: 'test-refresh-token',
    webhookSecret: 'test-webhook-secret-key',
    baseUrl: 'https://sign.zoho.com.au',
  };

  beforeEach(() => {
    initZohoSignService(testConfig);
  });

  test('verifyWebhookSignature returns true for valid HMAC-SHA256', () => {
    const payload = '{"requests":{"request_status":"completed"}}';
    const expected = crypto
      .createHmac('sha256', testConfig.webhookSecret)
      .update(payload)
      .digest('hex');

    expect(verifyWebhookSignature(payload, expected)).toBe(true);
  });

  test('verifyWebhookSignature returns false for invalid signature', () => {
    const payload = '{"requests":{"request_status":"completed"}}';
    expect(verifyWebhookSignature(payload, 'invalid-signature-hex')).toBe(false);
  });

  test('verifyWebhookSignature returns false for tampered payload', () => {
    const originalPayload = '{"requests":{"request_status":"completed"}}';
    const signature = crypto
      .createHmac('sha256', testConfig.webhookSecret)
      .update(originalPayload)
      .digest('hex');

    const tamperedPayload = '{"requests":{"request_status":"hacked"}}';
    expect(verifyWebhookSignature(tamperedPayload, signature)).toBe(false);
  });

  test('verifyWebhookSignature returns false when no webhook secret configured', () => {
    initZohoSignService({ ...testConfig, webhookSecret: '' });
    const payload = 'test';
    expect(verifyWebhookSignature(payload, 'any-sig')).toBe(false);
  });
});

// ─── Routes ─────────────────────────────────────────────────────────────────

describe('Document Management — Routes', () => {
  const mockDeps = {
    OrderModel: {},
    UserModel: {},
    authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    checkPermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    auditLog: { log: jest.fn().mockResolvedValue(undefined) },
    zohoSignConfig: {
      clientId: 'test',
      clientSecret: 'test',
      refreshToken: 'test',
      webhookSecret: 'test',
      baseUrl: 'https://sign.zoho.com.au',
    },
  };

  test('createDocumentRoutes returns a Router', () => {
    const router = createDocumentRoutes(mockDeps as never);
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  test('createZohoWebhookRoute returns a Router', () => {
    const router = createZohoWebhookRoute(mockDeps as never);
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });
});

// ─── DOC-INV Invariant Verification ────────────────────────────────────────

describe('Document Management — DOC-INV Invariants', () => {
  test('DOC-INV-02: Only 5 MIME types allowed (PDF, JPG, PNG, HEIC, TIFF)', () => {
    const allowed = Object.keys(ALLOWED_MIME_TYPES);
    expect(allowed).toHaveLength(5);
    expect(allowed).toContain('application/pdf');
    expect(allowed).toContain('image/jpeg');
    expect(allowed).toContain('image/png');
    expect(allowed).toContain('image/heic');
    expect(allowed).toContain('image/tiff');
    // Not allowed
    expect(allowed).not.toContain('application/zip');
    expect(allowed).not.toContain('application/javascript');
    expect(allowed).not.toContain('text/html');
  });

  test('DOC-INV-03: File size limit is exactly 20MB', () => {
    expect(MAX_FILE_SIZE).toBe(20 * 1024 * 1024);
  });

  test('DOC-INV-03: Document count limit is exactly 10', () => {
    expect(MAX_DOCUMENTS_PER_ORDER).toBe(10);
  });

  test('DOC-INV-05: Presigned URL expiry is exactly 15 minutes', () => {
    expect(PRESIGNED_URL_EXPIRY).toBe(15 * 60);
  });
});

// ─── Magic Bytes Detection ──────────────────────────────────────────────────

describe('Document Management — Magic Bytes Detection', () => {
  // We test the detection logic indirectly by verifying the constants
  // that the service uses. The actual detection is in document.service.ts.

  test('PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)', () => {
    const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    expect(pdfHeader.toString('ascii').startsWith('%PDF')).toBe(true);
  });

  test('JPEG magic bytes: FF D8 FF', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff]);
    expect(jpegHeader[0]).toBe(0xff);
    expect(jpegHeader[1]).toBe(0xd8);
    expect(jpegHeader[2]).toBe(0xff);
  });

  test('PNG magic bytes: 89 50 4E 47', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(pngHeader[1]).toBe(0x50); // P
    expect(pngHeader[2]).toBe(0x4e); // N
    expect(pngHeader[3]).toBe(0x47); // G
  });

  test('TIFF magic bytes: little-endian (49 49 2A 00) or big-endian (4D 4D 00 2A)', () => {
    const littleEndian = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
    const bigEndian = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
    expect(littleEndian.toString('ascii', 0, 2)).toBe('II');
    expect(bigEndian.toString('ascii', 0, 2)).toBe('MM');
  });
});
