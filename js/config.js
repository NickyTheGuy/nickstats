window.CSStatsConfig = Object.freeze({
  filterIds: Object.freeze([
    "game-select",
    "modes-select",
    "date-select",
    "platforms-select",
    "groups-select",
    "maps-select"
  ]),
  filterNames: Object.freeze({
    "game-select": "game",
    "modes-select": "mode",
    "date-select": "date range",
    "platforms-select": "platform",
    "groups-select": "season",
    "maps-select": "map"
  }),
  scoring: Object.freeze({
    winRateWeight: 0.8,
    ratingWeight: 0.2,
    winRateScale: 10,
    ratingScale: 0.10,
    shrinkage: 10,
    lifterThreshold: 0.25,
    draggerThreshold: -0.25
  })
});
