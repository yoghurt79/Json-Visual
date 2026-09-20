import { useState } from 'react';
import type { JsonValue } from '../utils/json';

interface JsonTreeProps {
  data: JsonValue;
}

interface TreeNodeProps {
  name: string;
  value: JsonValue;
  depth: number;
}

function primitiveClass(value: JsonValue): string {
  if (value === null) return 'json-null';
  return `json-${typeof value}`;
}

function primitiveLabel(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function TreeNode({ name, value, depth }: TreeNodeProps) {
  const isCollection = value !== null && typeof value === 'object';
  const [expanded, setExpanded] = useState(depth < 2);
  const rowStyle = { paddingLeft: `${depth * 20 + 12}px` };

  if (!isCollection) {
    return (
      <div className="tree-row tree-row-primitive" style={rowStyle}>
        <span className="tree-spacer" aria-hidden="true" />
        <span className="tree-key">{name}</span>
        <span className="tree-separator">:</span>
        <span className={primitiveClass(value)}>{primitiveLabel(value)}</span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((child, index) => [String(index), child] as const)
    : Object.entries(value);
  const brackets = Array.isArray(value) ? ['[', ']'] : ['{', '}'];

  return (
    <div className="tree-node">
      <button
        type="button"
        className="tree-row tree-toggle"
        style={rowStyle}
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span className={`tree-arrow ${expanded ? 'is-expanded' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="tree-key">{name}</span>
        <span className="tree-separator">:</span>
        <span className="tree-bracket">{brackets[0]}</span>
        <span className="tree-count">{entries.length} 项</span>
        {!expanded && <span className="tree-bracket">{brackets[1]}</span>}
      </button>

      {expanded && (
        <div className="tree-children" role="group">
          {entries.map(([childName, childValue]) => (
            <TreeNode
              key={`${name}-${childName}`}
              name={childName}
              value={childValue}
              depth={depth + 1}
            />
          ))}
          <div className="tree-row tree-closing" style={{ paddingLeft: `${depth * 20 + 32}px` }}>
            <span className="tree-bracket">{brackets[1]}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** JSON 树形查看器：对象和数组可逐级展开，基础值按类型着色。 */
export default function JsonTree({ data }: JsonTreeProps) {
  return (
    <div className="json-tree" role="tree" aria-label="JSON 树形视图">
      <TreeNode name="$" value={data} depth={0} />
    </div>
  );
}
