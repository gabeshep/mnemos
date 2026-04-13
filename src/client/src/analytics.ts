export function track(event: string, properties?: Record<string, unknown>): void {
  fetch('/api/telemetry', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, properties }),
  }).catch(() => {});  // intentionally swallow errors
}
