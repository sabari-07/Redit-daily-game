import { describe, it, expect } from 'vitest';
import { sanitizeTitle, escapeHtml } from './sanitize.js';

describe('sanitizeTitle', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeTitle('')).toBe('');
  });

  it('strips control characters', () => {
    expect(sanitizeTitle('hello\x00world\x1f')).toBe('helloworld');
  });

  it('collapses whitespace', () => {
    expect(sanitizeTitle('  hello   world  ')).toBe('hello world');
  });

  it('truncates to 60 chars with ellipsis', () => {
    const long = 'a'.repeat(70);
    const result = sanitizeTitle(long);
    expect(result.length).toBe(60);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves 60-char titles untouched', () => {
    const exact = 'a'.repeat(60);
    expect(sanitizeTitle(exact)).toBe(exact);
  });

  it('masks profanity', () => {
    const result = sanitizeTitle('This is fucking great');
    expect(result).not.toContain('fucking');
    expect(result).toContain('*');
  });

  it('handles HTML special chars as literal text', () => {
    const result = sanitizeTitle('<img src=x onerror=alert(1)>');
    expect(result).toBe('<img src=x onerror=alert(1)>');
  });

  it('handles unicode', () => {
    const result = sanitizeTitle('日本語のタイトル');
    expect(result).toBe('日本語のタイトル');
  });

  it('handles whitespace-only input', () => {
    expect(sanitizeTitle('   ')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes angle brackets, quotes and ampersands', () => {
    const result = escapeHtml('<script>alert("xss")&more</script>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&amp;');
  });
});
