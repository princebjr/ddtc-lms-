// The dependency audit's exceptions (ADR-031): only a listed advisory is allowed, only until its date; every other
// high or critical advisory fails, and moderate ones do not.
import { describe, expect, it } from 'vitest';
import { failingAdvisories } from '../../scripts/audit.mjs';

const advisory = (/** @type {string} */ id, /** @type {string} */ severity) => ({ url: `https://github.com/advisories/${id}`, severity, title: id, name: 'pkg' });
const report = {
  vulnerabilities: {
    picomatch: { via: [advisory('GHSA-allowed', 'high')] },
    vite: { via: ['picomatch'] },
    lodash: { via: [advisory('GHSA-other', 'critical')] },
    glob: { via: [advisory('GHSA-moderate', 'moderate')] },
  },
};
const exceptions = { 'https://github.com/advisories/GHSA-allowed': { until: '2026-12-17', why: 'test' } };

describe('failingAdvisories', () => {
  it('allows a listed advisory until its date and fails every other high or critical one', () => {
    const failing = failingAdvisories(report, exceptions, '2026-11-17');
    expect(failing.map((a) => a.title)).toEqual(['GHSA-other']);
  });

  it('fails a listed advisory once its date has passed', () => {
    const failing = failingAdvisories(report, exceptions, '2026-12-18');
    expect(failing.map((a) => [a.title, a.expired ?? false])).toEqual([
      ['GHSA-allowed', true],
      ['GHSA-other', false],
    ]);
  });

  it('passes a clean report', () => {
    expect(failingAdvisories({ vulnerabilities: {} }, exceptions, '2026-11-17')).toEqual([]);
  });
});
