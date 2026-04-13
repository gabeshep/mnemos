import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Entity, AssetDetail } from '../types.ts';
import { CreateAssetModal } from '../components/CreateAssetModal.tsx';

interface AssetsPageProps {
  onSelectAsset: (assetId: string) => void;
}

function stateBadgeClass(state: 'draft' | 'published' | 'archived' | null | undefined): string {
  if (state === 'published') return 'bg-green-100 text-green-800';
  if (state === 'draft') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-600';
}

export function AssetsPage({ onSelectAsset }: AssetsPageProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Load entities on mount
  useEffect(() => {
    setLoading(true);
    api.getEntities()
      .then((ents) => {
        setEntities(ents);
        if (ents.length > 0) {
          setSelectedEntityId(ents[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Load assets when selectedEntityId changes
  useEffect(() => {
    if (!selectedEntityId) return;
    setLoading(true);
    setTypeFilter(null);
    api.getAssets(selectedEntityId)
      .then(setAssets)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedEntityId]);

  function handleAssetCreated(assetId: string) {
    setShowCreateModal(false);
    onSelectAsset(assetId);
  }

  const uniqueTypes = Array.from(new Set(assets.map(a => a.assetType)));
  const filteredAssets = typeFilter ? assets.filter(a => a.assetType === typeFilter) : assets;

  if (loading && entities.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading assets…</div>;
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
        <h1 className="text-2xl font-semibold text-gray-900">Assets</h1>
        {selectedEntityId && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + New Asset
          </button>
        )}
      </div>

      {/* Entity selector */}
      {entities.length > 0 && (
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Entity</label>
          <select
            value={selectedEntityId ?? ''}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Type filter chips */}
      {uniqueTypes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              typeFilter === null
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {uniqueTypes.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type === typeFilter ? null : type)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                typeFilter === type
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Asset grid */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : filteredAssets.length === 0 ? (
        <p className="text-sm text-gray-400">No assets found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredAssets.map((asset) => (
            <button
              key={asset.id}
              onClick={() => onSelectAsset(asset.id)}
              className="text-left bg-white border rounded-xl px-5 py-4 hover:shadow-md hover:border-indigo-300 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-gray-900 leading-snug">{asset.name}</span>
                {asset.latestVersion && (
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${stateBadgeClass(asset.latestVersion.state)}`}
                  >
                    {asset.latestVersion.state}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                  {asset.assetType}
                </span>
                {asset.latestVersion ? (
                  <span className="text-xs text-gray-400">
                    v{asset.latestVersion.versionNumber} · {new Date(asset.latestVersion.createdAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">No versions</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreateModal && selectedEntityId && (
        <CreateAssetModal
          entityId={selectedEntityId}
          onSuccess={handleAssetCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
