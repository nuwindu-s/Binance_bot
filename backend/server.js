import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5001;
const app = express();

let apiDomain = 'api.binance.com';
let wsDomain = 'stream.binance.com:9443';

app.use(cors());
app.use(express.json());

// Memory store for market data & simulation state
let marketData = {
  candles: [], // Array of { time, open, high, low, close, volume, isClosed }
  indicators: {
    rsi: [],
    macd: [], // { macd, signal, hist }
    bb: [],   // { upper, middle, lower }
    sma20: [],
    sma50: []
  }
};

// Memory list of active alerts
let alertsList = [];

// Simulation Trading State
let botState = {
  status: 'IDLE', // 'IDLE', 'RUNNING', 'PAUSED'
  strategy: 'RSI', // 'RSI', 'MACD', 'GRID', 'AI_AUTO'
  balance: 10000,  // USD/USDT
  initialBalance: 10000,
  position: null,  // null or { type: 'LONG', entryPrice: number, amount: number, timestamp: number }
  trades: [],      // array of completed trades
  gridOrders: [],  // list of active grid lines for GRID strategy
  riskLevel: 'MEDIUM', // 'LOW', 'MEDIUM', 'HIGH'
  tradeSize: 0.1,    // portion of balance per trade (0.1 = 10%) or absolute size in SOL
  stopLossPct: 2.0,   // stop loss percentage
  takeProfitPct: 4.0,  // take profit percentage
  runTime: 0,       // in seconds
  lastSignal: 'NONE',
  logs: [],          // list of system/bot event logs
  whatsappEnabled: false,
  whatsappType: 'TEXTMEBOT',
  whatsappApiKey: '',
  whatsappRecipient: '',
  whatsappWebhookUrl: ''
};

let clients = new Set();
let binanceWS = null;
let runTimeInterval = null;

// Utility logger helper
function logEvent(message, type = 'INFO') {
  const logEntry = {
    timestamp: Date.now(),
    message,
    type // 'INFO', 'BUY', 'SELL', 'ERROR', 'SYSTEM'
  };
  botState.logs.unshift(logEntry);
  if (botState.logs.length > 200) botState.logs.pop();
  console.log(`[${type}] ${new Date().toISOString()}: ${message}`);
  broadcast({ type: 'LOG', log: logEntry });
}

async function sendWhatsAppNotification(message) {
  if (!botState.whatsappEnabled) return;

  try {
    if (botState.whatsappType === 'TEXTMEBOT') {
      if (!botState.whatsappApiKey || !botState.whatsappRecipient) {
        console.error("WhatsApp Error: API Key or Recipient is missing for TextMeBot");
        return;
      }
      const url = `https://api.textmebot.com/send.php?recipient=${encodeURIComponent(botState.whatsappRecipient)}&apikey=${encodeURIComponent(botState.whatsappApiKey)}&text=${encodeURIComponent(message)}`;
      await axios.get(url);
      console.log(`[WhatsApp] Sent notification via TextMeBot to ${botState.whatsappRecipient}`);
    } else if (botState.whatsappType === 'CUSTOM_WEBHOOK') {
      if (!botState.whatsappWebhookUrl) {
        console.error("WhatsApp Error: Webhook URL is missing");
        return;
      }
      await axios.post(botState.whatsappWebhookUrl, {
        text: message,
        timestamp: Date.now(),
        botState: {
          strategy: botState.strategy,
          balance: botState.balance,
          position: botState.position
        }
      });
      console.log(`[WhatsApp] Sent notification via custom webhook to ${botState.whatsappWebhookUrl}`);
    }
  } catch (err) {
    console.error("Failed to send WhatsApp notification:", err.message);
  }
}

// ----------------------------------------------------
// Technical Indicator Calculations (JS native implementations)
// ----------------------------------------------------

function calculateIndicators() {
  const closes = marketData.candles.map(c => Number(c.close));
  if (closes.length === 0) return;

  // 1. SMA 20 & SMA 50
  marketData.indicators.sma20 = calculateSMA(closes, 20);
  marketData.indicators.sma50 = calculateSMA(closes, 50);

  // 2. RSI (14)
  marketData.indicators.rsi = calculateRSI(closes, 14);

  // 3. MACD (12, 26, 9)
  marketData.indicators.macd = calculateMACD(closes, 12, 26, 9);

  // 4. Bollinger Bands (20, 2)
  marketData.indicators.bb = calculateBollingerBands(closes, 20, 2);
}

function calculateSMA(data, period) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val, 0);
      sma.push(Number((sum / period).toFixed(2)));
    }
  }
  return sma;
}

function calculateRSI(data, period = 14) {
  const rsi = [];
  if (data.length <= period) {
    return new Array(data.length).fill(null);
  }

  let gains = 0;
  let losses = 0;

  // First RSI value calculation
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Add nulls for period steps
  for (let i = 0; i < period; i++) {
    rsi.push(null);
  }
  
  const initialRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(Number((100 - 100 / (1 + initialRS)).toFixed(2)));

  // Wilder's smoothing technique for the remaining data
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    let gain = 0;
    let loss = 0;
    if (diff > 0) gain = diff;
    else loss = -diff;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
  }

  return rsi;
}

