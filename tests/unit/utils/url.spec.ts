import { describe, expect, it } from 'vitest';

import { extractDomain, isValidHttpUrl } from '@/lib/utils/url';

describe('url utils', () => {
  describe('extractDomain', () => {
    it('removes leading www and returns hostname', () => {
      expect(extractDomain('https://www.react.dev/learn')).toBe('react.dev');
      expect(extractDomain('https://docs.python.org/3/')).toBe(
        'docs.python.org'
      );
    });

    it('returns hostname without www when no www is present', () => {
      expect(extractDomain('https://example.com/path')).toBe('example.com');
    });

    it('handles localhost URLs with ports', () => {
      expect(extractDomain('https://localhost:3000/api')).toBe('localhost');
    });

    it('returns null for empty input', () => {
      expect(extractDomain('')).toBeNull();
    });

    it('returns null for protocol-relative URLs', () => {
      expect(extractDomain('//cdn.example.com/file.js')).toBeNull();
    });

    it('returns null for invalid URLs', () => {
      expect(extractDomain('not-a-url')).toBeNull();
    });
  });

  describe('isValidHttpUrl', () => {
    it('accepts only http(s)', () => {
      expect(isValidHttpUrl('https://example.com')).toBe(true);
      expect(isValidHttpUrl('http://example.com')).toBe(true);
      expect(isValidHttpUrl('ftp://example.com/file')).toBe(false);
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isValidHttpUrl('notaurl')).toBe(false);
    });

    it('rejects data: URLs', () => {
      expect(isValidHttpUrl('data:text/html,<script>')).toBe(false);
      expect(
        isValidHttpUrl('data:text/plain;charset=utf-8,hello%20world')
      ).toBe(false);
      expect(
        isValidHttpUrl(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        )
      ).toBe(false);
    });

    it('rejects blob: URLs', () => {
      expect(
        isValidHttpUrl(
          'blob:http://example.com/550e8400-e29b-41d4-a716-446655440000'
        )
      ).toBe(false);
      expect(
        isValidHttpUrl(
          'blob:https://example.com/550e8400-e29b-41d4-a716-446655440000'
        )
      ).toBe(false);
    });

    it('rejects file:// URLs', () => {
      expect(isValidHttpUrl('file://localhost/etc/fstab')).toBe(false);
      expect(isValidHttpUrl('file:///etc/passwd')).toBe(false);
      expect(isValidHttpUrl('file://host.example.com/etc/fstab')).toBe(false);
    });

    it('handles leading and trailing whitespace correctly', () => {
      expect(isValidHttpUrl(' https://example.com')).toBe(true);
      expect(isValidHttpUrl('https://example.com ')).toBe(true);
      expect(isValidHttpUrl(' https://example.com ')).toBe(true);
      expect(isValidHttpUrl('  http://evil.com  ')).toBe(true);
      expect(isValidHttpUrl('\t\nhttps://test.com\r\n')).toBe(true);
    });

    it('handles mixed-case schemes correctly', () => {
      expect(isValidHttpUrl('HTTPS://example.com')).toBe(true);
      expect(isValidHttpUrl('HTTP://example.com')).toBe(true);
      expect(isValidHttpUrl('hTtPs://example.com')).toBe(true);
      expect(isValidHttpUrl('HtTp://example.com')).toBe(true);
      expect(isValidHttpUrl('Https://Example.Com')).toBe(true);
    });

    it('rejects empty string and whitespace-only strings', () => {
      expect(isValidHttpUrl('')).toBe(false);
      expect(isValidHttpUrl(' ')).toBe(false);
      expect(isValidHttpUrl('  ')).toBe(false);
      expect(isValidHttpUrl('\t\n\r')).toBe(false);
    });
  });
});
