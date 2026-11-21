import Button from '../../shared/components/buttons/Button.jsx';
import DataTable from '../../shared/components/tables/DataTable.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import StatSection from './StatSection.jsx';
import useTradeTeammates from './hooks/useTradeTeammates.js';
import { tradeSelection, tradeRows } from './state/trade-teammates.mjs';

function TradeTable({ rows, onPlayer, label }) {
  const prepared = tradeRows(rows);
  const percent = (value) => (value === null ? '—' : `${value.toFixed(1)}%`);
  return (
    <div className="player-profile-table-wrap">
      <table className="player-profile-table" aria-label={label}>
        <DataTable
          pageSize={50}
          rowLabel="teammates"
          headers={['Teammate', 'Chances', 'Attempts', 'Trades', 'Response', 'Success']}
          rows={prepared.map((row) => [
            row.id ? (
              <Button className="trade-player-link" onClick={() => onPlayer(row.id)}>
                {row.name}
              </Button>
            ) : (
              row.name
            ),
            row.opportunities.toLocaleString(),
            row.attempts.toLocaleString(),
            row.trades.toLocaleString(),
            percent(row.response),
            percent(row.success),
          ])}
          sortRows={prepared.map((row) => [
            row.name,
            row.opportunities,
            row.attempts,
            row.trades,
            row.response ?? -1,
            row.success ?? -1,
          ])}
          emptyMessage="No recorded trade opportunities with recurring teammates for these filters."
        />
      </table>
    </div>
  );
}

export default function TradeTeammates({
  playerId,
  matchIds = [],
  side = 'ALL',
  active,
  buy = 'ALL',
  opponentBuy = 'ALL',
  roundResult = 'ALL',
  roundPhase = 'ALL',
  roundCondition = 'ALL',
  onPlayer,
}) {
  const view = useTradeTeammates(
    tradeSelection(playerId, matchIds, side, {
      buy,
      opponent_buy: opponentBuy,
      round_result: roundResult,
      round_phase: roundPhase,
      round_condition: roundCondition,
    }),
    active,
  );
  const note =
    view.status === 'error'
      ? view.error
      : view.status !== 'ready'
        ? 'Loading teammate trades…'
        : '';
  return (
    <div className="trade-teammate-cards">
      {[
        [
          'outgoing',
          '03',
          'Teammates you traded',
          'Your chances and attempts to trade each teammate, and the trades you completed.',
        ],
        [
          'incoming',
          '04',
          'Teammates who traded you',
          'Each teammate’s chances and attempts to trade you, and the trades they completed.',
        ],
      ].map(([direction, number, title, description]) => (
        <StatSection key={direction} number={number} title={title} className="trade-teammate-card">
          <p className="muted">{description}</p>
          <FormMessage error={view.status === 'error'}>{note}</FormMessage>
          {view.status === 'error' && (
            <Button className="button" onClick={view.retry}>
              Retry
            </Button>
          )}
          {view.status === 'ready' && (
            <TradeTable
              key={`${playerId}-${direction}`}
              rows={view.data[direction]}
              onPlayer={onPlayer}
              label={title}
            />
          )}
        </StatSection>
      ))}
      <p className="muted">
        Only teammates with at least 5 shared team matches are shown. Round filters use saved
        per-round trade data. Chances are counted per teammate, so their sum can exceed your unique
        tradeable deaths. Response is attempts ÷ chances; success is trades ÷ attempts.
      </p>
    </div>
  );
}