function calculateMACD(data, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const macdValues = [];
  
  if (data.length < longPeriod) {
    return new Array(data.length).fill({ macd: null, signal: null, hist: null });
  }

  const emaShort = calculateEMA(data, shortPeriod);
  const emaLong = calculateEMA(data, longPeriod);

  const rawMACD = [];
  for (let i = 0; i < data.length; i++) {
    if (emaShort[i] === null || emaLong[i] === null) {
      rawMACD.push(null);
    } else {
      rawMACD.push(emaShort[i] - emaLong[i]);
    }
  }

  // Calculate EMA of the raw MACD line (Signal line)
  const emaSignal = calculateEMA(rawMACD.map(v => v === null ? 0 : v), signalPeriod);

  for (let i = 0; i < data.length; i++) {
    if (rawMACD[i] === null || i < (longPeriod + signalPeriod - 2)) {
      macdValues.push({ macd: null, signal: null, hist: null });
    } else {
      const macdVal = Number(rawMACD[i].toFixed(4));
      const sigVal = Number(emaSignal[i].toFixed(4));
      const histVal = Number((macdVal - sigVal).toFixed(4));
      macdValues.push({ macd: macdVal, signal: sigVal, hist: histVal });
    }
  }

  return macdValues;
}

function calculateEMA(data, period) {
  const ema = [];
  const k = 2 / (period + 1);
  
  let sum = 0;
  let count = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (data[i] === null) {
      ema.push(null);
      continue;
    }
    
    count++;
    if (count < period) {
      sum += data[i];
      ema.push(null);
    } else if (count === period) {
      sum += data[i];
      const initialSMA = sum / period;
      ema.push(initialSMA);
    } else {
      const prevEMA = ema[i - 1];
      const val = data[i] * k + prevEMA * (1 - k);
      ema.push(val);
    }
  }
  return ema;
}

function calculateBollingerBands(data, period = 20, multiplier = 2) {
  const bb = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      bb.push({ upper: null, middle: null, lower: null });
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((acc, val) => acc + val, 0) / period;
      
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      
      const upper = Number((mean + multiplier * stdDev).toFixed(2));
      const middle = Number(mean.toFixed(2));
      const lower = Number((mean - multiplier * stdDev).toFixed(2));
      
      bb.push({ upper, middle, lower });
    }
  }
  return bb;
}

// ----------------------------------------------------
// Simulated bot actions / Strategy engine
// ----------------------------------------------------

function handleTradingSimulation(price, timestamp) {
  if (botState.status !== 'RUNNING') return;

  const len = marketData.candles.length;
  if (len < 50) return; // Wait for historical indicators to be stable

  const currentRsi = marketData.indicators.rsi[len - 1];
  const prevRsi = marketData.indicators.rsi[len - 2];
  
  const currentMacd = marketData.indicators.macd[len - 1];
  const prevMacd = marketData.indicators.macd[len - 2];

  const currentSma20 = marketData.indicators.sma20[len - 1];
  const currentSma50 = marketData.indicators.sma50[len - 1];
  
  const currentBB = marketData.indicators.bb[len - 1];

  // Safety checks
  if (currentRsi === null || !currentMacd || !currentBB) return;

  // Manage Position Risk (Stop Loss and Take Profit check)
  if (botState.position) {
    const entryPrice = botState.position.entryPrice;
    const currentPrice = price;
    const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    // Stop Loss Check
    if (pnlPct <= -botState.stopLossPct) {
      executeSell(currentPrice, `STOP LOSS Triggered: ${pnlPct.toFixed(2)}%`, timestamp);
      return;
    }

    // Take Profit Check
    if (pnlPct >= botState.takeProfitPct) {
      executeSell(currentPrice, `TAKE PROFIT Triggered: +${pnlPct.toFixed(2)}%`, timestamp);
      return;
    }
  }

  // Strategy Decisions
  if (botState.strategy === 'RSI') {
    // RSI Oversold - BUY
    if (currentRsi < 30 && (!botState.position)) {
      executeBuy(price, `RSI oversold indicator trigger (RSI: ${currentRsi.toFixed(1)})`, timestamp);
    }
    // RSI Overbought - SELL
    else if (currentRsi > 70 && botState.position) {
      executeSell(price, `RSI overbought indicator trigger (RSI: ${currentRsi.toFixed(1)})`, timestamp);
    }
  }
  
  else if (botState.strategy === 'MACD') {
    // MACD Cross Above Signal (Bullish) - BUY
    const bullishCross = prevMacd.macd <= prevMacd.signal && currentMacd.macd > currentMacd.signal;
    // MACD Cross Below Signal (Bearish) - SELL
    const bearishCross = prevMacd.macd >= prevMacd.signal && currentMacd.macd < currentMacd.signal;

    if (bullishCross && (!botState.position)) {
      executeBuy(price, `MACD Bullish Cross (MACD: ${currentMacd.macd.toFixed(3)} Line crossed Signal: ${currentMacd.signal.toFixed(3)})`, timestamp);
    } else if (bearishCross && botState.position) {
      executeSell(price, `MACD Bearish Cross (MACD: ${currentMacd.macd.toFixed(3)} Line crossed Signal: ${currentMacd.signal.toFixed(3)})`, timestamp);
    }
  }

  else if (botState.strategy === 'GRID') {
    // Run Grid Trading simulation
    handleGridTrading(price, timestamp);
  }

  else if (botState.strategy === 'AI_AUTO') {
    // AI automatic strategy (looks at combination of metrics for optimal execution)
    const isBullishSma = currentSma20 && currentSma50 && currentSma20 > currentSma50;
    const isOversold = currentRsi < 35;
    const isOverbought = currentRsi > 65;
    const isLowerBB = price <= currentBB.lower;
    const isUpperBB = price >= currentBB.upper;
    const isMacdBullish = currentMacd.hist > 0;

    // Confluence BUY trigger
    if (!botState.position) {
      if ((isOversold && isLowerBB) || (isBullishSma && isMacdBullish && currentRsi < 55)) {
        executeBuy(price, `AI Confluence Auto-Buy (RSI: ${currentRsi.toFixed(1)}, Price below Bollinger Lower Band or SMA bullish trend)`, timestamp);
      }
    } 
    // Confluence SELL trigger
    else {
      if (isOverbought || isUpperBB || (!isMacdBullish && price < currentSma20)) {
        executeSell(price, `AI Confluence Auto-Sell (RSI: ${currentRsi.toFixed(1)} overbought or Price crossed below SMA20 support)`, timestamp);
      }
    }
  }
}

