import React from 'react';

interface AssetDiffViewerProps {
  contentA: string;
  contentB: string;
  labelA?: string;
  labelB?: string;
}

type DiffLine =
  | { type: 'equal'; text: string }
  | { type: 'removed'; text: string }
  | { type: 'added'; text: string };

/**
 * Compute a line-level diff between two strings using a simple LCS-based approach.
 * Returns an array of DiffLine objects describing additions, deletions, and equal lines.
 */
function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'equal', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }
  result.reverse();
  return result;
}

export function AssetDiffViewer({
  contentA,
  contentB,
  labelA = 'Version A',
  labelB = 'Version B',
}: AssetDiffViewerProps) {
  const diffLines = computeLineDiff(contentA, contentB);

  const hasChanges = diffLines.some((l) => l.type !== 'equal');

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="grid grid-cols-2 border-b bg-gray-50 text-sm font-medium text-gray-600">
        <div className="px-4 py-2 border-r">{labelA}</div>
        <div className="px-4 py-2">{labelB}</div>
      </div>

      {!hasChanges && (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          These two versions are identical.
        </div>
      )}

      {hasChanges && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono border-collapse">
            <tbody>
              {diffLines.map((line, idx) => {
                if (line.type === 'equal') {
                  return (
                    <tr key={idx} className="align-top">
                      <td className="px-4 py-0.5 border-r whitespace-pre-wrap text-gray-700 w-1/2">
                        {line.text}
                      </td>
                      <td className="px-4 py-0.5 whitespace-pre-wrap text-gray-700 w-1/2">
                        {line.text}
                      </td>
                    </tr>
                  );
                }
                if (line.type === 'removed') {
                  return (
                    <tr key={idx} className="align-top bg-red-50">
                      <td className="px-4 py-0.5 border-r whitespace-pre-wrap text-red-800 w-1/2">
                        <span className="select-none text-red-400 mr-1">−</span>
                        {line.text}
                      </td>
                      <td className="px-4 py-0.5 w-1/2 bg-gray-50" />
                    </tr>
                  );
                }
                // added
                return (
                  <tr key={idx} className="align-top bg-green-50">
                    <td className="px-4 py-0.5 border-r w-1/2 bg-gray-50" />
                    <td className="px-4 py-0.5 whitespace-pre-wrap text-green-800 w-1/2">
                      <span className="select-none text-green-500 mr-1">+</span>
                      {line.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
