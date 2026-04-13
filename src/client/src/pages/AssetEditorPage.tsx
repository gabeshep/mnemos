import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api.ts';
import type { AssetDetail, AssetVersion, VersionSummary } from '../types.ts';
import { VersionHistoryPanel } from '../components/VersionHistoryPanel.tsx';

interface AssetEditorPageProps {
  assetId: string;
  onBack: () => void;
}

function stateBadgeClass(state: 'draft' | 'published' | 'archived' | null | undefined): string {
  if (state === 'published') return 'bg-green-100 text-green-800';
  if (state === 'draft') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-600';
}

export function AssetEditorPage({ assetId, onBack }: AssetEditorPageProps) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [currentVersion, setCurrentVersion] = useState<AssetVersion | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [demoting, setDemoting] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'publish' | 'demote' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingReadOnly, setViewingReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadVersions() {
    const vers = await api.getAllAssetVersions(assetId);
    setVersions(vers);
    return vers;
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getAsset(assetId), api.getAllAssetVersions(assetId)])
      .then(async ([assetData, vers]) => {
        setAsset(assetData);
        setVersions(vers);
        // Load the latest version content
        if (vers.length > 0) {
          const latest = vers[0]; // ordered by versionNumber DESC
          const fullVersion = await api.getAssetVersion(assetId, latest.id);
          setCurrentVersion(fullVersion);
          setEditableContent(fullVersion.content);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [assetId]);

  async function handleSelectVersion(versionId: string) {
    try {
      const version = await api.getAssetVersion(assetId, versionId);
      setCurrentVersion(version);
      setEditableContent(version.content);
      // If not the latest, view read-only
      const isLatest = versions.length > 0 && versions[0].id === versionId;
      setViewingReadOnly(!isLatest);
      setShowHistory(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load version');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const newVersion = await api.saveAssetVersion(assetId, { content: editableContent });
      const vers = await loadVersions();
      setCurrentVersion(newVersion);
      setViewingReadOnly(false);
      // Check if this new version is the latest
      const isLatest = vers.length > 0 && vers[0].id === newVersion.id;
      if (!isLatest) setViewingReadOnly(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!currentVersion) return;
    setPublishing(true);
    setShowConfirm(null);
    setError(null);
    try {
      const result = await api.publishAssetVersion(assetId, currentVersion.id);
      setCurrentVersion(result.published);
      await loadVersions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }

  async function handleDemote() {
    if (!currentVersion) return;
    setDemoting(true);
    setShowConfirm(null);
    setError(null);
    try {
      const updated = await api.demoteAssetVersion(assetId, currentVersion.id);
      setCurrentVersion(updated);
      await loadVersions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to demote');
    } finally {
      setDemoting(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading asset…</div>;
  }

  if (error && !asset) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-indigo-600 hover:underline mb-1 block"
          >
            ← Back to Assets
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{asset?.name}</h1>
            {currentVersion && (
              <>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateBadgeClass(currentVersion.state)}`}
                >
                  {currentVersion.state}
                </span>
                <span className="text-sm text-gray-400">
                  v{currentVersion.versionNumber}
                </span>
              </>
            )}
          </div>
          {asset && (
            <p className="text-sm text-gray-400 mt-0.5">{asset.assetType}</p>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Read-only banner */}
      {viewingReadOnly && (
        <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          Viewing a historical version (read-only). Switch to the latest version to edit.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex border rounded-lg overflow-hidden">
          <button
            onClick={() => setIsPreview(false)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              !isPreview ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setIsPreview(true)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              isPreview ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Preview
          </button>
        </div>

        <button
          onClick={() => setShowHistory(true)}
          className="px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-gray-50 transition-colors"
        >
          History ({versions.length})
        </button>

        {!viewingReadOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}

        {currentVersion?.state === 'draft' && !viewingReadOnly && (
          <button
            onClick={() => setShowConfirm('publish')}
            disabled={publishing}
            className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        )}

        {currentVersion?.state === 'published' && !viewingReadOnly && (
          <button
            onClick={() => setShowConfirm('demote')}
            disabled={demoting}
            className="px-4 py-1.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {demoting ? 'Demoting…' : 'Demote to Draft'}
          </button>
        )}
      </div>

      {/* Confirm dialogs */}
      {showConfirm === 'publish' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Publish version?</h3>
            <p className="text-sm text-gray-600 mb-5">
              This will publish v{currentVersion?.versionNumber} and archive any currently published version.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm === 'demote' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Demote to draft?</h3>
            <p className="text-sm text-gray-600 mb-5">
              This will move v{currentVersion?.versionNumber} back to draft state.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleDemote}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Demote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor / Preview */}
      {currentVersion ? (
        isPreview ? (
          <div className="bg-white border rounded-xl p-6 min-h-[400px]">
            <div className="prose max-w-none">
              <ReactMarkdown>{editableContent}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <textarea
            value={editableContent}
            onChange={(e) => setEditableContent(e.target.value)}
            readOnly={viewingReadOnly}
            rows={24}
            className="w-full border rounded-xl font-sans text-base leading-relaxed p-6 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none bg-white"
          />
        )
      ) : (
        <div className="py-8 text-center text-sm text-gray-400">No versions yet.</div>
      )}

      {/* Version history panel */}
      {showHistory && (
        <VersionHistoryPanel
          assetId={assetId}
          versions={versions}
          currentVersionId={currentVersion?.id ?? ''}
          onSelectVersion={handleSelectVersion}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