// Alert verification checking on candle close
function triggerCandleClosedAlerts(candle) {
  const len = marketData.candles.length;
  if (len < 50) return;

  const rsi = marketData.indicators.rsi[len - 1];
  const prevRsi = marketData.indicators.rsi[len - 2];
  const macd = marketData.indicators.macd[len - 1];
  const prevMacd = marketData.indicators.macd[len - 2];
  const bb = marketData.indicators.bb[len - 1];
  const price = Number(candle.close);
  const trend = marketData.indicators.sma20[len - 1] > marketData.indicators.sma50[len - 1] ? 'Bullish Crossover' : 'Bearish Crossover';

  if (rsi === null || !macd || !bb) return;

  let alertType = null;
  let alertReason = "";

  // 1. RSI Oversold / Overbought crossovers
  if (prevRsi !== null && prevRsi >= 30 && rsi < 30) {
    alertType = 'BUY';
    alertReason = `RSI crossed below 30 into oversold region (${rsi.toFixed(1)})`;
  } else if (prevRsi !== null && prevRsi <= 70 && rsi > 70) {
    alertType = 'SELL';
    alertReason = `RSI crossed above 70 into overbought region (${rsi.toFixed(1)})`;
  }
  // 2. Bollinger Band support/resistance touches
  else if (price <= bb.lower) {
    alertType = 'BUY';
    alertReason = `Price checked lower Bollinger Band support boundary at $${price.toFixed(2)}`;
  } else if (price >= bb.upper) {
    alertType = 'SELL';
    alertReason = `Price checked upper Bollinger Band resistance boundary at $${price.toFixed(2)}`;
  }
  // 3. MACD crosses
  else if (prevMacd && prevMacd.macd <= prevMacd.signal && macd.macd > macd.signal) {
    alertType = 'BUY';
    alertReason = `MACD Bullish crossover formed (MACD: ${macd.macd.toFixed(3)})`;
  } else if (prevMacd && prevMacd.macd >= prevMacd.signal && macd.macd < macd.signal) {
    alertType = 'SELL';
    alertReason = `MACD Bearish crossover formed (MACD: ${macd.macd.toFixed(3)})`;
  }

  if (alertType) {
    const alert = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: Date.now(),
      type: alertType,
      price,
      reason: alertReason
    };
    alertsList.unshift(alert);
    if (alertsList.length > 100) alertsList.pop();

    logEvent(`MARKET ALERT: [${alertType}] at $${price.toFixed(2)} - ${alertReason}`, 'SYSTEM');
    broadcast({ type: 'MARKET_ALERT', alert });
    sendWhatsAppNotification(`🚨 SOLANA MARKET ALERT: [${alertType}] at $${price.toFixed(2)}\n\nReason: ${alertReason}`);
  }
}

