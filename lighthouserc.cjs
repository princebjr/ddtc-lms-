// Lighthouse CI on the mobile preset (Lighthouse's default form factor).
// Budgets from docs/RESPONSIVE.md section 15.5; route-specific budgets are added as screens arrive.
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: ['/'],
      // Three runs, asserted on the median (below): one run on a shared CI machine is too noisy,
      // and the median keeps the budget as strict as stated (the multi-run default is the best run).
      numberOfRuns: 3,
      settings: {
        formFactor: 'mobile',
        screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
        throttlingMethod: 'simulate',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.8, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 0.95, aggregationMethod: 'median' }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        // Initial JavaScript for the first route at or below 200 KB (transfer size, gzipped).
        'resource-summary:script:size': ['error', { maxNumericValue: 200 * 1024, aggregationMethod: 'median' }],
        'total-byte-weight': ['warn', { maxNumericValue: 1_000_000, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
};
