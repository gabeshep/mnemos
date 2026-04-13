import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { Session, SessionMessage, ApiError, SeedVersionSummary } from '../types.ts';
import { CaptureModal } from '../components/CaptureModal.tsx';
import { ErrorNotification } from '../components/ErrorNotification.tsx';

interface SessionDetailPageProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetailPage({ sessionId, onBack }: SessionDetailPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captureContent, setCaptureContent] = useState<string | null>(null);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendErrorCode, setSendErrorCode] = useState<string | undefined>(undefined);
  const [sendErrorRetryable, setSendErrorRetryable] = useState<boolean | undefined>(undefined);
  const [sendErrorRetryAfter, setSendErrorRetryAfter] = useState<number | null | undefined>(undefined);

  // Inline title editing
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Text-selection capture
  const [selectionCapture, setSelectionCapture] = useState<{ text: string; x: number; y: number } | null>(null);

  // Seed assets collapsible
  const [seedsExpanded, setSeedsExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getSession(sessionId)
      .then((s) => {
        setSession(s);
        setMessages(s.messages ?? []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear selection capture on mousedown outside floating button
  useEffect(() => {
    function handleDocMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // If clicking the floating capture button itself, don't clear (handled by onMouseDown there)
      if (target.closest('[data-floating-capture]')) return;
      setSelectionCapture(null);
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, []);

  function handleCaptureSuccess() {
    setCaptureContent(null);
    setCaptureSuccess(true);
  }

  async function handleSendMessage() {
    if (!messageInput.trim() || sending) return;
    setSending(true);
    setSendError(null);
    setSendErrorCode(undefined);
    setSendErrorRetryable(undefined);
    setSendErrorRetryAfter(undefined);
    const content = messageInput.trim();
    setMessageInput('');
    try {
      const result = await api.sendMessage(sessionId, content);
      setMessages(prev => [...prev, result.userMessage, result.assistantMessage]);
    } catch (err) {
      const apiErr = err as ApiError;
      setSendError(apiErr.message);
      setSendErrorCode(apiErr.code);
      setSendErrorRetryable(apiErr.retryable);
      setSendErrorRetryAfter(apiErr.retryAfter);
      setMessageInput(content);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  // Title editing
  function startTitleEdit() {
    if (!session) return;
    setTitleDraft(session.title ?? '');
    setTitleEditing(true);
  }

  async function saveTitleEdit() {
    if (!session) return;
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleEditing(false);
      return;
    }
    try {
      const updated = await api.updateSessionTitle(session.id, trimmed);
      setSession(prev => prev ? { ...prev, title: updated.title } : prev);
    } catch (_err) {
      // ignore — keep original title
    } finally {
      setTitleEditing(false);
    }
  }

  function cancelTitleEdit() {
    setTitleEditing(false);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitleEdit();
    } else if (e.key === 'Escape') {
      cancelTitleEdit();
    }
  }

  // Text-selection capture handler
  function handleMessagesMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
      setSelectionCapture(null);
      return;
    }
    // Check that the selection anchor is inside an assistant message
    const anchor = sel.anchorNode;
    if (!anchor) {
      setSelectionCapture(null);
      return;
    }
    const anchorEl = anchor.nodeType === Node.ELEMENT_NODE
      ? (anchor as HTMLElement)
      : anchor.parentElement;
    if (!anchorEl?.closest('[data-role="assistant-message"]')) {
      setSelectionCapture(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectionCapture({
      text: sel.toString().trim(),
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading session…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!session) {
    return <p className="text-sm text-gray-400">Session not found.</p>;
  }

  const isActive = session.status === 'active';
  const seedDetails: SeedVersionSummary[] = session.seedVersionDetails ?? [];
  const showCollapsible = seedDetails.length > 3;
  const visibleSeeds = showCollapsible && !seedsExpanded ? seedDetails.slice(0, 3) : seedDetails;

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-indigo-600 hover:underline"
      >
        ← Back to sessions
      </button>

      <div className="flex items-center justify-between mb-2">
        {titleEditing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitleEdit}
            onKeyDown={handleTitleKeyDown}
            className="text-2xl font-semibold text-gray-900 border-b-2 border-indigo-400 focus:outline-none bg-transparent flex-1 mr-4"
          />
        ) : (
          <h1
            className="text-2xl font-semibold text-gray-900 cursor-pointer hover:text-indigo-700 transition-colors"
            onClick={startTitleEdit}
            title="Click to edit title"
          >
            {session.title ?? 'Untitled session'}
          </h1>
        )}
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
            session.status === 'active'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {session.status}
        </span>
      </div>

      {/* Seeded assets context header */}
      {seedDetails.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-gray-500 font-medium mr-1">Context:</span>
          {visibleSeeds.map(v => (
            <span
              key={v.id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
            >
              {v.assetName} v{v.versionNumber}
            </span>
          ))}
          {showCollapsible && (
            <button
              onClick={() => setSeedsExpanded(x => !x)}
              className="text-xs text-indigo-500 hover:text-indigo-700 underline ml-1"
            >
              {seedsExpanded ? 'Show less' : `+${seedDetails.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {/* Excluded assets banner */}
      {session.excludedAssetVersions && session.excludedAssetVersions.length > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>Context limit:</strong> {session.excludedAssetVersions.length} asset(s) were excluded from this session's context.
        </div>
      )}

      {captureSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Content captured as a draft asset version.
        </div>
      )}

      {messages.length === 0 && (
        <p className="text-sm text-gray-400 mb-4">No messages in this session yet. Send a message to get started.</p>
      )}

      <div
        ref={messagesContainerRef}
        className="space-y-4 flex-1 overflow-y-auto mb-4"
        onMouseUp={handleMessagesMouseUp}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' ? (
              <div
                data-role="assistant-message"
                className="max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap bg-white border text-gray-800 rounded-bl-sm shadow-sm"
              >
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap bg-indigo-600 text-white rounded-br-sm">
                {msg.content}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating text-selection capture button */}
      {selectionCapture !== null && (
        <div
          data-floating-capture
          style={{
            position: 'fixed',
            left: selectionCapture.x,
            top: selectionCapture.y - 40,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setCaptureContent(selectionCapture.text);
              setSelectionCapture(null);
            }}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            ⊕ Capture to asset
          </button>
        </div>
      )}

      <ErrorNotification
        error={sendError}
        code={sendErrorCode}
        retryable={sendErrorRetryable}
        retryAfter={sendErrorRetryAfter}
        onDismiss={() => {
          setSendError(null);
          setSendErrorCode(undefined);
          setSendErrorRetryable(undefined);
          setSendErrorRetryAfter(undefined);
        }}
      />

      {/* Message input */}
      {isActive && (
        <div className="border rounded-xl bg-white shadow-sm flex items-end gap-2 px-3 py-2">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Ctrl+Enter to send)"
            rows={3}
            disabled={sending}
            className="flex-1 resize-none text-sm focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={sending || !messageInput.trim()}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}

      {captureContent !== null && session && (
        <CaptureModal
          sessionId={session.id}
          content={captureContent}
          onClose={() => setCaptureContent(null)}
          onSuccess={handleCaptureSuccess}
          entityId={session.entityId}
        />
      )}
    </div>
  );
}