// Implement Grid Trading Logic
function setupGridOrders(basePrice) {
  botState.gridOrders = [];
  const gridCount = 6;
  const gridIntervalPct = 0.8; // Grid lines every 0.8%

  logEvent(`Setting up ${gridCount} Grid Trading levels around SOL $${basePrice.toFixed(2)}`, 'SYSTEM');

  for (let i = 1; i <= gridCount / 2; i++) {
    // Buy limits below current price
    const buyPrice = basePrice * (1 - (gridIntervalPct * i) / 100);
    botState.gridOrders.push({
      id: `GRID_BUY_${i}`,
      type: 'BUY',
      price: Number(buyPrice.toFixed(3)),
      status: 'PENDING',
      size: 1.0 // 1 SOL units
    });

    // Sell limits above current price
    const sellPrice = basePrice * (1 + (gridIntervalPct * i) / 100);
    botState.gridOrders.push({
      id: `GRID_SELL_${i}`,
      type: 'SELL',
      price: Number(sellPrice.toFixed(3)),
      status: 'PENDING',
      size: 1.0
    });
  }
  broadcast({ type: 'GRID_STATE', gridOrders: botState.gridOrders });
}

function handleGridTrading(price, timestamp) {
  // If grid orders list is empty, initialize grid around current price
  if (botState.gridOrders.length === 0) {
    setupGridOrders(price);
    return;
  }

  // Iterate orders and check if trigger hit
  for (let order of botState.gridOrders) {
    if (order.status !== 'PENDING') continue;

    if (order.type === 'BUY' && price <= order.price) {
      // Execute simulated Buy
      const cost = order.price * order.size;
      if (botState.balance >= cost) {
        botState.balance -= cost;
        order.status = 'FILLED';
        
        // Record grid trade
        const trade = {
          id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
          type: 'BUY',
          price: order.price,
          amount: order.size,
          timestamp,
          notes: 'Grid Buy Order Executed'
        };
        
        botState.trades.unshift(trade);
        logEvent(`GRID BUY FILLED: 1.0 SOL at $${order.price.toFixed(2)}. Net Balance: $${botState.balance.toFixed(2)}`, 'BUY');
        
        // Re-open grid line on opposite side
        const profitTarget = order.price * 1.008; // 0.8% higher
        order.id = `GRID_SELL_REBORN_${Date.now()}`;
        order.type = 'SELL';
        order.price = Number(profitTarget.toFixed(3));
        order.status = 'PENDING';
        
        logEvent(`New GRID SELL order set at $${order.price.toFixed(2)} to lock profits`, 'SYSTEM');
        broadcastState();
      }
    } 
    else if (order.type === 'SELL' && price >= order.price) {
      // Check if we hold grid-units or just execute
      // (Simplified: sells are allowed to execute, cash out proceeds)
      const proceeds = order.price * order.size;
      botState.balance += proceeds;
      order.status = 'FILLED';

      const trade = {
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
        type: 'SELL',
        price: order.price,
        amount: order.size,
        timestamp,
        notes: 'Grid Sell Order Executed'
      };

      botState.trades.unshift(trade);
      logEvent(`GRID SELL FILLED: 1.0 SOL at $${order.price.toFixed(2)}. Net Balance: $${botState.balance.toFixed(2)}`, 'SELL');

      // Re-open grid line on opposite buy side
      const buyTarget = order.price * 0.992; // 0.8% lower
      order.id = `GRID_BUY_REBORN_${Date.now()}`;
      order.type = 'BUY';
      order.price = Number(buyTarget.toFixed(3));
      order.status = 'PENDING';

      logEvent(`New GRID BUY order set at $${order.price.toFixed(2)} to accumulate low`, 'SYSTEM');
      broadcastState();
    }
  }
}

function executeBuy(price, reason, timestamp) {
  if (botState.position) return; // Already in position

  // Allocate balance depending on risk/tradeSize configuration
  const allocation = botState.balance * botState.tradeSize;
  if (allocation < 10) {
    logEvent(`Buy signal ignored. Insufficient balance: $${botState.balance.toFixed(2)}`, 'ERROR');
    return;
  }

  const amount = Number((allocation / price).toFixed(4));
  botState.balance -= allocation;
  botState.position = {
    type: 'LONG',
    entryPrice: price,
    amount,
    timestamp,
    allocatedCapital: allocation
  };

  logEvent(`BUY SIGNAL: Entered LONG position at $${price.toFixed(2)} (${amount} SOL) | Reason: ${reason}`, 'BUY');
  broadcastState();
  sendWhatsAppNotification(`🟢 BOT BUY SIGNAL: Entered LONG position at $${price.toFixed(2)} (${amount} SOL)\n\nReason: ${reason}`);
}

function executeSell(price, reason, timestamp) {
  if (!botState.position) return; // Nothing to sell

  const entryPrice = botState.position.entryPrice;
  const amount = botState.position.amount;
  const revenue = amount * price;
  const pnl = revenue - botState.position.allocatedCapital;
  const pnlPct = (pnl / botState.position.allocatedCapital) * 100;

  botState.balance += revenue;

  const completedTrade = {
    id: Date.now().toString(),
    type: 'LONG',
    entryPrice,
    exitPrice: price,
    amount,
    entryTime: botState.position.timestamp,
    exitTime: timestamp,
    pnl,
    pnlPct,
    reason
  };

  botState.trades.unshift(completedTrade);
  botState.position = null;

  logEvent(`SELL SIGNAL: Closed LONG at $${price.toFixed(2)} | Net Trade PnL: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%) | Reason: ${reason}`, 'SELL');
  broadcastState();
  sendWhatsAppNotification(`🔴 BOT SELL SIGNAL: Closed LONG at $${price.toFixed(2)}\n\nNet Trade PnL: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)\n\nReason: ${reason}`);
}

