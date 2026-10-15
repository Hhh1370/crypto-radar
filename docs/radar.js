// ============ INDICATORS (JavaScript version) ============

function emaSeries(values, period) {
  const k = 2 / (period + 1);
  const result = [];
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[i - j];
      prev = sum / period;
      result.push(prev);
    } else {
      prev = values[i] * k + prev * (1 - k);
      result.push(prev);
    }
  }
  return result;
}

function wilderSmooth(values, period) {
  const result = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    result.push(prev);
  }
  return result;
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function calculateEMA(closes, period) {
  if (closes.length < period) return null;
  const series = emaSeries(closes, period);
  const last = series[series.length - 1];
  return last === null ? null : Math.round(last * 100) / 100;
}

function calculateMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }
  if (macdLine.length < signalPeriod) return null;
  const signalLine = emaSeries(macdLine, signalPeriod);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const hist = lastMacd - lastSignal;
  let status = "neutral";
  if (lastMacd > lastSignal && hist > 0) status = "bullish_cross";
  else if (lastMacd < lastSignal && hist < 0) status = "bearish_cross";
  return {
    macd: Math.round(lastMacd * 10000) / 10000,
    signal: Math.round(lastSignal * 10000) / 10000,
    histogram: Math.round(hist * 10000) / 10000,
    status
  };
}

function calculateBollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const recent = closes.slice(-period);
  const mean = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + mult * std;
  const lower = mean - mult * std;
  const current = closes[closes.length - 1];
  let position = "below_middle";
  if (current >= upper) position = "above_upper";
  else if (current <= lower) position = "below_lower";
  else if (current > mean) position = "above_middle";
  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(mean * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    width_pct: Math.round(((upper - lower) / mean) * 10000) / 100,
    position
  };
}

function calculateADX(highs, lows, closes, period = 14) {
  if (closes.length < period * 2 + 1) return null;
  const n = closes.length;
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const atrArr = wilderSmooth(tr, period);
  const plusSmooth = wilderSmooth(plusDM, period);
  const minusSmooth = wilderSmooth(minusDM, period);
  const plusDI = plusSmooth.map((v, i) => 100 * v / atrArr[i]);
  const minusDI = minusSmooth.map((v, i) => 100 * v / atrArr[i]);
  const dx = plusDI.map((p, i) => {
    const m = minusDI[i];
    if (p + m === 0) return 0;
    return 100 * Math.abs(p - m) / (p + m);
  });
  const adxArr = wilderSmooth(dx, period);
  const lastAdx = adxArr[adxArr.length - 1];
  const lastPlus = plusDI[plusDI.length - 1];
  const lastMinus = minusDI[minusDI.length - 1];
  let strength = "weak";
  if (lastAdx >= 25) strength = "strong";
  else if (lastAdx >= 20) strength = "forming";
  const direction = lastPlus > lastMinus ? "bullish" : "bearish";
  return {
    adx: Math.round(lastAdx * 100) / 100,
    plus_di: Math.round(lastPlus * 100) / 100,
    minus_di: Math.round(lastMinus * 100) / 100,
    strength,
    direction
  };
}

function calculateATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atr = wilderSmooth(tr, period);
  const last = atr[atr.length - 1];
  const currentPrice = closes[closes.length - 1];
  const atrPct = (last / currentPrice) * 100;
  let level = "normal";
  if (atrPct > 8) level = "very_high";
  else if (atrPct > 4) level = "high";
  return {
    atr: Math.round(last * 100) / 100,
    atr_pct: Math.round(atrPct * 100) / 100,
    level
  };
}

function calculateGann(price, levels = 3) {
  const root = Math.sqrt(price);
  const step = 0.125;
  const resistances = [], supports = [];
  for (let i = 1; i <= levels; i++) {
    resistances.push(Math.round(Math.pow(root + i * step, 2) * 100) / 100);
    const s = Math.pow(root - i * step, 2);
    if (s > 0) supports.push(Math.round(s * 100) / 100);
  }
  return {
    current_price: Math.round(price * 100) / 100,
    resistances,
    supports
  };
}

