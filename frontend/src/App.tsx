import React, { useEffect, useState, useRef } from 'react';
import { Activity, Radio, Cpu, RefreshCw, Layers, Bell, Volume2, VolumeX } from 'lucide-react';
import { TradingChart } from './components/TradingChart';
import { AIChatSidebar } from './components/AIChatSidebar';
import { StrategyConfig } from './components/StrategyConfig';
import { PerformanceStats } from './components/PerformanceStats';
import { OrderHistory } from './components/OrderHistory';

interface MarketAlert {
  id: string;
  timestamp: number;
  type: 'BUY' | 'SELL';
  price: number;
  reason: string;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Indicators {
  rsi: (number | null)[];
  macd: { macd: number | null; signal: number | null; hist: number | null }[];
  bb: { upper: number | null; middle: number | null; lower: number | null }[];
  sma20: (number | null)[];
  sma50: (number | null)[];
}

interface Position {
  type: string;
  entryPrice: number;
  amount: number;
  timestamp: number;
  allocatedCapital: number;
}

interface BotState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED';
  strategy: 'RSI' | 'MACD' | 'GRID' | 'AI_AUTO';
  balance: number;
  initialBalance: number;
  position: Position | null;
  trades: any[];
  gridOrders: any[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  tradeSize: number;
  stopLossPct: number;
  takeProfitPct: number;
  runTime: number;
  lastSignal: string;
  logs: any[];
  currentPnL: number;
  whatsappEnabled?: boolean;
  whatsappType?: 'TEXTMEBOT' | 'CUSTOM_WEBHOOK';
  whatsappApiKey?: string;
  whatsappRecipient?: string;
  whatsappWebhookUrl?: string;
}

const isProd = window.location.hostname !== 'localhost';
const API_BASE = isProd ? `${window.location.origin}/api` : 'http://localhost:5001/api';
const WS_URL = isProd 
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}` 
  : 'ws://localhost:5001';

export default function App() {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [indicators, setIndicators] = useState<Indicators>({
    rsi: [],
    macd: [],
    bb: [],
    sma20: [],
    sma50: []
  });
  const [botState, setBotState] = useState<BotState>({
    status: 'IDLE',
    strategy: 'RSI',
    balance: 10000,
    initialBalance: 10000,
    position: null,
    trades: [],
    gridOrders: [],
    riskLevel: 'MEDIUM',
    tradeSize: 0.1,
    stopLossPct: 2.0,
    takeProfitPct: 4.0,
    runTime: 0,
    lastSignal: 'NONE',
    logs: [],
    currentPnL: 0,
    whatsappEnabled: false,
    whatsappType: 'TEXTMEBOT',
    whatsappApiKey: '',
    whatsappRecipient: '',
    whatsappWebhookUrl: ''
  });

  const [isConnected, setIsConnected] = useState(false);
  const [flashTick, setFlashTick] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Notifications alerts state
  const [alerts, setAlerts] = useState<MarketAlert[]>([]);
  const [toasts, setToasts] = useState<MarketAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState(false);

  // Synthetic beep audio cues
  const playAlertSound = (type: 'BUY' | 'SELL') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      if (type === 'BUY') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12); // A4
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (err) {
      console.log('Synth error:', err);
    }
  };

  // HTML5 Desktop alert permission triggers
  const toggleDesktopNotifications = async () => {
    if (desktopAlertsEnabled) {
      setDesktopAlertsEnabled(false);
      return;
    }
    
    if (!('Notification' in window)) {
      alert('This browser does not support desktop push alerts.');
      return;
    }

    if (Notification.permission === 'granted') {
      setDesktopAlertsEnabled(true);
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setDesktopAlertsEnabled(true);
        new Notification('SOLANA AI Trading Bot', {
          body: 'Real-time desktop alerts are active!',
          icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%252310b981" stroke-width="2"%3E%3Cpath d="M22 7h-6l-4 8-4-8H2"/%3E%3C/svg%3E'
        });
      }
    } else {
      alert('Desktop notification permissions are blocked in your browser settings. Please enable them to receive push alerts.');
    }
  };

  const triggerDesktopNotification = (alertItem: MarketAlert) => {
    if (!desktopAlertsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const title = alertItem.type === 'BUY' ? '🟢 SOL BUY ALERT' : '🔴 SOL SELL ALERT';
      new Notification(title, {
        body: `$${alertItem.price.toFixed(2)} - ${alertItem.reason}`,
        tag: alertItem.id
      });
    } catch (err) {
      console.log('Push alert error:', err);
    }
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Connect backend WebSocket for live streaming
  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const connectWS = () => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('Connected to local trading bot socket feed');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'INIT':
          setCandles(data.candles);
          setIndicators(data.indicators);
          setAlerts(data.alerts || []);
          setBotState(data.botState);
          break;

        case 'PRICE_TICK':
          setCandles(data.candles);
          setIndicators(data.indicators);
          setFlashTick(true);
          setTimeout(() => setFlashTick(false), 300);
          break;

        case 'BOT_STATE':
          setBotState(data.botState);
          break;

        case 'LOG':
          setBotState(prev => ({
            ...prev,
            logs: [data.log, ...prev.logs].slice(0, 200)
          }));
          break;

        case 'GRID_STATE':
          setBotState(prev => ({
            ...prev,
            gridOrders: data.gridOrders
          }));
          break;

        case 'MARKET_ALERT':
          const newAlert: MarketAlert = data.alert;
          setAlerts(prev => [newAlert, ...prev].slice(0, 100));
          setToasts(prev => [...prev, newAlert]);
          
          // Dismiss toast after 6s
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== newAlert.id));
          }, 6000);

          if (soundEnabled) {
            playAlertSound(newAlert.type);
          }
          triggerDesktopNotification(newAlert);
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('Socket disconnected. Retrying in 4 seconds...');
      setTimeout(connectWS, 4000);
    };

    ws.onerror = (err) => {
      console.error('Socket error:', err);
    };
  };

  // REST updates to configure the bot
  const handleUpdateConfig = async (updated: Partial<BotState>) => {
    try {
      const res = await fetch(`${API_BASE}/bot/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.success) {
        setBotState(data.botState);
      }
    } catch (err) {
      console.error('Failed to configure bot settings:', err);
    }
  };

  // Run backtesting on historical data
  const handleRunBacktest = async () => {
    try {
      const res = await fetch(`${API_BASE}/bot/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: botState.strategy,
          stopLossPct: botState.stopLossPct,
          takeProfitPct: botState.takeProfitPct
        })
      });
      const data = await res.json();
      
      const logMsg = `📊 BACKTEST RESULT: Strategy [${data.strategy}] | Trades: ${data.tradesCount} | Win Rate: ${data.winRate.toFixed(1)}% | Return: ${data.totalReturn.toFixed(2)}%`;
      
      // Push result direct to logs local display
      setBotState(prev => ({
        ...prev,
        logs: [
          { timestamp: Date.now(), message: logMsg, type: 'SYSTEM' },
          ...prev.logs
        ]
      }));
      
      alert(
        `📈 Offline Backtest Completed!\n\n` +
        `• Strategy: ${data.strategy}\n` +
        `• Total Trades Executed: ${data.tradesCount}\n` +
        `• Win Rate: ${data.winRate.toFixed(1)}%\n` +
        `• Simulated Return: ${data.totalReturn.toFixed(2)}%\n` +
        `• Final Net Balance: $${data.finalBalance.toFixed(2)}`
      );

    } catch (err) {
      console.error('Backtest query failed:', err);
      alert('Failed to complete backtest check. Verify backend server is connected.');
    }
  };

  // Trigger manual WhatsApp alert configuration test
  const handleTestWhatsApp = async (params: {
    whatsappType: 'TEXTMEBOT' | 'CUSTOM_WEBHOOK';
    whatsappApiKey: string;
    whatsappRecipient: string;
    whatsappWebhookUrl: string;
  }) => {
    try {
      const res = await fetch(`${API_BASE}/bot/whatsapp/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (data.success) {
        alert('🟢 Test Message Dispatched! Check your WhatsApp group.');
      } else {
        alert(`❌ Failed to send test: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`❌ Error sending test: ${err.message}`);
    }
  };

  // Send chatbot prompt to analysis server
  const handleSendPrompt = async (text: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text })
    });
    const data = await res.json();
    return data.response;
  };

  // Details for header indicators
  const latestPrice = candles.length > 0 ? candles[candles.length - 1].close : 0.00;
  const prevPrice = candles.length > 1 ? candles[candles.length - 2].close : latestPrice;
  const isTickUp = latestPrice >= prevPrice;

  // Calculate 24h SOL Price change simulation
  const startPrice = candles.length > 0 ? candles[0].close : 0.00;
  const priceChange = latestPrice - startPrice;
  const priceChangePct = startPrice > 0 ? (priceChange / startPrice) * 100 : 0.00;

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="app-header">
        <div className="header-logo">
          <Cpu className="logo-icon animate-pulse" size={24} />
          <h1>SOLANA AI TRADING BOT</h1>
          <span className="badge badge-idle" style={{ fontSize: '0.62rem', letterSpacing: '0.5px' }}>
            V1.0.0 PAPER
          </span>
        </div>

        <div className="header-stats">
          {/* Live Tick Price */}
          <div className="stat-item">
            <span className="stat-label">SOL / USDT</span>
            <span 
              className={`stat-val ${isTickUp ? 'text-buy' : 'text-sell'} ${flashTick ? 'flash-green' : ''}`}
              style={{ fontSize: '1.2rem', fontWeight: 700 }}
            >
              ${latestPrice > 0 ? latestPrice.toFixed(2) : '---.--'}
            </span>
          </div>

          {/* 24h Change */}
          <div className="stat-item">
            <span className="stat-label">Session Change</span>
            <span className={`stat-val ${priceChangePct >= 0 ? 'text-buy' : 'text-sell'}`}>
              {priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
            </span>
          </div>

          {/* Notifications Alerts Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
            <button
              onClick={() => setSoundEnabled(prev => !prev)}
              className="btn btn-secondary"
              style={{ padding: '6px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={soundEnabled ? 'Disable Audio Alert Sound' : 'Enable Audio Alert Sound'}
            >
              {soundEnabled ? <Volume2 size={14} className="text-accent" /> : <VolumeX size={14} className="text-muted" />}
            </button>
            
            <button
              onClick={toggleDesktopNotifications}
              className="btn btn-secondary"
              style={{ padding: '6px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={desktopAlertsEnabled ? 'Disable Desktop Notifications' : 'Enable Desktop Notifications'}
            >
              <Bell size={14} className={desktopAlertsEnabled ? 'text-accent' : 'text-muted'} />
            </button>
          </div>

          {/* Server Connection Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '20px' }}>
            {isConnected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-buy)', fontSize: '0.75rem', fontWeight: 600 }}>
                <Radio className="animate-pulse" size={14} />
                LIVE FEED
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-sell)', fontSize: '0.75rem', fontWeight: 600 }}>
                <Activity size={14} />
                DISCONNECTED
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid Pane */}
      <main className="dashboard-grid">
        <div className="main-content">
          
          {/* Live Portfolios Metrics cards */}
          <PerformanceStats botState={botState} />

          {/* Live Candlestick chart */}
          <div className="card-panel" style={{ flex: 1, minHeight: '380px' }}>
            <div className="card-header" style={{ marginBottom: '8px', borderBottom: 'none', paddingBottom: 0 }}>
              <div className="card-title">
                <Layers size={16} className="text-buy" />
                SOLANA CHART (1M INTERVAL)
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                  Scroll/pinch wheel to Zoom chart
                </span>
              </div>
            </div>
            <TradingChart
              candles={candles}
              indicators={indicators}
              trades={botState.trades}
            />
          </div>

          {/* Lower row: Left strategy list, Right logs & details */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div style={{ flex: '2 1 500px' }}>
              <OrderHistory
                trades={botState.trades}
                gridOrders={botState.gridOrders}
                logs={botState.logs}
                alerts={alerts}
              />
            </div>
            <div style={{ flex: '1 1 300px' }}>
              <StrategyConfig
                config={botState}
                onUpdateConfig={handleUpdateConfig}
                onRunBacktest={handleRunBacktest}
                onTestWhatsApp={handleTestWhatsApp}
              />
            </div>
          </div>

        </div>

        {/* AI Chat Copilot pane */}
        <AIChatSidebar onSendMessage={handleSendPrompt} />
      </main>

      {/* Floating Toast Notification Container */}
      <div style={{ position: 'fixed', top: '80px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 9999, pointerEvents: 'none' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              minWidth: '280px',
              maxWidth: '350px',
              backgroundColor: 'var(--bg-card)',
              borderLeft: `4px solid ${toast.type === 'BUY' ? 'var(--color-buy)' : 'var(--color-sell)'}`,
              borderRight: '1px solid var(--border-color)',
              borderTop: '1px solid var(--border-color)',
              borderBottom: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '12px 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: toast.type === 'BUY' ? 'var(--color-buy)' : 'var(--color-sell)', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.5px' }}>
                <Bell size={12} />
                {toast.type === 'BUY' ? 'BUY ALERT' : 'SELL ALERT'}
              </span>
              <button
                onClick={() => dismissToast(toast.id)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: '1', padding: '0 2px' }}
              >
                &times;
              </button>
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              SOL / USDT @ ${toast.price.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
              {toast.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