// ----------------------------------------------------
// WebSockets connection to client and Binance feed
// ----------------------------------------------------

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastState() {
  broadcast({
    type: 'BOT_STATE',
    botState: {
      ...botState,
      currentPnL: calculateCurrentPnL()
    }
  });
}

function calculateCurrentPnL() {
  if (!botState.position) return 0;
  const lastCandle = marketData.candles[marketData.candles.length - 1];
  if (!lastCandle) return 0;
  const currentPrice = Number(lastCandle.close);
  const entryPrice = botState.position.entryPrice;
  return Number(((currentPrice - entryPrice) / entryPrice * 100).toFixed(2));
}

// Initialize connection with Binance WebSocket API
function initBinanceFeed() {
  if (binanceWS) {
    binanceWS.close();
  }

  logEvent(`Connecting to live Binance Solana Stream at wss://${wsDomain}...`, "SYSTEM");
  
  // Binance Websocket API URL for live 1-minute klines
  binanceWS = new WebSocket(`wss://${wsDomain}/ws/solusdt@kline_1m`);

  binanceWS.on('open', () => {
    logEvent(`Established WebSocket stream from Binance SOL/USDT (${wsDomain})`, "SYSTEM");
  });

  binanceWS.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      const kline = msg.k;
      if (!kline) return;

      const currentCandle = {
        time: kline.t,
        open: Number(kline.o),
        high: Number(kline.h),
        low: Number(kline.l),
        close: Number(kline.c),
        volume: Number(kline.v),
        isClosed: kline.x
      };

      const candles = marketData.candles;
      const len = candles.length;

      if (len > 0 && candles[len - 1].time === currentCandle.time) {
        // Update current candle tick
        candles[len - 1] = currentCandle;
      } else {
        // If the previous candle was not closed explicitly but we got a new one, close it
        if (len > 0) {
          candles[len - 1].isClosed = true;
          triggerCandleClosedAlerts(candles[len - 1]);
        }
        // Push new candle
        candles.push(currentCandle);
        if (candles.length > 200) candles.shift();
      }

      // Re-calculate indicators with the latest candle values
      calculateIndicators();

      // Check trading strategy conditions with latest close price
      handleTradingSimulation(currentCandle.close, currentCandle.time);

      // Broadcast update to all connected React clients
      broadcast({
        type: 'PRICE_TICK',
        candles: marketData.candles,
        indicators: marketData.indicators,
        latestTick: currentCandle
      });
      
      // Periodically update bot runtime stats and trigger position valuations
      broadcastState();

    } catch (err) {
      console.error("Error processing Binance socket message:", err);
    }
  });

  binanceWS.on('close', () => {
    logEvent("Binance WebSocket stream disconnected. Retrying in 5 seconds...", "ERROR");
    setTimeout(initBinanceFeed, 5000);
  });

  binanceWS.on('error', (err) => {
    logEvent("Binance WebSocket stream error: " + err.message, "ERROR");
    if (wsDomain === 'stream.binance.com:9443') {
      logEvent("Switching WebSocket to Binance.US fallback due to connection error...", "WARNING");
      wsDomain = 'stream.binance.us:9443';
      apiDomain = 'api.binance.us';
    }
  });
}

// Fetch historical candles from Binance REST API on startup
async function fetchInitialHistory() {
  try {
    logEvent(`Fetching historical candle data for SOL/USDT from ${apiDomain}...`, "SYSTEM");
    const response = await axios.get(
      `https://${apiDomain}/api/v3/klines?symbol=SOLUSDT&interval=1m&limit=150`
    );

    const candles = response.data.map(item => ({
      time: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      isClosed: true
    }));

    marketData.candles = candles;
    calculateIndicators();
    logEvent(`Loaded ${candles.length} periods of historical candlestick data. Ready for trading.`, "SYSTEM");
  } catch (err) {
    logEvent(`Failed to load historical candles from ${apiDomain}: ${err.message}`, "ERROR");
    if (apiDomain === 'api.binance.com') {
      logEvent("Switching to Binance.US fallback endpoint due to regional/IP block...", "WARNING");
      apiDomain = 'api.binance.us';
      wsDomain = 'stream.binance.us:9443';
      await fetchInitialHistory();
    }
  }
}

// ----------------------------------------------------
// REST API routes
// ----------------------------------------------------

app.get('/api/market/state', (req, res) => {
  res.json({
    candles: marketData.candles,
    indicators: marketData.indicators
  });
});

app.get('/api/market/alerts', (req, res) => {
  res.json(alertsList);
});

