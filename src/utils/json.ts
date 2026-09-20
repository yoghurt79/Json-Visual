export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface FormatJsonResult {
  success: boolean;
  data?: string;
  error?: string;
}

function normalizeIndent(space: number): number {
  if (!Number.isFinite(space)) return 2;
  return Math.min(Math.max(Math.trunc(space), 0), 10);
}

function lineAndColumnAt(raw: string, position: number): { line: number; column: number } {
  const safePosition = Math.max(0, Math.min(position, raw.length));
  const before = raw.slice(0, safePosition);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function findJsonSyntaxErrorPosition(raw: string): number | undefined {
  let index = 0;

  const fail = (position = index): never => {
    throw position;
  };

  const skipWhitespace = () => {
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
  };

  const parseString = () => {
    if (raw[index] !== '"') fail();
    index += 1;

    while (index < raw.length) {
      const character = raw[index];

      if (character === '"') {
        index += 1;
        return;
      }

      if (character === '\\') {
        index += 1;
        const escaped = raw[index];
        if (!escaped) fail();

        if (escaped === 'u') {
          const hex = raw.slice(index + 1, index + 5);
          if (!/^[0-9a-f]{4}$/i.test(hex)) fail(index - 1);
          index += 5;
        } else if ('"\\/bfnrt'.includes(escaped)) {
          index += 1;
        } else {
          fail(index - 1);
        }
        continue;
      }

      if (character.charCodeAt(0) < 0x20) fail();
      index += 1;
    }

    fail();
  };

  const parseNumber = () => {
    const match = raw.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) return fail();
    index += match[0].length;
  };

  const parseArray = () => {
    index += 1;
    skipWhitespace();
    if (raw[index] === ']') {
      index += 1;
      return;
    }

    while (index < raw.length) {
      parseValue();
      skipWhitespace();
      if (raw[index] === ']') {
        index += 1;
        return;
      }
      if (raw[index] !== ',') fail();
      index += 1;
      skipWhitespace();
    }

    fail();
  };

  const parseObject = () => {
    index += 1;
    skipWhitespace();
    if (raw[index] === '}') {
      index += 1;
      return;
    }

    while (index < raw.length) {
      parseString();
      skipWhitespace();
      if (raw[index] !== ':') fail();
      index += 1;
      skipWhitespace();
      parseValue();
      skipWhitespace();
      if (raw[index] === '}') {
        index += 1;
        return;
      }
      if (raw[index] !== ',') fail();
      index += 1;
      skipWhitespace();
    }

    fail();
  };

  function parseValue() {
    skipWhitespace();
    const character = raw[index];

    if (character === '"') return parseString();
    if (character === '{') return parseObject();
    if (character === '[') return parseArray();
    if (character === '-' || (character >= '0' && character <= '9')) return parseNumber();

    for (const literal of ['true', 'false', 'null']) {
      if (raw.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }

    return fail();
  }

  try {
    parseValue();
    skipWhitespace();
    if (index !== raw.length) fail();
    return undefined;
  } catch (position) {
    return typeof position === 'number' ? position : undefined;
  }
}

function describeJsonError(error: unknown, raw: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);

  let line: number | undefined;
  let column: number | undefined;

  if (lineColumnMatch) {
    line = Number(lineColumnMatch[1]);
    column = Number(lineColumnMatch[2]);
  } else {
    const positionMatch = message.match(/(?:at\s+)?position\s+(\d+)/i);
    const fallbackPosition = findJsonSyntaxErrorPosition(raw);
    const errorPosition = positionMatch ? Number(positionMatch[1]) : fallbackPosition;

    if (errorPosition !== undefined) {
      const location = lineAndColumnAt(raw, errorPosition);
      line = location.line;
      column = location.column;
    }
  }

  const cleanMessage = message
    .replace(/\s+at position\s+\d+.*$/i, '')
    .replace(/\s+\(line\s+\d+\s+column\s+\d+\)$/i, '')
    .trim();

  return line && column
    ? `${cleanMessage}（第 ${line} 行，第 ${column} 列）`
    : cleanMessage;
}

