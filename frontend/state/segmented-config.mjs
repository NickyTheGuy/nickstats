// Choice lists are shared between controls with the same labels and semantics.
const matchSideChoices = [["ALL", "ALL"], ["CT", "CT"], ["T", "T"]];
const matchRoundResultChoices = [["ALL", "ALL"], ["win", "Won"], ["loss", "Lost"]];
const phaseChoices = [["ALL", "All"], ["REGULATION", "Regulation"], ["OVERTIME", "Overtime"]];
const matchBuyChoices = [["ALL", "ALL"], ["full", "Full"], ["force", "Force"], ["eco", "Eco"], ["hero", "Hero", {"title": "Only the player holding the lone rifle or AWP"}], ["pistol", "Pistol"]];
const matchEnemyBuyChoices = [["ALL", "ALL"], ["full", "Full"], ["force", "Force"], ["eco", "Eco"], ["pistol", "Pistol"]];
const lineupChoices = [["without", "Without"], ["with", "With"]];
const resultChoices = [["ALL", "All"], ["w", "Wins"], ["l", "Losses"]];
const sideChoices = [["ALL", "All"], ["T", "T"], ["CT", "CT"]];
const roundResultChoices = [["ALL", "All"], ["win", "Won"], ["loss", "Lost"]];
const buyChoices = [["ALL", "All"], ["full", "Full"], ["force", "Force"], ["eco", "Eco"], ["hero", "Hero", {"aria-label": "Hero: player holding the lone rifle or AWP"}], ["pistol", "Pistol"]];
const enemyBuyChoices = [["ALL", "All"], ["full", "Full"], ["force", "Force"], ["eco", "Eco"], ["pistol", "Pistol"]];
const historyChoices = [["matches", "Matches"], ["sessions", "Sessions"]];

export const segmentedFilters = {
  demoSideFilter: { options: matchSideChoices, label: "Player side", attribute: "data-demo-side", className: "demo-side-buttons", buttonClassName: "demo-side-button", initial: "ALL" },
  demoRoundResultFilter: { options: matchRoundResultChoices, label: "Round result", attribute: "data-demo-round-result", className: "demo-side-buttons", buttonClassName: "demo-side-button", initial: "ALL" },
  demoRoundPhaseFilter: { options: phaseChoices, label: "Match round phase", attribute: "data-demo-round-phase", className: "demo-side-buttons", buttonClassName: "demo-side-button", initial: "ALL" },
  demoBuyFilter: { options: matchBuyChoices, label: "Match own buy", attribute: "data-demo-buy", className: "demo-side-buttons", buttonClassName: "demo-side-button", initial: "ALL" },
  demoEnemyBuyFilter: { options: matchEnemyBuyChoices, label: "Match enemy buy", attribute: "data-demo-enemy-buy", className: "demo-side-buttons", buttonClassName: "demo-side-button", initial: "ALL" },
  comboConditionFilter: { options: lineupChoices, label: "Lineup condition", attribute: "data-combo-condition", className: "side-toggle combo-condition-toggle", initial: "without" },
  comboResultFilter: { options: resultChoices, label: "Profile match result", attribute: "data-combo-result", className: "side-toggle", initial: "ALL" },
  groupSideFilter: { options: sideChoices, label: "Profile side", attribute: "data-group-side", className: "side-toggle", initial: "ALL" },
  groupRoundResultFilter: { options: roundResultChoices, label: "Profile round result", attribute: "data-group-round-result", className: "side-toggle", initial: "ALL" },
  groupRoundPhaseFilter: { options: phaseChoices, label: "Group round phase", attribute: "data-group-round-phase", className: "side-toggle", initial: "ALL" },
  groupBuyFilter: { options: buyChoices, label: "Profile own buy", attribute: "data-group-buy", className: "side-toggle", initial: "ALL" },
  groupEnemyBuyFilter: { options: enemyBuyChoices, label: "Profile enemy buy", attribute: "data-group-enemy-buy", className: "side-toggle", initial: "ALL" },
  playerResultFilter: { options: resultChoices, label: "Player match result", attribute: "data-player-result", className: "side-toggle", initial: "ALL" },
  playerSideFilter: { options: sideChoices, label: "Player side", attribute: "data-player-side", className: "side-toggle", initial: "ALL" },
  playerRoundResultFilter: { options: roundResultChoices, label: "Player round result", attribute: "data-player-round-result", className: "side-toggle", initial: "ALL" },
  playerRoundPhaseFilter: { options: phaseChoices, label: "Player round phase", attribute: "data-player-round-phase", className: "side-toggle", initial: "ALL" },
  playerBuyFilter: { options: buyChoices, label: "Player own buy", attribute: "data-player-buy", className: "side-toggle", initial: "ALL" },
  playerEnemyBuyFilter: { options: enemyBuyChoices, label: "Player enemy buy", attribute: "data-player-enemy-buy", className: "side-toggle", initial: "ALL" },
  playerHistoryViewFilter: { options: historyChoices, label: "Match history view", attribute: "data-player-history-view", className: "side-toggle", initial: "matches" },
};
