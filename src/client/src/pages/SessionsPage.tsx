import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Session, SessionSearchResult } from '../types.ts';
import { SessionInitiationModal } from '../components/SessionInitiationModal.tsx';

interface SessionsPageProps {
  onSelectSession: (sessionId: string) => void;
}

export function SessionsPage({ onSelectSession }: SessionsPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInitiationModal, setShowInitiationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SessionSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    api.getSessions()
      .then(setSessions)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSessionCreated(sessionId: string) {
    setShowInitiationModal(false);
    onSelectSession(sessionId);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const results = await api.searchSessions(searchQuery);
      setSearchResults(results);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  function handleSearchClear() {
    setSearchQuery('');
    setSearchResults(null);
  }

  function sanitizeSnippet(s: string) {
    return s.replace(/<(?!\/?b>)[^>]+>/g, '');
  }

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Sessions</h1>
        <button
          onClick={() => setShowInitiationModal(true)}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          New Session
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search sessions..."
          className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={searching}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        {searchResults !== null && (
          <button
            type="button"
            onClick={handleSearchClear}
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {searchError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {searchError}
        </div>
      )}

      {searchResults === null ? (
        <>
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
        </>
      ) : searchResults.length === 0 ? (
        <p className="text-sm text-gray-400">No sessions matched your search.</p>
      ) : (
        <ul className="divide-y border rounded-xl bg-white overflow-hidden">
          {searchResults.map((result) => (
            <li key={result.sessionId}>
              <button
                onClick={() => onSelectSession(result.sessionId)}
                className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {result.title ?? 'Untitled session'}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      result.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(result.createdAt).toLocaleString()}
                </p>
                {result.matchingMessages.map((msg) => (
                  <div key={msg.messageId} className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2">
                    <span className="font-medium capitalize text-gray-500 mr-2">{msg.role}:</span>
                    <span
                      dangerouslySetInnerHTML={{ __html: sanitizeSnippet(msg.snippet) }}
                    />
                  </div>
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showInitiationModal && (
        <SessionInitiationModal
          onClose={() => setShowInitiationModal(false)}
          onSessionCreated={handleSessionCreated}
        />
      )}
    </div>
  );
}
