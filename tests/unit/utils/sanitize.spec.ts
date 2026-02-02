import { describe, expect, it } from 'vitest';

import { sanitizePlainText } from '@/lib/utils/sanitize';

describe('sanitizePlainText', () => {
  describe('HTML tag removal', () => {
    it('should remove all HTML tags', () => {
      const input = '<p>Hello <b>world</b></p>';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello world');
    });

    it('should remove script tags', () => {
      const input = 'Hello <script>alert("XSS")</script> world';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello  world');
    });

    it('should remove style tags', () => {
      const input = 'Text <style>body { color: red; }</style> more text';
      const result = sanitizePlainText(input);
      expect(result).toBe('Text  more text');
    });

    it('should remove nested HTML tags', () => {
      const input = '<div><span><strong>Nested</strong></span></div>';
      const result = sanitizePlainText(input);
      expect(result).toBe('Nested');
    });
  });

  describe('HTML comment removal', () => {
    it('should remove single-line HTML comments', () => {
      const input = 'Text <!-- comment --> more text';
      const result = sanitizePlainText(input);
      expect(result).toBe('Text  more text');
    });

    it('should remove multi-line HTML comments', () => {
      const input = 'Text <!--\nmulti\nline\ncomment\n--> more text';
      const result = sanitizePlainText(input);
      expect(result).toBe('Text  more text');
    });

    it('should remove micro-explanation markers', () => {
      const input =
        'Task description <!-- micro-explanation-task123 -->\nExplanation text';
      const result = sanitizePlainText(input);
      expect(result).toBe('Task description \nExplanation text');
    });
  });

  describe('HTML entity decoding', () => {
    it('should decode common HTML entities', () => {
      const input = 'Hello &amp; world &lt;test&gt; &quot;quote&quot;';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello & world <test> "quote"');
    });

    it('should decode &nbsp; to space', () => {
      const input = 'Hello&nbsp;world';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello world');
    });
  });

  describe('Newline normalization', () => {
    it('should normalize CRLF to LF', () => {
      const input = 'Line 1\r\nLine 2\r\nLine 3';
      const result = sanitizePlainText(input);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should normalize CR to LF', () => {
      const input = 'Line 1\rLine 2\rLine 3';
      const result = sanitizePlainText(input);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should collapse excessive blank lines', () => {
      const input = 'Line 1\n\n\n\n\nLine 2';
      const result = sanitizePlainText(input);
      expect(result).toBe('Line 1\n\nLine 2');
    });

    it('should preserve single blank lines', () => {
      const input = 'Line 1\n\nLine 2\n\nLine 3';
      const result = sanitizePlainText(input);
      expect(result).toBe('Line 1\n\nLine 2\n\nLine 3');
    });
  });

  describe('Whitespace trimming', () => {
    it('should trim leading and trailing whitespace', () => {
      const input = '   Hello world   ';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello world');
    });

    it('should handle empty strings', () => {
      const result = sanitizePlainText('');
      expect(result).toBe('');
    });

    it('should handle whitespace-only strings', () => {
      const result = sanitizePlainText('   \n\n   ');
      expect(result).toBe('');
    });
  });

  describe('Length limiting', () => {
    it('should truncate text exceeding max length', () => {
      const longText = 'a'.repeat(15000);
      const result = sanitizePlainText(longText, 10000);
      expect(result.length).toBeLessThanOrEqual(10003); // 10000 + '...'
      expect(result).toMatch(/\.\.\.$/);
    });

    it('should truncate at word boundary when possible', () => {
      const longText = 'word '.repeat(3000) + 'end';
      const result = sanitizePlainText(longText, 100);
      // Should end with '...' and be close to max length
      expect(result).toMatch(/\.\.\.$/);
      expect(result.length).toBeLessThanOrEqual(103);
    });

    it('should not truncate text within limit', () => {
      const text = 'Short text';
      const result = sanitizePlainText(text, 100);
      expect(result).toBe('Short text');
    });
  });

  describe('Security edge cases (CodeQL issue #103)', () => {
    it('should strip script tags with space before closing >', () => {
      const input = '<script>alert(1)</script >';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
      expect(result).not.toContain('alert');
      expect(result).not.toContain('script');
    });

    it('should strip script tags with attributes in closing tag', () => {
      const input = '<script>alert(1)</script foo="bar">';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
      expect(result).not.toContain('alert');
    });

    it('should strip mixed case script tags', () => {
      const input = '<ScRiPt>alert(1)</ScRiPt>';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
      expect(result).not.toContain('alert');
    });

    it('should strip uppercase SCRIPT tags', () => {
      const input = '<SCRIPT>alert(1)</SCRIPT>';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
    });

    it('should strip style tags with space before closing >', () => {
      const input = '<style>body{display:none}</style >';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
      expect(result).not.toContain('display');
    });

    it('should strip mixed case style tags', () => {
      const input = '<StYlE>body{color:red}</StYlE>';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
    });

    it('should handle HTML comments ending with --!>', () => {
      const input = 'text <!-- comment --!> more';
      const result = sanitizePlainText(input);
      expect(result).not.toContain('<!--');
      expect(result).not.toContain('--!>');
    });

    it('should handle script inside HTML comment', () => {
      const input = '<!-- <script>bad()</script> -->';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
      expect(result).not.toContain('bad');
    });

    it('should not be fooled by encoded entities', () => {
      const input = '&lt;script&gt;alert(1)&lt;/script&gt;';
      const result = sanitizePlainText(input);
      expect(result).toBe('<script>alert(1)</script>');
    });

    it('should prevent double-decoding attacks', () => {
      const input = '&amp;lt;script&amp;gt;evil&amp;lt;/script&amp;gt;';
      const result = sanitizePlainText(input);
      expect(result).toBe('&lt;script&gt;evil&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should handle deeply nested malicious content', () => {
      const input =
        '<div><span><script>alert(1)</script></span></div><style>x</style>';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
    });

    it('should handle newlines within script tags', () => {
      const input = '<script>\nalert(1)\n</script>';
      const result = sanitizePlainText(input);
      expect(result).toBe('');
    });

    it('should handle tabs and whitespace in tags', () => {
      const input = '<script\t>alert(1)</script\n>';
      const result = sanitizePlainText(input);
      expect(result).not.toContain('alert');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle mixed HTML and plain text', () => {
      const input =
        '<p>Hello <b>world</b> <!-- comment --> &amp; <script>alert(1)</script> test';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello world  &  test');
    });

    it('should handle real-world micro-explanation format', () => {
      const input = `Task description

<!-- micro-explanation-task123 -->
This is a micro-explanation with <b>formatting</b> and &amp; entities.`;
      const result = sanitizePlainText(input);
      expect(result).toBe(
        'Task description\n\nThis is a micro-explanation with formatting and & entities.'
      );
    });

    it('should preserve legitimate content while removing dangerous elements', () => {
      const input = `Learn React hooks.

Use useState to manage state.

<!-- micro-explanation-abc123 -->
Practice: Build a counter app.`;
      const result = sanitizePlainText(input);
      expect(result).toContain('Learn React hooks');
      expect(result).toContain('Use useState');
      expect(result).toContain('Practice: Build a counter app');
      expect(result).not.toContain('<!--');
      expect(result).not.toContain('-->');
    });
  });
});
