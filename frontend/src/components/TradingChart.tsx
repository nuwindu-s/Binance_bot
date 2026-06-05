import React, { useRef, useEffect, useState } from 'react';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean;
}

interface Indicators {
  rsi: (number | null)[];
  macd: { macd: number | null; signal: number | null; hist: number | null }[];
  bb: { upper: number | null; middle: number | null; lower: number | null }[];
  sma20: (number | null)[];
  sma50: (number | null)[];
}

interface Trade {
  id: string;
  type: string;
  price: number;
  amount: number;
  timestamp: number;
  exitPrice?: number;
  entryTime?: number;
  exitTime?: number;
}

interface TradingChartProps {
  candles: Candle[];
  indicators: Indicators;
  trades: Trade[];
}

export const TradingChart: React.FC<TradingChartProps> = ({ candles, indicators, trades }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(60); // Number of candles to display (width in count)
  const [scrollOffset, setScrollOffset] = useState<number>(0); // how many candles scrolled back

  useEffect(() => {
    const handleResize = () => {
      drawChart();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [candles, indicators, trades, hoverIndex, hoverPos, zoomLevel, scrollOffset]);

  useEffect(() => {
    drawChart();
  }, [candles, indicators, trades, hoverIndex, hoverPos, zoomLevel, scrollOffset]);

  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get display sizes
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.fillStyle = '#0b0e11';
    ctx.fillRect(0, 0, width, height);

    if (candles.length < 5) {
      ctx.fillStyle = '#848e9c';
      ctx.font = '14px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for Binance market feed data...', width / 2, height / 2);
      return;
    }

    // Determine subset of candles to display based on zoom & scroll
    const totalCandles = candles.length;
    const visibleCount = Math.min(zoomLevel, totalCandles);
    const endIndex = Math.max(visibleCount, totalCandles - scrollOffset);
    const startIndex = Math.max(0, endIndex - visibleCount);

    const activeCandles = candles.slice(startIndex, endIndex);
    const activeIndicators = {
      sma20: indicators.sma20.slice(startIndex, endIndex),
      sma50: indicators.sma50.slice(startIndex, endIndex),
      bb: indicators.bb.slice(startIndex, endIndex),
    };

    // Calculate Y scale (min/max price values in view)
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    activeCandles.forEach((c, idx) => {
      // Find min/max price considering wicks
      minPrice = Math.min(minPrice, c.low);
      maxPrice = Math.max(maxPrice, c.high);

      // Include BB in Y scale calculations if present
      const bbVal = activeIndicators.bb[idx];
      if (bbVal && bbVal.lower && bbVal.upper) {
        minPrice = Math.min(minPrice, bbVal.lower);
        maxPrice = Math.max(maxPrice, bbVal.upper);
      }
    });

    // Add padding to margins
    const priceDiff = maxPrice - minPrice;
    minPrice -= priceDiff * 0.05;
    maxPrice += priceDiff * 0.05;

    // Right margin for price labels
    const chartMarginRight = 70;
    const chartMarginBottom = 25;
    const chartWidth = width - chartMarginRight;
    const chartHeight = height - chartMarginBottom;

    // Helper functions for coordinate mappings
    const getX = (idx: number) => {
      return (idx / (visibleCount - 1)) * (chartWidth - 20) + 10;
    };

    const getY = (price: number) => {
      return chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * (chartHeight - 20) - 10;
    };

    // 1. Draw Grid Lines
    ctx.strokeStyle = '#1d232a';
    ctx.lineWidth = 1;

    // Horizontal Price Grids
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const gridPrice = minPrice + (priceDiff * (i / gridCount));
      const y = getY(gridPrice);
      
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Text labels on right axis
      ctx.fillStyle = '#848e9c';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText(`$${gridPrice.toFixed(2)}`, chartWidth + 5, y + 4);
    }

    // Vertical Time Grids (every 10 candles)
    const step = Math.ceil(visibleCount / 6);
    for (let i = 0; i < visibleCount; i += step) {
      if (i >= activeCandles.length) break;
      const x = getX(i);
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();

      // Time labels
      const date = new Date(activeCandles[i].time);
      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      
      ctx.fillStyle = '#848e9c';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, x, chartHeight + 15);
    }

    // 2. Draw Bollinger Bands Area Fill
    ctx.beginPath();
    let firstBBPoint = true;
    for (let i = 0; i < activeCandles.length; i++) {
      const bbVal = activeIndicators.bb[i];
      if (bbVal && bbVal.upper) {
        const x = getX(i);
        const y = getY(bbVal.upper);
        if (firstBBPoint) {
          ctx.moveTo(x, y);
          firstBBPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    // Backward direction along lower band to close polygon
    for (let i = activeCandles.length - 1; i >= 0; i--) {
      const bbVal = activeIndicators.bb[i];
      if (bbVal && bbVal.lower) {
        const x = getX(i);
        const y = getY(bbVal.lower);
        ctx.lineTo(x, y);
      }
    }
    ctx.fillStyle = 'rgba(147, 51, 234, 0.03)'; // Subtle purple fill
    ctx.fill();

    // Draw Bollinger Bands Lines
    ctx.lineWidth = 1;
    // Lower Band (Purple-Dashed)
    ctx.strokeStyle = 'rgba(147, 51, 234, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    activeIndicators.bb.forEach((bbVal, i) => {
      if (bbVal && bbVal.lower) {
        const x = getX(i);
        const y = getY(bbVal.lower);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Upper Band (Purple-Dashed)
    ctx.strokeStyle = 'rgba(147, 51, 234, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    activeIndicators.bb.forEach((bbVal, i) => {
      if (bbVal && bbVal.upper) {
        const x = getX(i);
        const y = getY(bbVal.upper);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // 3. Draw SMAs
    // SMA 20 (Yellow)
    ctx.strokeStyle = '#f0b90b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    activeIndicators.sma20.forEach((val, i) => {
      if (val) {
        const x = getX(i);
        const y = getY(val);
        if (i === 0 || !activeIndicators.sma20[i - 1]) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // SMA 50 (Blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    activeIndicators.sma50.forEach((val, i) => {
      if (val) {
        const x = getX(i);
        const y = getY(val);
        if (i === 0 || !activeIndicators.sma50[i - 1]) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 4. Draw Candlesticks
    const candleWidth = (chartWidth / visibleCount) * 0.7;

    activeCandles.forEach((c, i) => {
      const x = getX(i);
      const isBullish = c.close >= c.open;
      const color = isBullish ? '#0ecb81' : '#f6465d';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;

      // Wick (high to low line)
      ctx.beginPath();
      ctx.moveTo(x, getY(c.high));
      ctx.lineTo(x, getY(c.low));
      ctx.stroke();

      // Body
      const bodyTop = getY(Math.max(c.open, c.close));
      const bodyBottom = getY(Math.min(c.open, c.close));
      const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);

      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // 5. Draw Simulated Trade Markers (Triangles at buying/selling spots)
    trades.forEach((trade) => {
      const tradeTime = trade.timestamp || trade.entryTime || trade.exitTime;
      if (!tradeTime) return;

      // Check if trade time fits in our visible candle indices
      const matchIdx = activeCandles.findIndex(
        c => Math.abs(c.time - tradeTime) < 30000 // Match window within 30s
      );

      if (matchIdx !== -1) {
        const x = getX(matchIdx);
        const isBuy = trade.type === 'BUY' || (trade.exitPrice !== undefined && trade.exitTime === tradeTime);
        const y = getY(trade.price);

        if (trade.type === 'BUY') {
          // Green upward triangle below candle low
          const labelY = getY(activeCandles[matchIdx].low) + 12;
          ctx.fillStyle = '#0ecb81';
          ctx.beginPath();
          ctx.moveTo(x, labelY - 6);
          ctx.lineTo(x - 5, labelY + 2);
          ctx.lineTo(x + 5, labelY + 2);
          ctx.fill();
          
          ctx.font = 'bold 8px Outfit';
          ctx.textAlign = 'center';
          ctx.fillText('BUY', x, labelY + 11);
        } else {
          // Pink downward triangle above candle high
          const labelY = getY(activeCandles[matchIdx].high) - 12;
          ctx.fillStyle = '#f6465d';
          ctx.beginPath();
          ctx.moveTo(x, labelY + 6);
          ctx.lineTo(x - 5, labelY - 2);
          ctx.lineTo(x + 5, labelY - 2);
          ctx.fill();

          ctx.font = 'bold 8px Outfit';
          ctx.textAlign = 'center';
          ctx.fillText('SELL', x, labelY - 7);
        }
      }
    });

    // 6. Draw Interactive Crosshair & Legend
    if (hoverIndex !== null && hoverPos !== null && hoverIndex < activeCandles.length) {
      const x = getX(hoverIndex);
      const y = hoverPos.y;

      // Draw crosshair lines
      ctx.strokeStyle = 'rgba(132, 142, 156, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]); // Reset

      // Hover Price Label background & text on Y Axis
      const hoverPrice = minPrice + ((chartHeight - y) / chartHeight) * (maxPrice - minPrice);
      ctx.fillStyle = '#1e2329';
      ctx.fillRect(chartWidth + 2, y - 8, 65, 16);
      ctx.strokeStyle = '#848e9c';
      ctx.strokeRect(chartWidth + 2, y - 8, 65, 16);

      ctx.fillStyle = '#eaecef';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText(`$${hoverPrice.toFixed(2)}`, chartWidth + 6, y + 4);

      // Hover Time Label background & text on X Axis
      const hoverCandle = activeCandles[hoverIndex];
      const hoverDate = new Date(hoverCandle.time);
      const hoverTimeStr = `${String(hoverDate.getHours()).padStart(2, '0')}:${String(hoverDate.getMinutes()).padStart(2, '0')}`;
      
      ctx.fillStyle = '#1e2329';
      ctx.fillRect(x - 22, chartHeight + 2, 44, 15);
      ctx.strokeStyle = '#848e9c';
      ctx.strokeRect(x - 22, chartHeight + 2, 44, 15);

      ctx.fillStyle = '#eaecef';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(hoverTimeStr, x, chartHeight + 12);
    }

    // 7. Render Legend Info overlay (Top Left)
    const targetCandle = hoverIndex !== null && hoverIndex < activeCandles.length ? activeCandles[hoverIndex] : activeCandles[activeCandles.length - 1];
    const targetIdx = hoverIndex !== null && hoverIndex < activeCandles.length ? startIndex + hoverIndex : startIndex + activeCandles.length - 1;
    
    if (targetCandle) {
      const isUp = targetCandle.close >= targetCandle.open;
      const change = ((targetCandle.close - targetCandle.open) / targetCandle.open) * 100;
      
      ctx.fillStyle = '#848e9c';
      ctx.font = '11px Outfit';
      ctx.textAlign = 'left';
      ctx.fillText('SOL/USDT (1m)', 15, 20);

      // Price info values
      ctx.font = '11px JetBrains Mono';
      let offset = 100;

      const items = [
        { label: 'O', val: `$${targetCandle.open.toFixed(2)}` },
        { label: 'H', val: `$${targetCandle.high.toFixed(2)}` },
        { label: 'L', val: `$${targetCandle.low.toFixed(2)}` },
        { label: 'C', val: `$${targetCandle.close.toFixed(2)}`, color: isUp ? '#0ecb81' : '#f6465d' },
        { label: 'Chg', val: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, color: isUp ? '#0ecb81' : '#f6465d' }
      ];

      items.forEach(item => {
        ctx.fillStyle = '#848e9c';
        ctx.fillText(item.label, offset, 20);
        
        ctx.fillStyle = item.color || '#eaecef';
        ctx.fillText(item.val, offset + 12, 20);
        offset += 65;
      });

      // Indicators legends
      let indOffset = 15;
      const sma20Val = indicators.sma20[targetIdx];
      const sma50Val = indicators.sma50[targetIdx];
      
      ctx.font = '10px Outfit';
      
      if (sma20Val) {
        ctx.fillStyle = '#f0b90b';
        ctx.fillText(`SMA20: $${sma20Val.toFixed(2)}`, indOffset, 38);
        indOffset += 105;
      }
      
      if (sma50Val) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillText(`SMA50: $${sma50Val.toFixed(2)}`, indOffset, 38);
        indOffset += 105;
      }

      const rsiVal = indicators.rsi[targetIdx];
      if (rsiVal) {
        ctx.fillStyle = '#a78bfa';
        ctx.fillText(`RSI(14): ${rsiVal.toFixed(1)}`, indOffset, 38);
      }
    }
  };

  // Canvas Mouse Actions handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const chartWidth = rect.width - 70; // Sync with marginRight
    const visibleCount = Math.min(zoomLevel, candles.length);

    // Map X coordinate to index of activeCandles array
    let idx = Math.floor(((x - 10) / (chartWidth - 20)) * (visibleCount - 1));
    if (idx < 0) idx = 0;
    if (idx >= visibleCount) idx = visibleCount - 1;

    setHoverIndex(idx);
    setHoverPos({ x, y });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setHoverPos(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      // Zoom In
      setZoomLevel(prev => Math.max(20, prev - 5));
    } else {
      // Zoom Out
      setZoomLevel(prev => Math.min(150, prev + 5));
    }
  };

  return (
    <div ref={containerRef} className="chart-container" style={{ flex: 1, minHeight: '350px' }}>
      <canvas
        ref={canvasRef}
        className="chart-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
};
