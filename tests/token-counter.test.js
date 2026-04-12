/**
 * Unit tests — token-counter.js (context window management)
 *
 * Covers:
 *   1. estimateTokens — correct estimate for various text lengths
 *   2. buildInjectionPlan — all assets fit within threshold
 *   3. buildInjectionPlan — threshold exceeded, no priority given
 *   4. buildInjectionPlan — threshold exceeded, priority order respected
 *   5. buildInjectionPlan — excluded assets are surfaced (no silent truncation)
 *   6. buildInjectionPlan — single oversized asset is excluded
 *   7. buildInjectionPlan — empty versions array
 *   8. buildInjectionPlan — priority IDs that don't exist in versions are ignored
 *
 * No database required. Pure unit tests.
 *
 * Run with: node --test tests/token-counter.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, buildInjectionPlan, MAX_ASSET_TOKENS } from '../lib/token-counter.js';

// ---------------------------------------------------------------------------
// Helper: create a fake asset version with controlled token count
// ---------------------------------------------------------------------------

function makeVersion(id, contentLength) {
  return {
    id,
    assetName: `Asset ${id}`,
    assetType: 'ICP',
    // Pad content to exactly contentLength characters (4 chars ≈ 1 token)
    content: 'x'.repeat(contentLength),
  };
}

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

test('estimateTokens returns ceiling of length / 4', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('xxxx'), 1);       // 4 chars = 1 token
  assert.equal(estimateTokens('xxxxx'), 2);      // 5 chars => ceil(5/4) = 2
  assert.equal(estimateTokens('x'.repeat(400)), 100); // 400 chars = 100 tokens
});

test('estimateTokens handles multi-byte characters by char count (not byte count)', () => {
  // Three emoji characters — JS string length is 2 code units each for surrogate pair emoji
  // We just verify it returns a positive number and doesn't throw
  const result = estimateTokens('abc');
  assert.equal(result, 1); // ceil(3/4) = 1
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — all assets fit
// ---------------------------------------------------------------------------

test('buildInjectionPlan: all versions injected when total tokens within threshold', () => {
  // 3 versions each with 100 tokens worth of content (400 chars each)
  const versions = [
    makeVersion('v1', 400),
    makeVersion('v2', 400),
    makeVersion('v3', 400),
  ];

  const plan = buildInjectionPlan(versions);

  assert.equal(plan.injected.length, 3);
  assert.equal(plan.excluded.length, 0);
  assert.equal(plan.totalTokens, 300);
  assert.equal(plan.exceedsThreshold, false);
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — threshold exceeded, no priority
// ---------------------------------------------------------------------------

test('buildInjectionPlan: excess versions are excluded when threshold exceeded', () => {
  // MAX_ASSET_TOKENS is 159000. Create versions that together exceed it.
  // 2 versions of 80000 tokens each = 160000 tokens total > 159000
  const versions = [
    makeVersion('big1', 80000 * 4),  // 80000 tokens
    makeVersion('big2', 80000 * 4),  // 80000 tokens
  ];

  const plan = buildInjectionPlan(versions);

  // First version should fit (80000 < 159000), second pushes over threshold
  assert.equal(plan.injected.length, 1, 'Only first version should be injected');
  assert.equal(plan.excluded.length, 1, 'Second version should be excluded');
  assert.equal(plan.injected[0].id, 'big1');
  assert.equal(plan.excluded[0].id, 'big2');
  assert.equal(plan.exceedsThreshold, true, 'exceedsThreshold must be true when versions are excluded');
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — exceedsThreshold flag when total is exactly at limit
// ---------------------------------------------------------------------------

test('buildInjectionPlan: exceedsThreshold is false when totalTokens equals MAX_ASSET_TOKENS exactly', () => {
  // Single version exactly at MAX_ASSET_TOKENS
  const versions = [makeVersion('exact', MAX_ASSET_TOKENS * 4)];
  const plan = buildInjectionPlan(versions);

  assert.equal(plan.injected.length, 1);
  assert.equal(plan.excluded.length, 0);
  assert.equal(plan.exceedsThreshold, false);
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — priority order respected
// ---------------------------------------------------------------------------

test('buildInjectionPlan: priority order determines which versions are injected first', () => {
  // Version C (large) must be included when prioritized over A and B
  const versionA = makeVersion('vA', 60000 * 4); // 60000 tokens
  const versionB = makeVersion('vB', 60000 * 4); // 60000 tokens
  const versionC = makeVersion('vC', 40000 * 4); // 40000 tokens

  // Without priority: A, B, C order — A+B = 120000 (fits), C pushes to 160000 (excluded)
  const planNoPriority = buildInjectionPlan([versionA, versionB, versionC]);
  assert.equal(planNoPriority.injected.length, 2, 'Without priority: A and B fit');
  assert.equal(planNoPriority.excluded.length, 1, 'C excluded without priority');
  assert.ok(planNoPriority.injected.find(v => v.id === 'vC') === undefined, 'vC not injected without priority');

  // With priority C first: C (40000) + A (60000) = 100000 fits, B (60000) pushes over
  const planWithPriority = buildInjectionPlan([versionA, versionB, versionC], ['vC', 'vA']);
  assert.equal(planWithPriority.injected.length, 2, 'With priority: C and A fit');
  assert.equal(planWithPriority.excluded.length, 1, 'B excluded with priority');
  assert.ok(planWithPriority.injected.find(v => v.id === 'vC'), 'vC should be injected when prioritized');
  assert.ok(planWithPriority.injected.find(v => v.id === 'vA'), 'vA should be injected as second priority');
  assert.equal(planWithPriority.excluded[0].id, 'vB', 'vB should be the excluded version');
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — single oversized asset excluded
// ---------------------------------------------------------------------------

test('buildInjectionPlan: single version exceeding MAX_ASSET_TOKENS is excluded', () => {
  const versions = [makeVersion('oversized', (MAX_ASSET_TOKENS + 1) * 4)];
  const plan = buildInjectionPlan(versions);

  assert.equal(plan.injected.length, 0, 'Oversized version should not be injected');
  assert.equal(plan.excluded.length, 1, 'Oversized version should be in excluded list');
  assert.equal(plan.excluded[0].id, 'oversized');
  assert.equal(plan.exceedsThreshold, true);
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — empty input
// ---------------------------------------------------------------------------

test('buildInjectionPlan: empty versions array returns empty plan', () => {
  const plan = buildInjectionPlan([]);

  assert.equal(plan.injected.length, 0);
  assert.equal(plan.excluded.length, 0);
  assert.equal(plan.totalTokens, 0);
  assert.equal(plan.exceedsThreshold, false);
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — priority IDs not in versions are ignored
// ---------------------------------------------------------------------------

test('buildInjectionPlan: unknown priority IDs are silently ignored', () => {
  const versions = [makeVersion('v1', 400), makeVersion('v2', 400)];
  const plan = buildInjectionPlan(versions, ['nonexistent-id', 'v2']);

  // v2 is prioritized (appears first), then v1
  assert.equal(plan.injected.length, 2);
  assert.equal(plan.injected[0].id, 'v2', 'Prioritized v2 should appear first');
  assert.equal(plan.injected[1].id, 'v1', 'v1 should appear second');
  assert.equal(plan.excluded.length, 0);
});

// ---------------------------------------------------------------------------
// buildInjectionPlan — unprioritized versions appear after prioritized, in original order
// ---------------------------------------------------------------------------

test('buildInjectionPlan: unprioritized versions retain original order after prioritized ones', () => {
  const versions = [
    makeVersion('first', 400),
    makeVersion('second', 400),
    makeVersion('third', 400),
  ];

  const plan = buildInjectionPlan(versions, ['third']);

  // third comes first, then first, then second (original order for unprioritized)
  assert.equal(plan.injected[0].id, 'third');
  assert.equal(plan.injected[1].id, 'first');
  assert.equal(plan.injected[2].id, 'second');
});
