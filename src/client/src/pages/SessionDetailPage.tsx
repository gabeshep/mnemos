import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { Session, SessionMessage, ApiError } from '../types.ts';
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  function handleCaptureClick(msg: SessionMessage) {
    setCaptureContent(msg.content);
    setCaptureSuccess(false);
  }

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
      // Restore input so user doesn't lose their message
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

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-indigo-600 hover:underline"
      >
        ← Back to sessions
      </button>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {session.title ?? 'Untitled session'}
        </h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            session.status === 'active'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {session.status}
        </span>
      </div>

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

      <div className="space-y-4 flex-1 overflow-y-auto mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`group relative max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white border text-gray-800 rounded-bl-sm shadow-sm'
              }`}
            >
              {msg.content}

              {/* Capture button — only on assistant messages */}
              {msg.role === 'assistant' && (
                <button
                  onClick={() => handleCaptureClick(msg)}
                  className="mt-2 flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Capture this content to an asset"
                >
                  <span>⊕</span> Capture to asset
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

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
        />
      )}
    </div>
  );
}
