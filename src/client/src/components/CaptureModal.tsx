import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Entity, Asset } from '../types.ts';

interface CaptureModalProps {
  sessionId: string;
  content: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'pick-entity' | 'pick-asset' | 'confirm';

export function CaptureModal({ sessionId, content, onClose, onSuccess }: CaptureModalProps) {
  const [step, setStep] = useState<Step>('pick-entity');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editableContent, setEditableContent] = useState(content);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load entities on mount
  useEffect(() => {
    setLoading(true);
    api.getEntities()
      .then(setEntities)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load assets when entity is selected
  useEffect(() => {
    if (!selectedEntity) return;
    setLoading(true);
    setAssets([]);
    api.getAssets(selectedEntity.id)
      .then(setAssets)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedEntity]);

  function handleEntitySelect(entity: Entity) {
    setSelectedEntity(entity);
    setSelectedAsset(null);
    setStep('pick-asset');
  }

  function handleAssetSelect(asset: Asset) {
    setSelectedAsset(asset);
    setStep('confirm');
  }

  async function handleConfirm() {
    if (!selectedAsset) return;
    setLoading(true);
    setError(null);
    try {
      await api.createCapture({
        sessionId,
        targetAssetId: selectedAsset.id,
        content: editableContent,
        notes: notes.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Capture to Asset Library</h2>
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
          <span className={step === 'pick-entity' ? 'font-semibold text-indigo-600' : 'text-gray-400'}>
            1. Entity
          </span>
          <span className="text-gray-300">›</span>
          <span className={step === 'pick-asset' ? 'font-semibold text-indigo-600' : 'text-gray-400'}>
            2. Asset
          </span>
          <span className="text-gray-300">›</span>
          <span className={step === 'confirm' ? 'font-semibold text-indigo-600' : 'text-gray-400'}>
            3. Review & Confirm
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          )}

          {/* Step 1: Pick entity */}
          {!loading && step === 'pick-entity' && (
            <div>
              <p className="text-sm text-gray-600 mb-3">Select the entity this asset belongs to:</p>
              {entities.length === 0 && (
                <p className="text-sm text-gray-400">No entities found.</p>
              )}
              <ul className="divide-y border rounded-lg overflow-hidden">
                {entities.map((entity) => (
                  <li key={entity.id}>
                    <button
                      onClick={() => handleEntitySelect(entity)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
                    >
                      <span className="font-medium text-gray-900">{entity.name}</span>
                      {entity.description && (
                        <span className="ml-2 text-sm text-gray-400">{entity.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Step 2: Pick asset */}
          {!loading && step === 'pick-asset' && (
            <div>
              <button
                onClick={() => setStep('pick-entity')}
                className="mb-3 text-sm text-indigo-600 hover:underline"
              >
                ← Back to entities
              </button>
              <p className="text-sm text-gray-600 mb-3">
                Select the target asset under <strong>{selectedEntity?.name}</strong>:
              </p>
              {assets.length === 0 && (
                <p className="text-sm text-gray-400">No assets found for this entity.</p>
              )}
              <ul className="divide-y border rounded-lg overflow-hidden">
                {assets.map((asset) => (
                  <li key={asset.id}>
                    <button
                      onClick={() => handleAssetSelect(asset)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
                    >
                      <span className="font-medium text-gray-900">{asset.name}</span>
                      <span className="ml-2 text-xs text-gray-400 bg-gray-100 rounded px-1 py-0.5">
                        {asset.assetType}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Step 3: Review & confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('pick-asset')}
                className="text-sm text-indigo-600 hover:underline"
              >
                ← Back to assets
              </button>

              <div className="rounded-lg bg-gray-50 border px-4 py-3 text-sm">
                <p className="text-gray-500">Capturing to:</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {selectedEntity?.name} › {selectedAsset?.name}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                  <span className="ml-1 font-normal text-gray-400">(editable)</span>
                </label>
                <textarea
                  value={editableContent}
                  onChange={(e) => setEditableContent(e.target.value)}
                  rows={12}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Change summary
                  <span className="ml-1 font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Updated ICP to reflect Q2 pivot"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'confirm' && (
          <div className="px-6 py-4 border-t flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !editableContent.trim()}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving…' : 'Capture as Draft'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
