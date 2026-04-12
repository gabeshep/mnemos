import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Session } from '../types.ts';

interface SessionsPageProps {
  onSelectSession: (sessionId: string) => void;
}

export function SessionsPage({ onSelectSession }: SessionsPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSessions()
      .then(setSessions)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading sessions…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Sessions</h1>
      {sessions.length === 0 && (
        <p className="text-sm text-gray-400">No sessions yet.</p>
      )}
      <ul className="divide-y border rounded-xl bg-white overflow-hidden">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              onClick={() => onSelectSession(session.id)}
              className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">
                  {session.title ?? 'Untitled session'}
                </span>
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
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(session.createdAt).toLocaleString()}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
