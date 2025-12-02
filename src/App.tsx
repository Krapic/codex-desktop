import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Attachment = { path: string; preview?: string | null };
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; attachments?: Attachment[] };
type Status = 'ready' | 'running' | 'disconnected';

const randomId = () => crypto.randomUUID();
const FALLBACK_IMG =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140" viewBox="0 0 200 140" fill="none"><rect width="200" height="140" rx="12" fill="#101826"/><rect x="24" y="30" width="72" height="72" rx="12" fill="#151f30" stroke="#26354d" stroke-width="3"/><path d="M44 88h32L60 66l-8 10-8-18-10 30h10z" fill="#2fd29e" opacity="0.7"/><circle cx="56" cy="54" r="8" fill="#2fb2e3"/><rect x="108" y="30" width="68" height="12" rx="6" fill="#1e2a3d"/><rect x="108" y="50" width="68" height="12" rx="6" fill="#1e2a3d"/><rect x="108" y="70" width="48" height="12" rx="6" fill="#1e2a3d"/></svg>`
  );

export default function App() {
  const bridge = window.codexApi;
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<Status>('ready');
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [model, setModel] = useState<string>('gpt-5.1-codex-max');
  const [sandbox, setSandbox] = useState<string>('');
  const [cwd, setCwd] = useState<string>('');
  const [cwdOptions, setCwdOptions] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [rawLog, setRawLog] = useState<string[]>([]);
  const assistantIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef<string>('');

  useEffect(() => {
    if (!bridge) {
      setBridgeError('codexApi preload bridge is missing. Run via Electron so preload is applied.');
      setStatus('disconnected');
      console.error('codexApi bridge not found on window');
      return;
    }

    const id = randomId();
    setSessionId(id);
    bridge.startSession({ sessionId: id });

    const offData = bridge.onData((payload) => {
      if (payload.sessionId !== id || !assistantIdRef.current) return;
      setStatus('running');
      bufferRef.current += payload.data;
      const lines = bufferRef.current.split(/\r?\n/);
      bufferRef.current = lines.pop() ?? '';

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('Reading prompt from stdin')) return;
        setRawLog((prev) => {
          const next = [...prev, trimmed].slice(-200);
          return next;
        });
        try {
          const event = JSON.parse(trimmed);
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
            const textChunk = event.item.text ?? '';
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantIdRef.current ? { ...msg, text: msg.text + textChunk } : msg
              )
            );
          }
          if (event.type === 'item.completed' && event.item?.type === 'reasoning') {
            // could append reasoning if desired; skip for brevity
          }
        } catch (err) {
          // Ignore non-JSON noise (e.g., CLI banners).
        }
      });
    });

    const offExit = bridge.onExit((payload) => {
      if (payload.sessionId !== id) return;
      setStatus('ready');
    });

    const offErr = bridge.onError((payload) => {
      if (payload.sessionId !== id) return;
      setSessionError(payload.message);
      setStatus('disconnected');
    });

    return () => {
      offData();
      offExit();
      offErr();
      bridge.stopSession(id);
    };
  }, [bridge]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pickImages = async () => {
    if (!bridge) return;
    const files = await bridge.pickImages();
    const withPreviews: Attachment[] = files.map((file) => ({
      path: file,
      preview: bridge.readImageAsDataUrl(file),
    }));
    setAttachments(withPreviews);
  };

  const pickCwd = async () => {
    if (!bridge) return;
    const dir = await bridge.pickCwd();
    if (!dir) return;
    setCwd(dir);
    setCwdOptions((prev) => {
      const next = [dir, ...prev.filter((d) => d !== dir)].slice(0, 5);
      return next;
    });
  };

  const removeAttachment = (path: string) => {
    setAttachments((prev) => prev.filter((att) => att.path !== path));
  };

  const send = async () => {
    if (!draft.trim() && attachments.length === 0) return;
    if (!sessionId || !bridge) return;

    const userMsg: ChatMessage = {
      id: randomId(),
      role: 'user',
      text: draft.trim() || '(empty message)',
      attachments
    };
    const assistantMsgId = randomId();
    assistantIdRef.current = assistantMsgId;

    setMessages((prev) => [...prev, userMsg, { id: assistantMsgId, role: 'assistant', text: '' }]);
    setStatus('running');
    setDraft('');
    setAttachments([]);
    setSessionError(null);
    bufferRef.current = '';

    await bridge.sendMessage({
      sessionId,
      text: draft,
      attachments: attachments.map((a) => a.path),
      model: model || undefined,
      sandbox: sandbox || undefined,
      cwd: cwd || undefined,
    });
  };

  if (bridgeError) {
    return (
      <div className="app missing">
        <div className="missing-card">
          <h1>Bridge not available</h1>
          <p>{bridgeError}</p>
          <p>Start the app through Electron (npm run dev / npm run dist) so the preload script runs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="bar">
        <div className="logo">Codex Desktop</div>
        <div className="controls">
          <select
            className="control-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="gpt-5.1-codex-max">gpt-5.1-codex-max</option>
            <option value="gpt-4.1-codex">gpt-4.1-codex</option>
            <option value="gpt-4o-mini-codex">gpt-4o-mini-codex</option>
            <option value="">Custom (set via env or config)</option>
          </select>
          <select
            className="control-select"
            value={sandbox}
            onChange={(e) => setSandbox(e.target.value)}
          >
            <option value="">Sandbox</option>
            <option value="read-only">read-only</option>
            <option value="workspace-write">workspace-write</option>
            <option value="danger-full-access">danger-full-access</option>
          </select>
          <div className="cwd-group">
            <select
              className="control-select cwd"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            >
              <option value="">Working dir (optional)</option>
              {cwdOptions.map((dir) => (
                <option key={dir} value={dir}>
                  {dir}
                </option>
              ))}
              {cwd ? <option value={cwd}>{cwd}</option> : null}
            </select>
            <button className="ghost" onClick={pickCwd}>
              Browse
            </button>
          </div>
          <button className="ghost" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Hide log' : 'Show log'}
          </button>
        </div>
        <div className="status">
          <span className={`dot ${status}`} />
          {status === 'running' ? 'Working' : status === 'disconnected' ? 'Disconnected' : 'Ready'}
        </div>
        <button className="ghost" onClick={() => bridge?.stopSession(sessionId)}>
          Stop CLI
        </button>
      </header>

      <main className="layout">
        {sessionError ? (
          <div className="session-error">CLI error: {sessionError}</div>
        ) : null}
        {showLog ? (
          <div className="log-panel">
            <div className="log-header">CLI log (last {rawLog.length} lines)</div>
            <pre className="log-body">{rawLog.join('\n')}</pre>
          </div>
        ) : null}
        <section className="messages">
          {messages.map((msg) => (
            <article key={msg.id} className={`bubble ${msg.role}`}>
              <div className="meta">{msg.role === 'user' ? 'You' : 'Codex'}</div>
              <div className="md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.text || '...'}
                </ReactMarkdown>
              </div>
              {msg.attachments?.length ? (
                <div className="thumbs">
                  {msg.attachments.map((att) => (
                    <div key={att.path} className="thumb">
                      <img src={att.preview ?? `file://${att.path}`} alt={pathLeaf(att.path)} />
                      <span>{pathLeaf(att.path)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          <div ref={bottomRef} />
        </section>

        <section className="composer">
          {attachments.length > 0 && (
            <div className="attachments">
              {attachments.map((att) => (
                <div key={att.path} className="attachment">
                  <div className="attachment-icon" aria-hidden="true">IMG</div>
                  <button
                    className="attachment-remove"
                    title="Remove"
                    aria-label="Remove attachment"
                    onClick={() => removeAttachment(att.path)}
                  >
                    ×
                  </button>
                  <img
                    src={att.preview ?? FALLBACK_IMG}
                    alt={pathLeaf(att.path)}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== FALLBACK_IMG) target.src = FALLBACK_IMG;
                    }}
                  />
                  <span>{pathLeaf(att.path)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="inputRow">
            <textarea
              placeholder="Send a prompt to the Codex agent…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="actions">
              <button onClick={pickImages}>Attach image</button>
              <button className="primary" onClick={send}>
                Send
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function pathLeaf(file: string) {
  return file.split(/[\\/]/).pop() ?? file;
}
