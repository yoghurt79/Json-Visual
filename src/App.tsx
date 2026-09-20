import { useEffect, useMemo, useState, type DragEvent } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import JsonTree from './components/JsonTree';
import {
  formatJson,
  jsonToTypeScript,
  minifyJson,
  type JsonValue,
} from './utils/json';

const SAMPLE_JSON = JSON.stringify(
  {
    project: 'JSON-Visual',
    offline: true,
    features: ['格式化', '压缩', '树形视图', 'TypeScript'],
    privacy: {
      upload: false,
      processing: 'browser-local',
    },
    version: 1,
  },
  null,
  2,
);

const jsonLanguage = json();
type TabId = 'formatted' | 'tree' | 'typescript';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'formatted', label: '格式化结果' },
  { id: 'tree', label: '树形视图' },
  { id: 'typescript', label: 'TypeScript 接口' },
];

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export default function App() {
  const [input, setInput] = useState(SAMPLE_JSON);
  const [jsonOutput, setJsonOutput] = useState(SAMPLE_JSON);
  const [typescriptOutput, setTypescriptOutput] = useState('');
  const [rootName, setRootName] = useState('Root');
  const [activeTab, setActiveTab] = useState<TabId>('formatted');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const parsedState = useMemo(() => {
    if (!input.trim()) return { value: undefined as JsonValue | undefined, error: '' };

    const result = formatJson(input, 2);
    if (!result.success) {
      return { value: undefined as JsonValue | undefined, error: result.error ?? 'JSON 语法错误' };
    }

    return { value: JSON.parse(input) as JsonValue, error: '' };
  }, [input]);

  const displayError = actionError || parsedState.error;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleInputChange = (value: string) => {
    setInput(value);
    setActionError('');
    setNotice('');
  };

  const handleFormat = () => {
    const result = formatJson(input, 2);
    if (!result.success || result.data === undefined) {
      setActionError(result.error ?? '格式化失败');
      return;
    }

    setJsonOutput(result.data);
    setActionError('');
    setActiveTab('formatted');
    setNotice('格式化完成');
  };

  const handleMinify = () => {
    try {
      const output = minifyJson(input);
      setJsonOutput(output);
      setActionError('');
      setActiveTab('formatted');
      setNotice('压缩完成');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '压缩失败');
    }
  };

  const handleToTypeScript = () => {
    try {
      const output = jsonToTypeScript(input, rootName.trim() || 'Root');
      setTypescriptOutput(output);
      setActionError('');
      setActiveTab('typescript');
      setNotice('TypeScript 接口已生成');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '转换失败');
    }
  };

  const getActiveContent = (): string => {
    if (activeTab === 'typescript') return typescriptOutput;
    if (activeTab === 'tree') {
      return parsedState.value === undefined
        ? ''
        : JSON.stringify(parsedState.value, null, 2);
    }
    return jsonOutput;
  };

  const handleCopy = async () => {
    const content = getActiveContent();
    if (!content) {
      setActionError('当前标签页没有可复制的内容');
      return;
    }

    try {
      await copyText(content);
      setActionError('');
      setNotice('已复制到剪贴板');
    } catch {
      setActionError('复制失败，请检查浏览器剪贴板权限');
    }
  };

  const handleDownload = () => {
    const content = getActiveContent();
    if (!content) {
      setActionError('当前标签页没有可下载的内容');
      return;
    }

    const isTypeScript = activeTab === 'typescript';
    const safeName = (rootName.trim() || 'interfaces').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const fileName = isTypeScript ? `${safeName || 'interfaces'}.ts` : 'json-visual.json';
    const blob = new Blob([content], {
      type: isTypeScript ? 'text/typescript;charset=utf-8' : 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setActionError('');
    setNotice('文件已下载');
  };

  const handleClear = () => {
    setInput('');
    setJsonOutput('');
    setTypescriptOutput('');
    setActionError('');
    setNotice('');
    setActiveTab('formatted');
  };

  const loadJsonFile = async (file: File) => {
    const isJsonFile =
      file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';

    if (!isJsonFile) {
      setActionError('仅支持拖入 .json 文件');
      return;
    }

    try {
      const content = await file.text();
      handleInputChange(content);
      setActiveTab('tree');
      setNotice(`已读取 ${file.name}`);
    } catch {
      setActionError('文件读取失败，请重试');
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadJsonFile(file);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">{'{ }'}</div>
          <div>
            <h1>JSON-Visual</h1>
            <p>格式化、探索和转换 JSON，数据始终留在本机。</p>
          </div>
        </div>
        <div className="offline-badge">
          <span className="status-dot" />
          100% 本地处理
        </div>
      </header>

      <main className="main-content">
        <div className="toolbar" role="toolbar" aria-label="JSON 操作">
          <button type="button" className="tool-button primary" onClick={handleFormat}>
            <span aria-hidden="true">{'{ }'}</span>格式化
          </button>
          <button type="button" className="tool-button" onClick={handleMinify}>
            <span aria-hidden="true">⇄</span>压缩
          </button>
          <button type="button" className="tool-button" onClick={handleToTypeScript}>
            <span aria-hidden="true">TS</span>转 TS
          </button>
          <button type="button" className="tool-button" onClick={handleCopy}>
            <span aria-hidden="true">⧉</span>复制结果
          </button>
          <button type="button" className="tool-button" onClick={handleDownload}>
            <span aria-hidden="true">↓</span>下载
          </button>
          <button type="button" className="tool-button danger" onClick={handleClear}>
            <span aria-hidden="true">×</span>清空
          </button>

          <label className="root-name-control">
            <span>接口名</span>
            <input
              value={rootName}
              onChange={(event) => setRootName(event.target.value)}
              spellCheck={false}
              aria-label="根接口名称"
            />
          </label>

          <span className="toolbar-notice" aria-live="polite">{notice}</span>
        </div>

        {displayError && (
          <div className="error-banner" role="alert">
            <span className="error-icon" aria-hidden="true">!</span>
            <div>
              <strong>JSON 解析失败</strong>
              <p>{displayError}</p>
            </div>
          </div>
        )}

        <section className="workspace">
          <article
            className={`pane editor-pane ${isDragging ? 'is-dragging' : ''}`}
            onDragEnterCapture={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOverCapture={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setIsDragging(true);
            }}
            onDragLeaveCapture={handleDragLeave}
            onDropCapture={handleDrop}
          >
            <header className="pane-header">
              <div>
                <span className="pane-kicker">INPUT</span>
                <h2>JSON 输入</h2>
              </div>
              <span className="pane-hint">支持拖入 .json 文件</span>
            </header>

            <div className="editor-wrap">
              <CodeMirror
                value={input}
                height="100%"
                theme="dark"
                extensions={[jsonLanguage]}
                onChange={handleInputChange}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  autocompletion: false,
                }}
              />
            </div>

            {isDragging && (
              <div className="drop-overlay">
                <div className="drop-icon" aria-hidden="true">↓</div>
                <strong>松开以读取 JSON 文件</strong>
                <span>文件仅在浏览器本地解析</span>
              </div>
            )}
          </article>

          <article className="pane result-pane">
            <header className="result-header">
              <div className="tabs" role="tablist" aria-label="结果视图">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={`tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </header>

            <div className="result-body">
              {activeTab === 'formatted' && (
                jsonOutput ? (
                  <pre className="code-output"><code>{jsonOutput}</code></pre>
                ) : (
                  <EmptyState title="暂无格式化结果" description="点击工具栏中的“格式化”或“压缩”。" />
                )
              )}

              {activeTab === 'tree' && (
                parsedState.value !== undefined ? (
                  <JsonTree data={parsedState.value} />
                ) : (
                  <EmptyState title="暂无树形数据" description="输入合法的 JSON 后将在这里显示。" />
                )
              )}

              {activeTab === 'typescript' && (
                typescriptOutput ? (
                  <pre className="code-output ts-output"><code>{typescriptOutput}</code></pre>
                ) : (
                  <EmptyState title="尚未生成接口" description="点击工具栏中的“转 TS”生成 TypeScript 声明。" />
                )
              )}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-symbol" aria-hidden="true">{'{ }'}</div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
