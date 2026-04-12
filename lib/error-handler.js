import Anthropic from '@anthropic-ai/sdk';

export class ClaudeApiError extends Error {
  constructor(message, { code, httpStatus, retryable, retryAfter = null }) {
    super(message);
    this.name = 'ClaudeApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

export function fromAnthropicError(err) {
  if (err instanceof Anthropic.RateLimitError) {
    const retryAfterHeader = err.headers?.['retry-after'];
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
    return new ClaudeApiError(err.message, { code: 'rate_limit', httpStatus: 429, retryable: true, retryAfter });
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeApiError(err.message, { code: 'auth_error', httpStatus: 503, retryable: false });
  }
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ClaudeApiError(err.message, { code: 'network_error', httpStatus: 503, retryable: true });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new ClaudeApiError(err.message, { code: 'server_error', httpStatus: 502, retryable: true });
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.UnprocessableEntityError) {
    return new ClaudeApiError(err.message, { code: 'invalid_request', httpStatus: 400, retryable: false });
  }
  return new ClaudeApiError(err.message || 'Unknown Claude API error', { code: 'unknown', httpStatus: 502, retryable: false });
}
