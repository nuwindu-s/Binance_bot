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
  whatsappEnabled?: boolean;
  whatsappType?: 'TEXTMEBOT' | 'CUSTOM_WEBHOOK';
  whatsappApiKey?: string;
  whatsappRecipient?: string;
  whatsappWebhookUrl?: string;
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
  const [whatsappEnabled, setWhatsappEnabled] = useState(config.whatsappEnabled || false);
  const [whatsappType, setWhatsappType] = useState(config.whatsappType || 'TEXTMEBOT');
  const [whatsappApiKey, setWhatsappApiKey] = useState(config.whatsappApiKey || '');
  const [whatsappRecipient, setWhatsappRecipient] = useState(config.whatsappRecipient || '');
  const [whatsappWebhookUrl, setWhatsappWebhookUrl] = useState(config.whatsappWebhookUrl || '');

  // Sync state if backend updates
  useEffect(() => {
    setStrategy(config.strategy);
    setRiskLevel(config.riskLevel);
    setTradeSize(config.tradeSize);
    setStopLoss(config.stopLossPct);
    setTakeProfit(config.takeProfitPct);
    setSimBalance(config.balance);
    setWhatsappEnabled(config.whatsappEnabled || false);
    setWhatsappType(config.whatsappType || 'TEXTMEBOT');
    setWhatsappApiKey(config.whatsappApiKey || '');
    setWhatsappRecipient(config.whatsappRecipient || '');
    setWhatsappWebhookUrl(config.whatsappWebhookUrl || '');
  }, [config]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      strategy,
      riskLevel,
      tradeSize: Number(tradeSize),
      stopLossPct: Number(stopLoss),
      takeProfitPct: Number(takeProfit),
      whatsappEnabled,
      whatsappType,
      whatsappApiKey,
      whatsappRecipient,
      whatsappWebhookUrl
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

        {/* WhatsApp Notification Integration */}
        <div style={{ marginTop: '14px', borderTop: '1px dashed var(--border-color)', paddingTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>WhatsApp Alerts Link</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                id="whatsapp-toggle"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--color-accent)' }}
              />
              <label htmlFor="whatsapp-toggle" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {whatsappEnabled ? 'Enabled' : 'Disabled'}
              </label>
            </div>
          </div>

          {whatsappEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>API Gateway Provider</label>
                <select
                  value={whatsappType}
                  onChange={(e) => setWhatsappType(e.target.value as any)}
                  className="form-input"
                  style={{ backgroundColor: 'var(--bg-primary)', fontSize: '0.75rem', padding: '6px', height: '32px' }}
                >
                  <option value="TEXTMEBOT">TextMeBot (Free, Instant API)</option>
                  <option value="CUSTOM_WEBHOOK">Custom HTTP Webhook URL</option>
                </select>
              </div>

              {whatsappType === 'TEXTMEBOT' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.7rem' }}>TextMeBot API Key</label>
                      <input
                        type="text"
                        value={whatsappApiKey}
                        onChange={(e) => setWhatsappApiKey(e.target.value)}
                        placeholder="apikey-xxxx"
                        className="form-input"
                        style={{ fontSize: '0.75rem', padding: '6px', height: '32px' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.7rem' }}>Group ID or Phone</label>
                      <input
                        type="text"
                        value={whatsappRecipient}
                        onChange={(e) => setWhatsappRecipient(e.target.value)}
                        placeholder="e.g. 1203630248239@g.us"
                        className="form-input"
                        style={{ fontSize: '0.75rem', padding: '6px', height: '32px' }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    💡 <strong>Setup Group Alerts</strong>:<br/>
                    1. Invite the TextMeBot number (<code>+34 611 22 85 54</code>) to your WhatsApp Group.<br/>
                    2. Register/activate TextMeBot by sending them a message to get your API Key.<br/>
                    3. Get your Group ID by calling <code>https://api.textmebot.com/getGroupId.php</code> and enter it above to enable free group notifications.
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Custom Webhook URL</label>
                    <input
                      type="text"
                      value={whatsappWebhookUrl}
                      onChange={(e) => setWhatsappWebhookUrl(e.target.value)}
                      placeholder="https://api.example.com/whatsapp-webhook"
                      className="form-input"
                      style={{ fontSize: '0.75rem', padding: '6px', height: '32px' }}
                    />
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    💡 <strong>Integration details</strong>: Server will dispatch HTTP POST JSON alerts containing: <code>{`{ text, timestamp, botState }`}</code> directly to this endpoint.
                  </div>
                </>
              )}
            </div>
          )}
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
