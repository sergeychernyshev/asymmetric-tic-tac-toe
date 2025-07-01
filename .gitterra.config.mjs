export default (config) => {
  config.timelapseLookBackPerfRun = 1000;
  config.createTimelapse = false;
  config.minTiles = 1;

  return config;
};
