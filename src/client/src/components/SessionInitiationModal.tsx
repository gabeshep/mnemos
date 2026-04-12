import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Entity, PublishedAssetVersion } from '../types.ts';

const MAX_ASSET_TOKENS = 159000;

interface SessionInitiationModalProps {
  onClose: () => void;
  onSessionCreated: (sessionId: string) => void;
}

type Step = 'select' | 'prioritize';

export function SessionInitiationModal({ onClose, onSessionCreated }: SessionInitiationModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [publishedVersions, setPublishedVersions] = useState<PublishedAssetVersion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [priorityOrder, setPriorityOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load entities on mount
  useEffect(() => {
    setLoading(true);
    api.getEntities()
      .then(setEntities)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load published versions when entity changes
  useEffect(() => {
    if (!selectedEntityId) {
      setPublishedVersions([]);
      setSelectedIds(new Set());
      return;
    }
    setVersionsLoading(true);
    setSelectedIds(new Set());
    api.getPublishedVersions(selectedEntityId)
      .then(setPublishedVersions)
      .catch((err: Error) => setError(err.message))
      .finally(() => setVersionsLoading(false));
  }, [selectedEntityId]);

  function toggleVersion(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectedVersions = publishedVersions.filter(v => selectedIds.has(v.id));
  const totalTokens = selectedVersions.reduce((sum, v) => sum + v.estimatedTokens, 0);
  const overBudget = totalTokens > MAX_ASSET_TOKENS;
  const canStart = selectedIds.size > 0 && !overBudget;

  function handleStartOrPrioritize() {
    if (overBudget) {
      // Enter prioritize step with current selected order
      setPriorityOrder(selectedVersions.map(v => v.id));
      setStep('prioritize');
    } else {
      submitSession([]);
    }
  }

  async function submitSession(priority: string[]) {
    setLoading(true);
    setError(null);
    try {
      const response = await api.createSession({
        entityId: selectedEntityId,
        assetVersionIds: Array.from(selectedIds),
        title: title.trim() || undefined,
        priority: priority.length > 0 ? priority : undefined,
      });

      if (response.status === 'created') {
        onSessionCreated(response.session.id);
      } else if (response.status === 'threshold_exceeded') {
        // Should not happen when priority is provided, but handle gracefully
        setPriorityOrder(response.breakdown.map(v => v.id));
        setStep('prioritize');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Prioritize step helpers
  const prioritizedVersions = priorityOrder
    .map(id => publishedVersions.find(v => v.id === id))
    .filter((v): v is PublishedAssetVersion => !!v);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...priorityOrder];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setPriorityOrder(next);
  }

  function moveDown(index: number) {
    if (index === priorityOrder.length - 1) return;
    const next = [...priorityOrder];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setPriorityOrder(next);
  }

  // Calculate which versions are included/excluded based on priority order
  let runningTokens = 0;
  const includedIds = new Set<string>();
  const excludedIds = new Set<string>();
  for (const v of prioritizedVersions) {
    if (runningTokens + v.estimatedTokens <= MAX_ASSET_TOKENS) {
      includedIds.add(v.id);
      runningTokens += v.estimatedTokens;
    } else {
      excludedIds.add(v.id);
    }
  }

  const excludedNames = prioritizedVersions.filter(v => excludedIds.has(v.id)).map(v => v.assetName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Start New Session</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b bg-gray-50 flex gap-4 text-sm">
          <span className={step === 'select' ? 'font-semibold text-indigo-600' : 'text-gray-400'}>
            1. Select Assets
          </span>
          <span className="text-gray-300">›</span>
          <span className={step === 'prioritize' ? 'font-semibold text-indigo-600' : 'text-gray-400'}>
            2. Prioritize (if needed)
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Select */}
          {step === 'select' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session title
                  <span className="ml-1 font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q2 messaging review"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity</label>
                {loading ? (
                  <div className="text-sm text-gray-400">Loading entities…</div>
                ) : (
                  <select
                    value={selectedEntityId}
                    onChange={(e) => setSelectedEntityId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">Select an entity…</option>
                    {entities.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {selectedEntityId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Published asset versions
                  </label>
                  {versionsLoading ? (
                    <div className="text-sm text-gray-400">Loading versions…</div>
                  ) : publishedVersions.length === 0 ? (
                    <p className="text-sm text-gray-400">No published versions found for this entity.</p>
                  ) : (
                    <ul className="divide-y border rounded-lg overflow-hidden">
                      {publishedVersions.map((v) => (
                        <li key={v.id}>
                          <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(v.id)}
                              onChange={() => toggleVersion(v.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-gray-900">{v.assetName}</span>
                              <span className="ml-2 text-xs text-gray-400 bg-gray-100 rounded px-1 py-0.5">
                                {v.assetType}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400 shrink-0">
                              ~{v.estimatedTokens.toLocaleString()} tokens
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Token progress bar */}
              {selectedIds.size > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Context usage</span>
                    <span className={overBudget ? 'text-red-600 font-medium' : ''}>
                      {totalTokens.toLocaleString()} / {MAX_ASSET_TOKENS.toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        overBudget ? 'bg-red-500' : totalTokens / MAX_ASSET_TOKENS > 0.7 ? 'bg-amber-400' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.min((totalTokens / MAX_ASSET_TOKENS) * 100, 100)}%` }}
                    />
                  </div>
                  {overBudget && (
                    <p className="mt-1 text-xs text-red-600">
                      Over budget. You'll need to prioritize which assets to include.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Prioritize */}
          {step === 'prioritize' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('select')}
                className="text-sm text-indigo-600 hover:underline"
              >
                ← Back to selection
              </button>

              <p className="text-sm text-gray-600">
                Drag to reorder assets by priority. Assets that fit within the context window are shown in green; those that will be excluded are shown in red.
              </p>

              {excludedNames.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <strong>Context limit reached.</strong> The following asset(s) will be excluded from this session's context:{' '}
                  {excludedNames.join(', ')}.
                </div>
              )}

              <ul className="divide-y border rounded-lg overflow-hidden">
                {prioritizedVersions.map((v, index) => {
                  const included = includedIds.has(v.id);
                  return (
                    <li
                      key={v.id}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        included ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveDown(index)}
                          disabled={index === prioritizedVersions.length - 1}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium ${included ? 'text-green-900' : 'text-red-700'}`}>
                          {v.assetName}
                        </span>
                        <span className={`ml-2 text-xs rounded px-1 py-0.5 ${
                          included ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {v.assetType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">
                          ~{v.estimatedTokens.toLocaleString()} tokens
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          included ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {included ? 'Included' : 'Excluded'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>

          {step === 'select' && (
            <button
              onClick={handleStartOrPrioritize}
              disabled={loading || selectedIds.size === 0}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Starting…' : overBudget ? 'Prioritize Assets' : 'Start Session'}
            </button>
          )}

          {step === 'prioritize' && (
            <button
              onClick={() => submitSession(priorityOrder)}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Starting…' : 'Confirm with these assets'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