app.get('/api/bot/state', (req, res) => {
  res.json({
    ...botState,
    currentPnL: calculateCurrentPnL()
  });
});

app.post('/api/bot/configure', (req, res) => {
  const { 
    strategy, status, balance, stopLossPct, takeProfitPct, tradeSize, riskLevel,
    whatsappEnabled, whatsappType, whatsappApiKey, whatsappRecipient, whatsappWebhookUrl
  } = req.body;

  if (strategy !== undefined) botState.strategy = strategy;
  if (stopLossPct !== undefined) botState.stopLossPct = Number(stopLossPct);
  if (takeProfitPct !== undefined) botState.takeProfitPct = Number(takeProfitPct);
  if (tradeSize !== undefined) botState.tradeSize = Number(tradeSize);
  if (riskLevel !== undefined) botState.riskLevel = riskLevel;

  if (whatsappEnabled !== undefined) botState.whatsappEnabled = !!whatsappEnabled;
  if (whatsappType !== undefined) botState.whatsappType = whatsappType;
  if (whatsappApiKey !== undefined) botState.whatsappApiKey = whatsappApiKey;
  if (whatsappRecipient !== undefined) botState.whatsappRecipient = whatsappRecipient;
  if (whatsappWebhookUrl !== undefined) botState.whatsappWebhookUrl = whatsappWebhookUrl;

  if (balance !== undefined) {
    botState.balance = Number(balance);
    botState.initialBalance = Number(balance);
    botState.position = null;
    botState.trades = [];
    botState.gridOrders = [];
  }

  if (status !== undefined && status !== botState.status) {
    botState.status = status;
    if (status === 'RUNNING') {
      logEvent(`Trading Bot ACTIVATED with ${botState.strategy} strategy`, 'SYSTEM');
      
      // Start runtime counter
      if (!runTimeInterval) {
        runTimeInterval = setInterval(() => {
          if (botState.status === 'RUNNING') {
            botState.runTime++;
          }
        }, 1000);
      }
      
      // Reset grid if strategy switches to grid
      if (botState.strategy === 'GRID') {
        const lastCandle = marketData.candles[marketData.candles.length - 1];
        if (lastCandle) {
          setupGridOrders(Number(lastCandle.close));
        }
      }
    } else {
      logEvent(`Trading Bot DEACTIVATED (State set to: ${status})`, 'SYSTEM');
      if (status === 'IDLE' || status === 'PAUSED') {
        if (runTimeInterval) {
          clearInterval(runTimeInterval);
          runTimeInterval = null;
        }
      }
    }
  }

  broadcastState();
  res.json({ success: true, botState });
});

// Run backtester simulation
app.post('/api/bot/backtest', (req, res) => {
  const { strategy, stopLossPct, takeProfitPct } = req.body;
  const candles = marketData.candles;
  
  if (candles.length < 50) {
    return res.status(400).json({ error: "Insufficient market history for backtest" });
  }

  const sl = Number(stopLossPct) || 2.0;
  const tp = Number(takeProfitPct) || 4.0;

  // Clone candles and calculate offline indicators
  const closes = candles.map(c => Number(c.close));
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes, 12, 26, 9);
  const bb = calculateBollingerBands(closes, 20, 2);

  let tempBalance = 10000;
  let tempPos = null;
  const backtestTrades = [];

  for (let i = 50; i < candles.length; i++) {
    const candle = candles[i];
    const price = Number(candle.close);
    const rsiVal = rsi[i];
    const macdVal = macd[i];
    const prevMacdVal = macd[i - 1];
    const bbVal = bb[i];

    if (tempPos) {
      const entryPrice = tempPos.entryPrice;
      const pnlPct = ((price - entryPrice) / entryPrice) * 100;

      // Stop Loss
      if (pnlPct <= -sl) {
        const rev = tempPos.amount * price;
        tempBalance += rev;
        backtestTrades.push({
          type: 'SELL',
          entryPrice,
          exitPrice: price,
          pnlPct,
          pnl: rev - 1000,
          reason: 'STOP_LOSS'
        });
        tempPos = null;
      }
      // Take profit
      else if (pnlPct >= tp) {
        const rev = tempPos.amount * price;
        tempBalance += rev;
        backtestTrades.push({
          type: 'SELL',
          entryPrice,
          exitPrice: price,
          pnlPct,
          pnl: rev - 1000,
          reason: 'TAKE_PROFIT'
        });
        tempPos = null;
      }
      // Strategy exit check
      else if (strategy === 'RSI' && rsiVal > 70) {
        const rev = tempPos.amount * price;
        tempBalance += rev;
        backtestTrades.push({
          type: 'SELL',
          entryPrice,
          exitPrice: price,
          pnlPct,
          pnl: rev - 1000,
          reason: 'RSI_OVERBOUGHT'
        });
        tempPos = null;
      }
      else if (strategy === 'MACD' && prevMacdVal && prevMacdVal.macd >= prevMacdVal.signal && macdVal.macd < macdVal.signal) {
        const rev = tempPos.amount * price;
        tempBalance += rev;
        backtestTrades.push({
          type: 'SELL',
          entryPrice,
          exitPrice: price,
          pnlPct,
          pnl: rev - 1000,
          reason: 'MACD_BEARISH_CROSS'
        });
        tempPos = null;
      }
    } else {
      // Strategy entries
      if (strategy === 'RSI' && rsiVal < 30) {
        tempPos = {
          entryPrice: price,
          amount: 1000 / price // Buy $1000 worth
        };
        tempBalance -= 1000;
      }
      else if (strategy === 'MACD' && prevMacdVal && prevMacdVal.macd <= prevMacdVal.signal && macdVal.macd > macdVal.signal) {
        tempPos = {
          entryPrice: price,
          amount: 1000 / price
        };
        tempBalance -= 1000;
      }
    }
  }

  // Calculate stats
  const totalReturn = ((tempBalance - 10000) / 10000) * 100;
  const profitableTrades = backtestTrades.filter(t => t.pnl > 0).length;
  const winRate = backtestTrades.length > 0 ? (profitableTrades / backtestTrades.length) * 100 : 0;

  res.json({
    strategy,
    initialBalance: 10000,
    finalBalance: tempBalance,
    totalReturn,
    tradesCount: backtestTrades.length,
    winRate,
    trades: backtestTrades
  });
});

