import React from 'react';
import type { VersionSummary } from '../types.ts';

interface VersionHistoryPanelProps {
  assetId: string;
  versions: VersionSummary[];
  currentVersionId: string;
  onSelectVersion: (versionId: string) => void;
  onClose: () => void;
}

function stateBadgeClass(state: 'draft' | 'published' | 'archived'): string {
  if (state === 'published') return 'bg-green-100 text-green-800';
  if (state === 'draft') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-600';
}

export function VersionHistoryPanel({
  versions,
  currentVersionId,
  onSelectVersion,
  onClose,
}: VersionHistoryPanelProps) {
  return (
    <>
      {/* Dark overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Version History</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto">
          {versions.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">No versions yet.</p>
          ) : (
            <ul className="divide-y">
              {versions.map((v) => {
                const isCurrent = v.id === currentVersionId;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => onSelectVersion(v.id)}
                      className={`w-full text-left px-5 py-4 transition-colors hover:bg-gray-50 ${
                        isCurrent ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                            isCurrent
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          v{v.versionNumber}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateBadgeClass(v.state)}`}
                        >
                          {v.state}
                        </span>
                        {isCurrent && (
                          <span className="text-xs text-indigo-600 font-medium">current</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(v.createdAt).toLocaleString()}
                      </p>
                      {v.notes && (
                        <p className="text-xs text-gray-600 mt-1 truncate">{v.notes}</p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
