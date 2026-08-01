const base = require('./lighthouserc.desktop.cjs');
const config = JSON.parse(JSON.stringify(base));

config.ci.collect.url = ['http://localhost/index.html'];
config.ci.collect.numberOfRuns = 7;
config.ci.upload = { target: 'filesystem', outputDir: '.artifacts/lighthouse-repeatability/desktop/upload' };

module.exports = config;
