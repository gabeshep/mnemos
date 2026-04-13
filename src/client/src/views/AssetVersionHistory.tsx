import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { AssetVersion } from '../types.ts';
import { AssetDiffViewer } from '../components/AssetDiffViewer.tsx';

interface AssetVersionHistoryProps {
  assetId: string;
  assetName: string;
  onBack: () => void;
}

export function AssetVersionHistory({ assetId, assetName, onBack }: AssetVersionHistoryProps) {
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Diff selection: the two version IDs chosen for comparison
  const [diffBaseId, setDiffBaseId] = useState<string | null>(null);
  const [diffCompareId, setDiffCompareId] = useState<string | null>(null);

  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    api.getAssetVersions(assetId)
      .then((v) => {
        // Sort descending by version number so newest is first
        const sorted = [...v].sort((a, b) => b.versionNumber - a.versionNumber);
        setVersions(sorted);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [assetId]);

  function handleSelectBase(id: string) {
    setDiffBaseId(id);
    setShowDiff(false);
    // If the same version is already selected as compare, clear compare
    if (diffCompareId === id) setDiffCompareId(null);
  }

  function handleSelectCompare(id: string) {
    setDiffCompareId(id);
    setShowDiff(false);
    // If the same version is already selected as base, clear base
    if (diffBaseId === id) setDiffBaseId(null);
  }

  function handleCompareDiff() {
    if (diffBaseId && diffCompareId) {
      setShowDiff(true);
    }
  }

  function handleCloseDiff() {
    setShowDiff(false);
  }

  const baseVersion = versions.find((v) => v.id === diffBaseId) ?? null;
  const compareVersion = versions.find((v) => v.id === diffCompareId) ?? null;

  const canCompare = diffBaseId !== null && diffCompareId !== null && diffBaseId !== diffCompareId;

  function stateLabel(state: AssetVersion['state']) {
    if (state === 'published') return 'bg-green-100 text-green-700';
    if (state === 'archived') return 'bg-gray-100 text-gray-500';
    return 'bg-yellow-100 text-yellow-700';
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading version history…</div>;
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
      <button
        onClick={onBack}
        className="mb-4 text-sm text-indigo-600 hover:underline"
      >
        ← Back
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Version History — {assetName}
        </h1>
      </div>

      {versions.length === 0 && (
        <p className="text-sm text-gray-400">No versions found for this asset.</p>
      )}

      {/* Diff selection controls */}
      {versions.length >= 2 && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">Select two versions to compare:</span>
          <button
            onClick={handleCompareDiff}
            disabled={!canCompare}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Compare
          </button>
          {(diffBaseId || diffCompareId) && (
            <button
              onClick={() => { setDiffBaseId(null); setDiffCompareId(null); setShowDiff(false); }}
              className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Selection legend */}
      {(diffBaseId || diffCompareId) && (
        <div className="mb-4 flex gap-4 text-xs text-gray-500">
          {diffBaseId && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-200 border border-amber-400" />
              Base: v{versions.find((v) => v.id === diffBaseId)?.versionNumber}
            </span>
          )}
          {diffCompareId && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-200 border border-indigo-400" />
              Compare: v{versions.find((v) => v.id === diffCompareId)?.versionNumber}
            </span>
          )}
        </div>
      )}

      {/* Version list */}
      <ul className="divide-y border rounded-xl bg-white overflow-hidden mb-6">
        {versions.map((version) => {
          const isBase = version.id === diffBaseId;
          const isCompare = version.id === diffCompareId;
          return (
            <li
              key={version.id}
              className={`px-5 py-4 ${isBase ? 'bg-amber-50' : isCompare ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-gray-900 shrink-0">
                    v{version.versionNumber}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateLabel(version.state)}`}
                  >
                    {version.state}
                  </span>
                  {version.notes && (
                    <span className="text-sm text-gray-500 truncate">{version.notes}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">
                    {new Date(version.createdAt).toLocaleString()}
                  </span>
                  {/* Diff selection buttons */}
                  {versions.length >= 2 && (
                    <>
                      <button
                        onClick={() => handleSelectBase(version.id)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          isBase
                            ? 'bg-amber-200 border-amber-400 text-amber-800'
                            : 'border-gray-200 hover:bg-amber-50 text-gray-500'
                        }`}
                        title="Select as base for comparison"
                      >
                        Base
                      </button>
                      <button
                        onClick={() => handleSelectCompare(version.id)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          isCompare
                            ? 'bg-indigo-200 border-indigo-400 text-indigo-800'
                            : 'border-gray-200 hover:bg-indigo-50 text-gray-500'
                        }`}
                        title="Select as version to compare against"
                      >
                        Compare
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Diff viewer */}
      {showDiff && baseVersion && compareVersion && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Diff: v{baseVersion.versionNumber} → v{compareVersion.versionNumber}
            </h2>
            <button
              onClick={handleCloseDiff}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close diff"
            >
              ✕ Close diff
            </button>
          </div>
          <AssetDiffViewer
            contentA={baseVersion.content}
            contentB={compareVersion.content}
            labelA={`v${baseVersion.versionNumber} (${baseVersion.state})`}
            labelB={`v${compareVersion.versionNumber} (${compareVersion.state})`}
          />
        </div>
      )}
    </div>
  );
}
