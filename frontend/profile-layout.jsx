import StatSection from './components/StatSection.jsx';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

function ProfileLayout({ prefix }) {
  return <>
    <div id={`${prefix}DetailTabsApp`} />
    <div className="player-profile-view" id={`${prefix}SectionOverview`} role="tabpanel" aria-labelledby={`${prefix}DetailOverviewTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "overview"}}>
      <div className="player-section-grid player-section-grid-thirds">
        <StatSection number="01" title="Record">
          <div className="player-detail-grid player-detail-grid-compact" id={`${prefix}RecordStats`} />
        </StatSection>
        <StatSection number="02" title="Combat output">
          <div className="player-detail-grid" id={`${prefix}CombatOutputStats`} />
        </StatSection>
        <StatSection number="03" title="Damage and deaths">
          <div className="player-detail-grid" id={`${prefix}CombatCostStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view player-matches-view" id={`${prefix}SectionMatches`} role="tabpanel" aria-labelledby={`${prefix}DetailMatchesTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "matches"}} hidden>
      {prefix === "player" && (<div className="stats-toolbar player-history-date">
        <div className="date-range-filter" id={`${prefix}HistoryDateFilter`} role="group" aria-label="Player match history dates" />
        <div className="stats-filter manual-filter-control" id={`${prefix}HistoryManualFilter`} hidden />
        <span id={`${prefix}HistoryResetFiltersApp`} style={{ display: "contents" }} />
      </div>)}
      {prefix === "player" && (<div className="player-history-view">
        <div id={`${prefix}HistoryViewFilter`} className="react-segmented-filter" />
        <small id={`${prefix}SessionsHelp`} hidden>A new session starts after a 2-hour gap between match starts. Undated games are shown separately.</small>
      </div>)}
      <div id={`${prefix}MatchesStatusApp`} style={{ display: "contents" }} />
      <div className="match-list" id={`${prefix}MatchesList`} />
      <div id={`${prefix}MatchesPaginationApp`} style={{ display: "contents" }} />
    </div>
    <div className="player-profile-view" id={`${prefix}SectionUtility`} role="tabpanel" aria-labelledby={`${prefix}DetailUtilityTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "utility"}} hidden>
      <div className="player-section-grid">
        <StatSection number="01" title="Damage">
          <div className="player-detail-grid" id={`${prefix}UtilityDamageStats`} />
        </StatSection>
        <StatSection number="02" title="Grenades thrown">
          <div className="player-detail-grid" id={`${prefix}UtilityThrownStats`} />
        </StatSection>
        <StatSection number="03" title="Flashes">
          <div className="player-detail-grid" id={`${prefix}FlashStats`} />
        </StatSection>
        <StatSection number="04" title="Assisted kills">
          <div className="player-detail-grid" id={`${prefix}AssistStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionTrades`} role="tabpanel" aria-labelledby={`${prefix}DetailTradesTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "trades"}} hidden>
      <div className="player-section-grid">
        <StatSection number="01" title="Trading teammates">
          <div className="player-detail-grid" id={`${prefix}TradeAttackStats`} />
        </StatSection>
        <StatSection number="02" title="Being traded">
          <div className="player-detail-grid" id={`${prefix}TradeDeathStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionOpenings`} role="tabpanel" aria-labelledby={`${prefix}DetailOpeningsTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "openings"}} hidden>
      <div className="player-section-grid">
        <StatSection number="01" title="Opening results">
          <div className="player-detail-grid" id={`${prefix}OpeningOutcomeStats`} />
        </StatSection>
        <StatSection number="02" title="Help on opening kills">
          <div className="player-detail-grid" id={`${prefix}OpeningSupportReceivedStats`} />
        </StatSection>
        <StatSection number="03" title="Opening assists created">
          <div className="player-detail-grid" id={`${prefix}OpeningSupportGivenStats`} />
        </StatSection>
        <StatSection number="04" title="Response after an opening death">
          <div className="player-detail-grid" id={`${prefix}OpeningTradeStats`} />
        </StatSection>
        <StatSection number="05" title="Flash sources on opening kills">
          <div className="player-detail-grid" id={`${prefix}OpeningKillBlindStats`} />
        </StatSection>
        <StatSection number="06" title="Flash sources on opening deaths">
          <div className="player-detail-grid" id={`${prefix}OpeningDeathBlindStats`} />
        </StatSection>
        <StatSection number="07" title="Help on enemy opening kills">
          <div className="player-detail-grid" id={`${prefix}OpeningEnemySupportStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionInitiation`} role="tabpanel" aria-labelledby={`${prefix}DetailInitiationTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "initiation"}} hidden>
      <StatSection number="01" title="Initiations">
        <div className="player-detail-grid" id={`${prefix}InitiationContactStats`} />
      </StatSection>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionContext`} role="tabpanel" aria-labelledby={`${prefix}DetailContextTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "context"}} hidden>
      <p className="player-context-note"><strong>Paul Kill/Death:</strong> the victim had a grenade or knife out at death or within the preceding 1.4 seconds.</p>
      <div className="player-section-grid">
        <StatSection number="01" title="Visibility and cover on kills">
          <div className="player-metric-list" id={`${prefix}KillVisibilityStats`} />
        </StatSection>
        <StatSection number="02" title="Visibility and cover on deaths">
          <div className="player-metric-list" id={`${prefix}DeathVisibilityStats`} />
        </StatSection>
        <StatSection number="03" title="Catching enemies unready">
          <div className="player-metric-list" id={`${prefix}KillReadinessStats`} />
        </StatSection>
        <StatSection number="04" title="Being caught unready">
          <div className="player-metric-list" id={`${prefix}DeathReadinessStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionRounds`} role="tabpanel" aria-labelledby={`${prefix}DetailRoundsTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "rounds"}} hidden>
      <div className="player-round-sections">
        <StatSection number="01" title="Clutch performance" className="player-count-section">
          <div className="player-count-strip player-clutch-strip" id={`${prefix}ClutchStats`} />
        </StatSection>
        <StatSection number="02" title="Expected Clutch Value">
          <div className="player-detail-grid clutch-economics-impact" id={`${prefix}ClutchEconomicsStats`} />
        </StatSection>
        <StatSection number="02" title="Multikill rounds" className="player-count-section">
          <div className="player-count-strip player-multikill-strip" id={`${prefix}MultikillStats`} />
        </StatSection>
        <StatSection number="03" title="True multi-kill chains" className="player-count-section">
          <div className="player-count-strip" id={`${prefix}TrueMultikillStats`} />
        </StatSection>
        <StatSection number="04" title="Objectives" className="player-count-section">
          <div className="player-count-strip" id={`${prefix}ObjectiveStats`} />
        </StatSection>
        <StatSection number="05" title="Economy results" className="player-count-section">
          <div className="player-count-strip player-economy-strip" id={`${prefix}EconomyStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionRoundState`} role="tabpanel" aria-labelledby={`${prefix}DetailRoundStateTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "roundState"}} hidden>
      <p className="player-round-state-note"><strong>Clawback:</strong> a kill while outnumbered. <strong>Bozo:</strong> a death while the player’s team had the advantage. <strong>Cleanup:</strong> eliminating the final opponent with at least three teammates still alive.</p>
      <div className="player-section-grid">
        <StatSection number="01" title="Kills by man count">
          <div className="player-detail-grid" id={`${prefix}RoundStateKillStats`} />
        </StatSection>
        <StatSection number="02" title="Deaths by man count">
          <div className="player-detail-grid" id={`${prefix}RoundStateDeathStats`} />
        </StatSection>
      </div>
      <div className="player-round-sections player-round-state-sections">
        <StatSection number="03" title="Kill stage" className="player-count-section">
          <div className="player-count-strip" id={`${prefix}KillStageStats`} />
        </StatSection>
        <StatSection number="04" title="Event timing" className="player-count-section">
          <div className="player-detail-grid" id={`${prefix}TimingAverageStats`} />
          <div className="player-count-strip player-timing-strip" id={`${prefix}PhaseStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionMovement`} role="tabpanel" aria-labelledby={`${prefix}DetailMovementTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "movement"}} hidden>
      <p className="player-movement-note">Moving means above 1 unit per second. Running means above 34% of the held weapon’s maximum movement speed and is a subset of moving.</p>
      <div className="player-section-grid">
        <StatSection number="01" title="Player speed on kills">
          <div className="player-detail-grid" id={`${prefix}KillSpeedStats`} />
        </StatSection>
        <StatSection number="02" title="Enemy speed on deaths">
          <div className="player-detail-grid" id={`${prefix}DeathSpeedStats`} />
        </StatSection>
        <StatSection number="03" title="Player movement on kills">
          <div className="player-metric-list" id={`${prefix}MovementStateStats`} />
        </StatSection>
        <StatSection number="04" title="Enemy movement on deaths">
          <div className="player-metric-list" id={`${prefix}DeathMovementStateStats`} />
        </StatSection>
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionWeapons`} role="tabpanel" aria-labelledby={`${prefix}DetailWeaponsTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "weapons"}} hidden>
      <p className="player-movement-note">Moving means above 1 unit per second. Running means above 34% of the held weapon’s maximum movement speed and is a subset of moving.</p>
      <div className="player-profile-table-wrap">
        <table className="player-profile-table" id={`${prefix}WeaponsTable`} />
      </div>
    </div>
    <div className="player-profile-view" id={`${prefix}SectionMaps`} role="tabpanel" aria-labelledby={`${prefix}DetailMapsTab`} {...{[prefix === "player" ? "data-player-profile-view" : "data-combo-profile-panel"]: "maps"}} hidden>
      <div className="player-profile-table-wrap">
        <table className="player-profile-table" id={`${prefix}MapsTable`} />
      </div>
    </div>
  </>;
}

function GraphLayout({ prefix }) {
  return <>
    <section className="graph-player-picker">
      <div>
        <strong>Players</strong>
        <span id={`${prefix}GraphPlayerStatusApp`} style={{ display: "contents" }} />
      </div>
      <div className="graph-player-choices" id={`${prefix}GraphPlayers`} />
    </section>
    <section className="player-graph-builder">
      <div className="player-graph-controls">
        <div className="graph-axis-controls">
          <div className="graph-stat-controls" id={`${prefix}GraphXAxisControl`} hidden>
            <div id={`${prefix}GraphXPicker`} className="react-metric-picker" />
          </div>
          <div className="graph-stat-controls">
            <div id={`${prefix}GraphPicker`} className="react-metric-picker" />
          </div>
        </div>
        <div id={`${prefix}GraphSettingsApp`} className="react-graph-settings" />
      </div>
      <div id={`${prefix}GraphNoteApp`} className="graph-note-mount" />
    </section>
    <div className="graph-summary" id={`${prefix}GraphSummary`} />
    <div className="player-graph-frame">
      <div id={`${prefix}GraphChartApp`} />
    </div>
    <div className="graph-legend" id={`${prefix}GraphLegend`} />
  </>;
}

window.NickStatsProfileLayoutUI = Object.freeze({
  mount() {
    // Controllers attach their data views after these stable layout mounts exist.
    flushSync(() => {
      for (const prefix of ['player', 'combo']) {
        createRoot(document.getElementById(`${prefix}ProfileBody`)).render(<ProfileLayout prefix={prefix} />);
        createRoot(document.getElementById(`${prefix}Graphs`)).render(<GraphLayout prefix={prefix} />);
      }
    });
  }
});
