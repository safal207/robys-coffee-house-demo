const base = require('./lighthouserc.mobile.cjs');
const config = JSON.parse(JSON.stringify(base));

config.ci.collect.url = ['http://localhost/index.html?entry=off'];
config.ci.collect.numberOfRuns = 7;
config.ci.upload = { target: 'filesystem', outputDir: '.artifacts/lighthouse-repeatability/mobile/upload' };

module.exports = config;
