const budgets = require('./budgets.json');
const hard = budgets.mobile;

module.exports = {
  ci: {
    collect: {
      staticDistDir: '.',
      url: [
        'http://localhost/index.html',
        'http://localhost/menu.html'
      ],
      numberOfRuns: 3,
      settings: {
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1474.56,
          uploadThroughputKbps: 675,
          cpuSlowdownMultiplier: 4
        },
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false
        },
        chromeFlags: '--headless --no-sandbox --disable-gpu'
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: hard.performance, aggregationMethod: 'median-run' }],
        'largest-contentful-paint': ['error', { maxNumericValue: hard.lcp, aggregationMethod: 'median' }],
        'total-blocking-time': ['error', { maxNumericValue: hard.tbt, aggregationMethod: 'median' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: hard.cls, aggregationMethod: 'median' }],
        'first-contentful-paint': ['error', { maxNumericValue: hard.fcp, aggregationMethod: 'median' }],
        'speed-index': ['error', { maxNumericValue: hard.speed_index, aggregationMethod: 'median' }]
      }
    },
    upload: { target: 'temporary-public-storage' }
  }
};
