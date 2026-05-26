import {
  getCorrelationId,
  sanitizeCorrelationId,
} from '@/lib/proxy/correlation';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

describe('proxy correlation', () => {
  describe('sanitizeCorrelationId', () => {
    it('returns null for empty or overlong values', () => {
      expect(sanitizeCorrelationId(null)).toBeNull();
      expect(sanitizeCorrelationId('')).toBeNull();
      expect(sanitizeCorrelationId('a'.repeat(65))).toBeNull();
    });

    it('rejects characters outside the allowed pattern', () => {
      expect(sanitizeCorrelationId('bad id')).toBeNull();
      expect(sanitizeCorrelationId('bad/id')).toBeNull();
    });

    it('accepts trimmed valid correlation ids', () => {
      expect(sanitizeCorrelationId('  req-abc_123  ')).toBe('req-abc_123');
    });
  });

  describe('getCorrelationId', () => {
    it('uses a sanitized incoming header when present', () => {
      const request = new NextRequest('http://localhost/plans', {
        headers: { 'x-correlation-id': 'incoming-id' },
      });

      expect(getCorrelationId(request)).toBe('incoming-id');
    });

    it('generates a uuid when the header is missing or invalid', () => {
      const missing = new NextRequest('http://localhost/plans');
      const invalid = new NextRequest('http://localhost/plans', {
        headers: { 'x-correlation-id': 'not valid!' },
      });

      expect(getCorrelationId(missing)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(getCorrelationId(invalid)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });
});
