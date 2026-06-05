import React from 'react';
import { Wallet, TrendingUp, Briefcase, Clock } from 'lucide-react';

interface Position {
  type: string;
  entryPrice: number;
  amount: number;
  timestamp: number;
  allocatedCapital: number;
}

interface BotState {
  balance: number;
  initialBalance: number;
  position: Position | null;
  trades: { pnl: number }[];
  runTime: number;
  status: string;
  currentPnL: number;
}

interface PerformanceStatsProps {
  botState: BotState;
}

export const PerformanceStats: React.FC<PerformanceStatsProps> = ({ botState }) => {
  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Calculations
  const equity = botState.position 
    ? botState.balance + (botState.position.amount * (botState.position.entryPrice * (1 + botState.currentPnL / 100)))
    : botState.balance;

  const totalReturn = ((equity - botState.initialBalance) / botState.initialBalance) * 100;
  const totalReturnCash = equity - botState.initialBalance;

  const totalTrades = botState.trades.length;
  const wins = botState.trades.filter(t => t.pnl > 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return (
    <div className="metrics-row">
      {/* Simulation Balance Card */}
      <div className="card-panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Paper Portfolio Value
            </span>
            <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: '4px' }}>
              ${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
          </div>
          <div style={{ backgroundColor: 'var(--bg-hover)', padding: '6px', borderRadius: '6px', color: 'var(--color-accent)' }}>
            <Wallet size={16} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', marginTop: '8px', color: 'var(--text-muted)' }}>
          <span>Free Balance:</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            ${botState.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Net Return Card */}
      <div className="card-panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Net Profit / Loss
            </span>
            <h2 
              className={totalReturn >= 0 ? 'text-buy' : 'text-sell'}
              style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: '4px' }}
            >
              {totalReturn >= 0 ? '+' : ''}${totalReturnCash.toFixed(2)} ({totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%)
            </h2>
          </div>
          <div 
            className={totalReturn >= 0 ? 'text-buy' : 'text-sell'}
            style={{ backgroundColor: 'var(--bg-hover)', padding: '6px', borderRadius: '6px' }}
          >
            <TrendingUp size={16} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', marginTop: '8px', color: 'var(--text-muted)' }}>
          <span>Win Rate:</span>
          <span className="text-buy" style={{ fontWeight: 600 }}>
            {winRate.toFixed(1)}%
          </span>
          <span>({wins}W - {totalTrades - wins}L)</span>
        </div>
      </div>

      {/* Active Position Card */}
      <div className="card-panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Position
            </span>
            {botState.position ? (
              <h2 className="text-buy" style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                LONG
                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                  {botState.position.amount} SOL @ ${botState.position.entryPrice.toFixed(2)}
                </span>
              </h2>
            ) : (
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '4px' }}>
                FLAT (No Position)
              </h2>
            )}
          </div>
          <div style={{ backgroundColor: 'var(--bg-hover)', padding: '6px', borderRadius: '6px', color: botState.position ? 'var(--color-buy)' : 'var(--text-muted)' }}>
            <Briefcase size={16} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', marginTop: '8px', color: 'var(--text-muted)' }}>
          <span>Unrealized PnL:</span>
          {botState.position ? (
            <span className={botState.currentPnL >= 0 ? 'text-buy' : 'text-sell'} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {botState.currentPnL >= 0 ? '+' : ''}{botState.currentPnL}%
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)' }}>0.00%</span>
          )}
        </div>
      </div>

      {/* Bot Run Time Card */}
      <div className="card-panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Simulation Status
            </span>
            <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`badge ${botState.status === 'RUNNING' ? 'badge-running' : botState.status === 'PAUSED' ? 'badge-paused' : 'badge-idle'}`}>
                {botState.status}
              </span>
            </h2>
          </div>
          <div style={{ backgroundColor: 'var(--bg-hover)', padding: '6px', borderRadius: '6px', color: 'var(--text-muted)' }}>
            <Clock size={16} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', marginTop: '8px', color: 'var(--text-muted)' }}>
          <span>Uptime:</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {formatTime(botState.runTime)}
          </span>
        </div>
      </div>
    </div>
  );
};
