const CONTEXT_WINDOW = 200_000;
const THRESHOLD_RATIO = 0.8;
const SYSTEM_PROMPT_OVERHEAD = 500;
export const MAX_ASSET_TOKENS = 159000; // Math.floor(CONTEXT_WINDOW * THRESHOLD_RATIO) - SYSTEM_PROMPT_OVERHEAD, conservatively rounded

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Given versions array and optional priority order, returns injection plan.
 * @param {Array<{id, content, assetName, assetType}>} versions
 * @param {string[]|undefined} priorityOrder - ordered array of version IDs
 * @returns {{ injected: Array, excluded: Array, totalTokens: number, exceedsThreshold: boolean }}
 */
export function buildInjectionPlan(versions, priorityOrder) {
  // Build a map for quick lookup
  const versionMap = new Map(versions.map(v => [v.id, v]));

  // Build ordered list: prioritized first, then unprioritized in original order
  let orderedVersions;
  if (priorityOrder && priorityOrder.length > 0) {
    const prioritySet = new Set(priorityOrder);
    const prioritized = priorityOrder.map(id => versionMap.get(id)).filter(Boolean);
    const unprioritized = versions.filter(v => !prioritySet.has(v.id));
    orderedVersions = [...prioritized, ...unprioritized];
  } else {
    orderedVersions = [...versions];
  }

  const injected = [];
  const excluded = [];
  let totalTokens = 0;

  for (const version of orderedVersions) {
    const tokens = estimateTokens(version.content);
    if (totalTokens + tokens <= MAX_ASSET_TOKENS) {
      injected.push(version);
      totalTokens += tokens;
    } else {
      excluded.push(version);
    }
  }

  return {
    injected,
    excluded,
    totalTokens,
    exceedsThreshold: totalTokens > MAX_ASSET_TOKENS || excluded.length > 0
  };
}
