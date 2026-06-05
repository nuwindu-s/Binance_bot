import React, { useState } from 'react';
import { ListFilter, FileText, Activity, Bell } from 'lucide-react';

interface Trade {
  id: string;
  type: string;
  entryPrice: number;
  exitPrice?: number;
  price?: number; // for grid one-sided trades
  amount: number;
  entryTime?: number;
  exitTime?: number;
  timestamp?: number; // for grid
  pnl?: number;
  pnlPct?: number;
  reason?: string;
  notes?: string;
}

interface GridOrder {
  id: string;
  type: 'BUY' | 'SELL';
  price: number;
  status: 'PENDING' | 'FILLED';
  size: number;
}

interface LogEntry {
  timestamp: number;
  message: string;
  type: 'INFO' | 'BUY' | 'SELL' | 'ERROR' | 'SYSTEM';
}

interface MarketAlert {
  id: string;
  timestamp: number;
  type: 'BUY' | 'SELL';
  price: number;
  reason: string;
}

interface OrderHistoryProps {
  trades: Trade[];
  gridOrders: GridOrder[];
  logs: LogEntry[];
  alerts: MarketAlert[];
}

export const OrderHistory: React.FC<OrderHistoryProps> = ({ trades, gridOrders, logs, alerts }) => {
  const [activeTab, setActiveTab] = useState<'TRADES' | 'GRID' | 'LOGS' | 'ALERTS'>('TRADES');

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div className="card-panel" style={{ flex: 1 }}>
      <div className="card-header" style={{ marginBottom: '8px' }}>
        <div className="tabs-container" style={{ borderBottom: 'none', marginBottom: 0 }}>
          <button
            onClick={() => setActiveTab('TRADES')}
            className={`tab-btn ${activeTab === 'TRADES' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ListFilter size={14} />
            Completed Trades ({trades.length})
          </button>
          
          <button
            onClick={() => setActiveTab('GRID')}
            className={`tab-btn ${activeTab === 'GRID' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={14} />
            Active Grid Levels ({gridOrders.filter(o => o.status === 'PENDING').length})
          </button>

          <button
            onClick={() => setActiveTab('ALERTS')}
            className={`tab-btn ${activeTab === 'ALERTS' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Bell size={14} />
            Market Alerts ({alerts.length})
          </button>

          <button
            onClick={() => setActiveTab('LOGS')}
            className={`tab-btn ${activeTab === 'LOGS' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Activity size={14} />
            System Console Logs
          </button>
        </div>
      </div>

      <div style={{ minHeight: '160px', maxHeight: '250px', overflowY: 'auto' }}>
        {activeTab === 'TRADES' && (
          trades.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px 0' }}>
              No completed trades yet. Start the bot to execute simulated trades.
            </div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Trade Time</th>
                  <th>Position</th>
                  <th>Size</th>
                  <th>Entry Price</th>
                  <th>Exit Price</th>
                  <th>Net P&L ($)</th>
                  <th>Return (%)</th>
                  <th>Trigger Reason</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const isProfit = (trade.pnl || 0) >= 0;
                  const tradeTime = trade.exitTime || trade.timestamp || Date.now();
                  
                  return (
                    <tr key={trade.id}>
                      <td>{formatTime(tradeTime)}</td>
                      <td className="text-buy" style={{ fontWeight: 600 }}>LONG</td>
                      <td>{trade.amount} SOL</td>
                      <td>${trade.entryPrice.toFixed(2)}</td>
                      <td>${trade.exitPrice ? trade.exitPrice.toFixed(2) : (trade.price ? trade.price.toFixed(2) : '-')}</td>
                      <td className={isProfit ? 'text-buy' : 'text-sell'} style={{ fontWeight: 600 }}>
                        {trade.pnl !== undefined ? `${isProfit ? '+' : ''}$${trade.pnl.toFixed(2)}` : '-'}
                      </td>
                      <td className={isProfit ? 'text-buy' : 'text-sell'} style={{ fontWeight: 600 }}>
                        {trade.pnlPct !== undefined ? `${isProfit ? '+' : ''}${trade.pnlPct.toFixed(2)}%` : '-'}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{trade.reason || trade.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'GRID' && (
          gridOrders.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px 0' }}>
              No active grid orders. Grid orders are generated automatically when activating the Grid strategy.
            </div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Grid Level ID</th>
                  <th>Order Type</th>
                  <th>Trigger Price</th>
                  <th>Lot Size</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {gridOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td className={order.type === 'BUY' ? 'text-buy' : 'text-sell'} style={{ fontWeight: 600 }}>
                      {order.type}
                    </td>
                    <td>${order.price.toFixed(2)}</td>
                    <td>{order.size} SOL</td>
                    <td>
                      <span className={`badge ${order.status === 'FILLED' ? 'badge-idle' : 'badge-running'}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'ALERTS' && (
          alerts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px 0' }}>
              No market alerts triggered yet. The bot checks confluences automatically on every closed candle.
            </div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Alert Time</th>
                  <th>Signal</th>
                  <th>Reference Price</th>
                  <th>Alert Details</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{formatTime(alert.timestamp)}</td>
                    <td className={alert.type === 'BUY' ? 'text-buy' : 'text-sell'} style={{ fontWeight: 600 }}>
                      {alert.type === 'BUY' ? '🟢 BUY SIGNAL' : '🔴 SELL SIGNAL'}
                    </td>
                    <td>${alert.price.toFixed(2)}</td>
                    <td style={{ color: 'var(--text-primary)' }}>{alert.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'LOGS' && (
          <div className="logs-console" style={{ border: 'none', padding: 0, height: '100%', maxHeight: '230px' }}>
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px 0' }}>
                Console is empty.
              </div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="log-row">
                  <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`log-message log-${log.type}`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
