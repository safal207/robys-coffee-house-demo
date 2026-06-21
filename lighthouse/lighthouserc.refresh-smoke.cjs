module.exports = {
  ci: {
    collect: {
      staticDistDir: ".",
      url: ["http://localhost/refresh.html"],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        chromeFlags: "--headless --no-sandbox --disable-gpu"
      }
    }
  }
};
