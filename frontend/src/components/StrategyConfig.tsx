import React, { useState, useEffect } from 'react';
import { Settings, Play, Square, RefreshCw, AlertCircle } from 'lucide-react';

interface BotConfig {
  status: 'IDLE' | 'RUNNING' | 'PAUSED';
  strategy: 'RSI' | 'MACD' | 'GRID' | 'AI_AUTO';
  balance: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  tradeSize: number;
  stopLossPct: number;
  takeProfitPct: number;
}

interface StrategyConfigProps {
  config: BotConfig;
  onUpdateConfig: (updated: Partial<BotConfig>) => void;
  onRunBacktest: () => void;
}

export const StrategyConfig: React.FC<StrategyConfigProps> = ({ config, onUpdateConfig, onRunBacktest }) => {
  const [strategy, setStrategy] = useState(config.strategy);
  const [riskLevel, setRiskLevel] = useState(config.riskLevel);
  const [tradeSize, setTradeSize] = useState(config.tradeSize);
  const [stopLoss, setStopLoss] = useState(config.stopLossPct);
  const [takeProfit, setTakeProfit] = useState(config.takeProfitPct);
  const [simBalance, setSimBalance] = useState(config.balance);

  // Sync state if backend updates
  useEffect(() => {
    setStrategy(config.strategy);
    setRiskLevel(config.riskLevel);
    setTradeSize(config.tradeSize);
    setStopLoss(config.stopLossPct);
    setTakeProfit(config.takeProfitPct);
    setSimBalance(config.balance);
  }, [config]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      strategy,
      riskLevel,
      tradeSize: Number(tradeSize),
      stopLossPct: Number(stopLoss),
      takeProfitPct: Number(takeProfit)
    });
  };

  const handleResetBalance = () => {
    onUpdateConfig({ balance: 10000 });
  };

  return (
    <div className="card-panel" style={{ height: '100%' }}>
      <div className="card-header">
        <div className="card-title">
          <Settings size={18} className="text-accent" />
          STRATEGY & SIMULATION ENGINE
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {config.status === 'RUNNING' ? (
            <button
              className="btn btn-danger"
              onClick={() => onUpdateConfig({ status: 'PAUSED' })}
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            >
              <Square size={12} fill="currentColor" />
              DEACTIVATE BOT
            </button>
          ) : (
            <button
              className="btn btn-success"
              onClick={() => onUpdateConfig({ status: 'RUNNING' })}
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            >
              <Play size={12} fill="currentColor" />
              ACTIVATE BOT
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="form-group">
          <label className="form-label">Core Algorithmic Strategy</label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as any)}
            className="form-input"
            style={{ backgroundColor: 'var(--bg-primary)' }}
          >
            <option value="RSI">RSI Oversold / Overbought (Buy &lt; 30, Sell &gt; 70)</option>
            <option value="MACD">MACD Crossover Signal Line Cross (12, 26, 9)</option>
            <option value="GRID">Grid Scalping Order Grid Bounds Range (0.8% Grid)</option>
            <option value="AI_AUTO">AI Multi-Confluence Conjunction Mode</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Risk Profile</label>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value as any)}
              className="form-input"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <option value="LOW">Conservative (Low Leverage)</option>
              <option value="MEDIUM">Balanced (Standard Risk)</option>
              <option value="HIGH">Aggressive (Tight Stops / Heavy Sizes)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Position Trade Size Ratio</label>
            <select
              value={tradeSize}
              onChange={(e) => setTradeSize(Number(e.target.value))}
              className="form-input"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <option value="0.05">5% of simulation balance</option>
              <option value="0.10">10% of simulation balance</option>
              <option value="0.25">25% of simulation balance</option>
              <option value="0.50">50% of simulation balance</option>
              <option value="1.00">100% of simulation balance (All-In)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Stop Loss Target (%)</label>
            <input
              type="number"
              step="0.1"
              value={stopLoss}
              onChange={(e) => setStopLoss(Number(e.target.value))}
              className="form-input"
              min="0.5"
              max="20"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Take Profit Target (%)</label>
            <input
              type="number"
              step="0.1"
              value={takeProfit}
              onChange={(e) => setTakeProfit(Number(e.target.value))}
              className="form-input"
              min="0.5"
              max="50"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
            APPLY SYSTEM CONFIGS
          </button>
          
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRunBacktest}
            style={{ flex: 1, gap: '6px' }}
          >
            <RefreshCw size={14} />
            BACKTEST ON HISTORY
          </button>
        </div>
      </form>

      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={14} className="text-muted" />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Simulated wallet resets automatically.
          </span>
        </div>
        <button
          className="btn btn-secondary"
          onClick={handleResetBalance}
          style={{ padding: '4px 8px', fontSize: '0.7rem' }}
        >
          RESET WALLET BALANCE
        </button>
      </div>
    </div>
  );
};