// AI analysis report endpoint
app.post('/api/ai/analyze', (req, res) => {
  const { query } = req.body;
  
  if (marketData.candles.length === 0) {
    return res.json({ response: "I'm still loading the market data. Please try again in a moment." });
  }

  const latestCandle = marketData.candles[marketData.candles.length - 1];
  const price = latestCandle.close;
  const len = marketData.candles.length;

  const rsi = marketData.indicators.rsi[len - 1];
  const macd = marketData.indicators.macd[len - 1];
  const bb = marketData.indicators.bb[len - 1];
  const sma20 = marketData.indicators.sma20[len - 1];
  const sma50 = marketData.indicators.sma50[len - 1];

  let trend = 'Neutral';
  if (sma20 && sma50) {
    trend = sma20 > sma50 ? 'Bullish Crossover' : 'Bearish Crossover';
  }

  // Generate an expert, context-driven AI response based on the actual Solana price metrics
  let aiResponse = "";
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('rsi') || lowerQuery.includes('indicator') || lowerQuery.includes('analyze')) {
    aiResponse = `📊 **Solana Technical Analysis (SOL/USDT)**\n\n` +
      `* **Current Live Price:** $${price.toFixed(2)}\n` +
      `* **Relative Strength Index (RSI):** ${rsi ? rsi.toFixed(2) : 'Calculating...'} (${rsi < 30 ? '🔥 Oversold - Bullish potential' : rsi > 70 ? '⚠️ Overbought - Pullback threat' : 'Neutral market flow'})\n` +
      `* **MACD Indicator:** Line: ${macd?.macd?.toFixed(3) || 'N/A'}, Signal: ${macd?.signal?.toFixed(3) || 'N/A'}, Histogram: ${macd?.hist?.toFixed(3) || 'N/A'}\n` +
      `* **Moving Averages:** SMA20 ($${sma20 || 'N/A'}) vs SMA50 ($${sma50 || 'N/A'}). Trend status is currently: **${trend}**.\n` +
      `* **Bollinger Bands:** Upper Band is at $${bb?.upper || 'N/A'} | Lower Band is at $${bb?.lower || 'N/A'}.\n\n` +
      `**Strategy Verdict:** ` +
      `${rsi < 35 ? 'The RSI indicates strong oversold signals. Accumulating long positions around the lower Bollinger Band is recommended with stop-losses below local support.' : 
        rsi > 65 ? 'SOL is trading near overbought territory. Tighten stop-losses or lock in profits as buying pressure is beginning to show exhaustion.' : 
        'Price is consolidating in the middle channel. We recommend running a GRID trading strategy to capture micro-fluctuations or waiting for a breakout above the EMA resistance levels.'}`;
  } 
  
  else if (lowerQuery.includes('grid') || lowerQuery.includes('order')) {
    aiResponse = `📐 **Solana Grid Bot Strategy Briefing**\n\n` +
      `Currently, the Grid Bot is executing ${botState.gridOrders.length} active order levels between the boundaries of **$${(price * 0.95).toFixed(2)}** (lower) and **$${(price * 1.05).toFixed(2)}** (upper).\n\n` +
      `* **Total Grid Trades Executed:** ${botState.trades.filter(t => t.notes && t.notes.includes('Grid')).length}\n` +
      `* **Current Position Capital:** ${botState.position ? `$${botState.position.allocatedCapital.toFixed(2)}` : 'None (Flat)'}\n\n` +
      `**AI Agent recommendation:** In periods of low volume consolidation, grid trading generates premium compounding yields. However, if SOL experiences a heavy directional breakout, standard grid logic might suffer trailing risk. Keep your grid boundaries updated based on daily support and resistance levels.`;
  }

  else if (lowerQuery.includes('buy or not') || lowerQuery.includes('should i buy') || lowerQuery.includes('buy') || lowerQuery.includes('signal') || lowerQuery.includes('recommend')) {
    const buyScore = (rsi < 40 ? 30 : rsi < 50 ? 15 : rsi > 70 ? -30 : 0) +
                     (trend === 'Bullish Crossover' ? 25 : -15) +
                     (macd && macd.hist > 0 ? 20 : -10) +
                     (price <= bb?.middle ? 15 : -10);

    let action = "";
    let exactAdvice = "";

    if (buyScore > 30) {
      action = "🟢 ACTION: BUY";
      exactAdvice = `Based on a high confluence score of **${buyScore}/100**, the technical indicators suggest a high-probability bullish setup.\n\n` +
        `**Exact Trade Setup:**\n` +
        `* **Direction:** LONG / BUY\n` +
        `* **Entry Range:** $${price.toFixed(2)} - $${(price * 1.002).toFixed(2)}\n` +
        `* **Stop Loss (SL):** $${(price * 0.98).toFixed(2)} (2.0% Risk)\n` +
        `* **Take Profit (TP):** $${(price * 1.045).toFixed(2)} (4.5% Reward)\n` +
        `* **Risk-Reward Ratio:** 1:2.25`;
    } else if (buyScore < -10) {
      action = "🔴 ACTION: DO NOT BUY (SELL / FLAT)";
      exactAdvice = `Based on a bearish confluence score of **${buyScore}/100**, the technical indicators suggest downward momentum or overbought fatigue. Buying here presents excessive risk.\n\n` +
        `**Exact Action Plan:**\n` +
        `* **Direction:** STAY FLAT (Wait for support check)\n` +
        `* **Next Potential Buy Zone:** $${bb?.lower ? bb.lower.toFixed(2) : (price * 0.97).toFixed(2)} (Lower Bollinger Band support)\n` +
        `* **Stop Loss (SL):** N/A (No active entry)\n` +
        `* **Take Profit (TP):** N/A`;
    } else {
      action = "🟡 ACTION: HOLD / WAIT (NEUTRAL)";
      exactAdvice = `Based on a neutral score of **${buyScore}/100**, the market is currently consolidating in a sideways channel with no clear directional breakout.\n\n` +
        `**Exact Action Plan:**\n` +
        `* **Direction:** HOLD existing positions or wait for indicator crossover\n` +
        `* **Alternative Strategy:** Turn on the **GRID Scalper** to capture sideways range fluctuations between $${(price * 0.985).toFixed(2)} and $${(price * 1.015).toFixed(2)}.\n` +
        `* **Buy Trigger Breakout:** Wait for a closed candle above $${(price * 1.012).toFixed(2)} with MACD bullish cross before entering long.`;
    }

    aiResponse = `💡 **Exact AI Trade Recommendation (SOL/USDT)**\n\n` +
      `### **${action}**\n\n` +
      `* **Live SOL Price:** $${price.toFixed(2)}\n` +
      `* **Confluence Buy Score:** ${buyScore}/100\n\n` +
      `${exactAdvice}\n\n` +
      `**Indicator Metrics:** RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | Trend: ${trend} | MACD Hist: ${macd?.hist?.toFixed(3) || 'N/A'}`;
  }
  
  else {
    aiResponse = `👋 **Hello! I'm your Solana AI Analyst Bot.**\n\n` +
      `I have a live feed linked to Binance SOL/USDT market stream. Currently, SOL is trading at **$${price.toFixed(2)}**.\n\n` +
      `Here are some topics you can ask me about:\n` +
      `* **"Analyze SOL indicators"** - Get the live values of RSI, MACD, and Bollinger Bands with an expert summary.\n` +
      `* **"Should I buy SOL now?"** - Get an automated AI buy/sell score check based on live indicator confluence.\n` +
      `* **"How does the Grid strategy look?"** - View grid boundaries and recommendations.\n` +
      `* **"Backtest the RSI strategy"** - Check hypothetical returns on historical candles.\n\n` +
      `What can I analyze for you today?`;
  }

  res.json({ response: aiResponse });
});

// Serve Vite React build static folder in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Fallback index handler for SPAs
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'), (err) => {
    if (err) {
      console.error("Failed to send index.html:", err);
      res.status(500).send("Unified build index not found. Verify frontend has been built successfully.");
    }
  });
});

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`Backend Server running on http://localhost:${PORT}`);
});

// Setup Websocket server on top of Express port
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`React client connected (Active clients: ${clients.size})`);

  // Send initial data to client on connect
  ws.send(JSON.stringify({
    type: 'INIT',
    candles: marketData.candles,
    indicators: marketData.indicators,
    alerts: alertsList,
    botState: {
      ...botState,
      currentPnL: calculateCurrentPnL()
    }
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`React client disconnected (Active clients: ${clients.size})`);
  });
});

// Boot operations
async function boot() {
  await fetchInitialHistory();
  initBinanceFeed();
}

boot();
