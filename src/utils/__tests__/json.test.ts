import { describe, expect, it } from 'vitest';
import { formatJson, jsonToTypeScript, minifyJson } from '../json';

describe('formatJson', () => {
  it('formats a valid JSON string with the requested indentation', () => {
    const result = formatJson('{"name":"JSON-Visual","offline":true}', 2);

    expect(result).toEqual({
      success: true,
      data: '{\n  "name": "JSON-Visual",\n  "offline": true\n}',
    });
  });

  it('returns a useful error with line and column for invalid JSON', () => {
    const result = formatJson('{\n  "name": "demo"\n  "age": 1\n}', 2);

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/第 3 行/);
    expect(result.error).toMatch(/列/);
  });

  it('supports strings with zero indentation', () => {
    expect(formatJson('[1, 2]', 0)).toEqual({ success: true, data: '[1,2]' });
  });
});

describe('minifyJson', () => {
  it('removes redundant whitespace', () => {
    expect(minifyJson('{\n  "items": [1, 2, 3]\n}')).toBe('{"items":[1,2,3]}');
  });

  it('throws a descriptive error for invalid JSON', () => {
    expect(() => minifyJson('{"broken": }')).toThrow(/列/);
  });
});

describe('jsonToTypeScript', () => {
  it('creates named interfaces for nested objects', () => {
    const result = jsonToTypeScript(
      JSON.stringify({
        id: 1,
        name: 'Ada',
        profile: { active: true },
      }),
      'User',
    );

    expect(result).toContain('export interface User {');
    expect(result).toContain('profile: UserProfile;');
    expect(result).toContain('export interface UserProfile {');
    expect(result).toContain('active: boolean;');
  });

  it('infers array item interfaces and handles null', () => {
    const result = jsonToTypeScript(
      JSON.stringify({ items: [{ id: 1 }], note: null }),
      'Root',
    );

    expect(result).toContain('items: RootItemsItem[];');
    expect(result).toContain('note: null;');
    expect(result).toContain('export interface RootItemsItem {');
  });

  it('quotes keys containing special characters', () => {
    const result = jsonToTypeScript(
      JSON.stringify({ 'first-name': 'Ada', '123key': true }),
      'Profile',
    );

    expect(result).toContain('"first-name": string;');
    expect(result).toContain('"123key": boolean;');
  });

  it('uses unions for mixed arrays and sanitizes invalid root names', () => {
    const result = jsonToTypeScript(
      JSON.stringify({ values: [1, 'two', true] }),
      '123 root',
    );

    expect(result).toContain('export interface Item123Root {');
    expect(result).toContain('values: (number | string | boolean)[];');
  });
});

