import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Session, SessionMessage } from '../types.ts';
import { CaptureModal } from '../components/CaptureModal.tsx';

interface SessionDetailPageProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetailPage({ sessionId, onBack }: SessionDetailPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captureContent, setCaptureContent] = useState<string | null>(null);
  const [captureSuccess, setCaptureSuccess] = useState(false);

  useEffect(() => {
    api.getSession(sessionId)
      .then(setSession)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  function handleCaptureClick(msg: SessionMessage) {
    setCaptureContent(msg.content);
    setCaptureSuccess(false);
  }

  function handleCaptureSuccess() {
    setCaptureContent(null);
    setCaptureSuccess(true);
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

  const messages = session.messages ?? [];

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-indigo-600 hover:underline"
      >
        ← Back to sessions
      </button>

      <div className="flex items-center justify-between mb-6">
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

      {captureSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Content captured as a draft asset version.
        </div>
      )}

      {messages.length === 0 && (
        <p className="text-sm text-gray-400">No messages in this session.</p>
      )}

      <div className="space-y-4">
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
      </div>

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