function detectDivergence(closes, period = 14, lookback = 30) {
  if (closes.length < period + lookback) return null;
  const recent = closes.slice(-lookback);
  // compute RSI series for the recent window
  const rsiSeries = [];
  for (let i = 0; i < recent.length; i++) {
    const slice = recent.slice(0, i + 1);
    if (slice.length < period + 1) {
      rsiSeries.push(null);
      continue;
    }
    // quick RSI calculation
    let gains = 0, losses = 0;
    const start = slice.length - period - 1;
    for (let j = start + 1; j < slice.length; j++) {
      const diff = slice[j] - slice[j - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) rsiSeries.push(100);
    else {
      const rs = avgGain / avgLoss;
      rsiSeries.push(100 - 100 / (1 + rs));
    }
  }
  const validRsi = rsiSeries.filter(v => v !== null);
  if (validRsi.length === 0) return null;
  const current = validRsi[validRsi.length - 1];
  const maxR = Math.max(...validRsi);
  const minR = Math.min(...validRsi);
  let signal = "none";
  if (current > 70 && maxR > 75) signal = "bearish_divergence";
  else if (current < 30 && minR < 25) signal = "bullish_divergence";
  return {
    current_rsi: Math.round(current * 100) / 100,
    max_rsi_30d: Math.round(maxR * 100) / 100,
    min_rsi_30d: Math.round(minR * 100) / 100,
    signal
  };
}

// ============ TECHNICAL SCORE ============

function buildTechnicalScore(closes, highs, lows) {
  const rsi = calculateRSI(closes, 14);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const macd = calculateMACD(closes);
  const bollinger = calculateBollinger(closes);
  const adx = calculateADX(highs, lows, closes);
  const atr = calculateATR(highs, lows, closes);
  const gann = calculateGann(closes[closes.length - 1]);
  const divergence = detectDivergence(closes);

  const currentPrice = closes[closes.length - 1];
  let score = 0;
  const signals = [];

  if (ema200) {
    if (currentPrice > ema200) { score += 25; signals.push("قیمت بالای EMA200 ✅"); }
    else signals.push("قیمت زیر EMA200 ❌");
  }

  if (ema50 && ema200) {
    if (ema50 > ema200) { score += 10; signals.push("گلدن کراس ✅"); }
    else signals.push("دث کراس ❌");
  }

  if (rsi) {
    if (rsi >= 40 && rsi <= 65) { score += 15; signals.push(`RSI سالم (${rsi}) ✅`); }
    else if (rsi < 30) { score += 8; signals.push(`RSI اشباع فروش (${rsi}) ⚠️`); }
    else if (rsi > 70) signals.push(`RSI اشباع خرید (${rsi}) ⚠️`);
  }

  if (macd) {
    if (macd.status === "bullish_cross") { score += 15; signals.push("MACD کراس صعودی ✅"); }
    else if (macd.status === "bearish_cross") signals.push("MACD کراس نزولی ❌");
    else { score += 7; signals.push("MACD بی‌طرف"); }
  }

  if (closes.length >= 31) {
    const change30d = ((closes[closes.length-1] - closes[closes.length-31]) / closes[closes.length-31]) * 100;
    if (change30d > 5 && change30d < 100) { score += 10; signals.push(`مومنتوم +${change30d.toFixed(1)}% ✅`); }
    else if (change30d > 0 && change30d <= 5) { score += 5; signals.push(`مومنتوم ضعیف (${change30d.toFixed(1)}%)`); }
    else signals.push(`مومنتوم منفی (${change30d.toFixed(1)}%) ❌`);
  }

  if (bollinger) {
    if (bollinger.position === "below_lower") { score += 10; signals.push("Bollinger اشباع فروش ✅"); }
    else if (bollinger.position === "above_upper") signals.push("Bollinger اشباع خرید ⚠️");
    else { score += 5; signals.push(`Bollinger: ${bollinger.position}`); }
  }

  if (adx) {
    if (adx.adx >= 25) { score += 10; signals.push(`ADX قوی (${adx.adx}) ✅`); }
    else if (adx.adx >= 20) { score += 5; signals.push(`ADX در حال شکل‌گیری (${adx.adx})`); }
    else signals.push(`ADX ضعیف (${adx.adx})`);
  }

  if (divergence) {
    if (divergence.signal === "bullish_divergence") { score += 5; signals.push("واگرایی صعودی RSI ✅"); }
    else if (divergence.signal === "bearish_divergence") signals.push("واگرایی نزولی RSI ⚠️");
  }

  return {
    score,
    signals,
    indicators: { rsi, ema50, ema200, macd, bollinger, adx, atr, gann, divergence }
  };
}