/**
 * Shared Prometheus registry for Mnemos SLI/SLO instrumentation.
 *
 * Only the `outcome` label is exposed on public counters to prevent
 * tenant/user identifier leakage through the public /metrics endpoint.
 */

import { Counter, register } from 'prom-client';

export const onboardingTransitionTotal = new Counter({
  name: 'mnemos_onboarding_transition_total',
  help: 'Total number of onboarding state transitions',
  labelNames: ['outcome'],
});

export { register };
