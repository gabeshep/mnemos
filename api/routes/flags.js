/**
 * Feature flags route
 *
 * GET /flags — public endpoint returning feature flags derived from environment variables.
 * No authentication required.
 */

export default function flagsHandler(_req, res) {
  res.json({
    onboarding_inline_errors: process.env.MNEMOS_FF_ONBOARDING_INLINE_ERRORS === 'true',
  });
}
