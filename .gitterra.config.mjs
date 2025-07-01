export default (config) => {
  config.timelapseLookBackPerfRun = 1000;
  config.createTimelapse = true;
  config.minTiles = 1;

  return config;
};