function parseJson(raw: string): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch (error) {
    throw new SyntaxError(describeJsonError(error, raw));
  }
}

/** 解析并格式化 JSON，失败时返回带行列信息的错误。 */
export function formatJson(rawStr: string, space: number): FormatJsonResult {
  try {
    const parsed = JSON.parse(rawStr) as JsonValue;
    return { success: true, data: JSON.stringify(parsed, null, normalizeIndent(space)) };
  } catch (error) {
    return { success: false, error: describeJsonError(error, rawStr) };
  }
}

/** 压缩 JSON；无效语法会抛出带行列信息的 SyntaxError。 */
export function minifyJson(rawStr: string): string {
  return JSON.stringify(parseJson(rawStr));
}

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED_TYPE_NAMES = new Set([
  'any', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'from', 'function', 'if', 'import', 'in',
  'instanceof', 'interface', 'let', 'new', 'null', 'number', 'package',
  'private', 'protected', 'public', 'return', 'static', 'string', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined',
  'unknown', 'var', 'void', 'while', 'with', 'yield',
]);

function toPascalCase(value: string, fallback: string): string {
  const words = value.match(/[A-Za-z0-9]+/g) ?? [];
  const combined = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  const candidate = combined || fallback;
  return /^[0-9]/.test(candidate) ? `Item${candidate}` : candidate;
}

function normalizeTypeName(value: string, fallback: string): string {
  const trimmed = value.trim();
  const candidate = VALID_IDENTIFIER.test(trimmed) ? trimmed : toPascalCase(trimmed, fallback);

  if (!VALID_IDENTIFIER.test(candidate)) return fallback;
  return RESERVED_TYPE_NAMES.has(candidate) ? `${candidate}Type` : candidate;
}

function propertyName(key: string): string {
  return VALID_IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 将 JSON 转换为可导出的 TypeScript 类型声明。 */
export function jsonToTypeScript(jsonStr: string, rootName: string): string {
  const parsed = parseJson(jsonStr);
  const safeRootName = normalizeTypeName(rootName, 'Root');
  const declarations: string[] = [];
  const usedNames = new Set<string>();

  const reserveName = (preferredName: string): string => {
    const baseName = normalizeTypeName(preferredName, 'RootItem');
    let name = baseName;
    let suffix = 2;

    while (usedNames.has(name)) {
      name = `${baseName}${suffix}`;
      suffix += 1;
    }

    usedNames.add(name);
    return name;
  };

  const generateType = (value: JsonValue, suggestedName: string): string => {
    if (value === null) return 'null';

    if (Array.isArray(value)) {
      if (value.length === 0) return 'unknown[]';

      const itemTypes = [
        ...new Set(value.map((item) => generateType(item, `${suggestedName}Item`))),
      ];
      const itemType = itemTypes.join(' | ');
      return itemTypes.length > 1 ? `(${itemType})[]` : `${itemType}[]`;
    }

    if (isJsonObject(value)) {
      const interfaceName = reserveName(suggestedName);
      const properties = Object.entries(value).map(([key, childValue]) => {
        const childName = `${interfaceName}${toPascalCase(key, 'Item')}`;
        return `  ${propertyName(key)}: ${generateType(childValue, childName)};`;
      });

      declarations.push(`export interface ${interfaceName} {\n${properties.join('\n')}\n}`);
      return interfaceName;
    }

    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'unknown';
  };

  const rootType = generateType(parsed, safeRootName);

  if (isJsonObject(parsed)) {
    return `${declarations.join('\n\n')}\n`;
  }

  const rootDeclaration = `export type ${safeRootName} = ${rootType};`;
  return [rootDeclaration, ...declarations].join('\n\n') + '\n';
}


