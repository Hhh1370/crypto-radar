import pandas as pd
import numpy as np


def calculate_rsi(prices: list, period: int = 14):
    if len(prices) < period + 1:
        return None
    series = pd.Series(prices)
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return round(float(rsi.iloc[-1]), 2)


def calculate_sma(prices: list, period: int = 50):
    if len(prices) < period:
        return None
    series = pd.Series(prices)
    return round(float(series.rolling(period).mean().iloc[-1]), 2)


def calculate_ema(prices: list, period: int = 50):
    if len(prices) < period:
        return None
    series = pd.Series(prices)
    return round(float(series.ewm(span=period, adjust=False).mean().iloc[-1]), 2)


def calculate_macd(prices: list, fast: int = 12, slow: int = 26, signal: int = 9):
    if len(prices) < slow + signal:
        return None
    series = pd.Series(prices)
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line

    macd_val = round(float(macd_line.iloc[-1]), 4)
    signal_val = round(float(signal_line.iloc[-1]), 4)
    hist_val = round(float(histogram.iloc[-1]), 4)

    if macd_val > signal_val and hist_val > 0:
        status = "bullish_cross"
    elif macd_val < signal_val and hist_val < 0:
        status = "bearish_cross"
    else:
        status = "neutral"

    return {"macd": macd_val, "signal": signal_val, "histogram": hist_val, "status": status}


def calculate_bollinger(prices: list, period: int = 20, std_dev: float = 2.0):
    if len(prices) < period:
        return None
    series = pd.Series(prices)
    sma = series.rolling(period).mean()
    std = series.rolling(period).std()

    upper = sma + (std * std_dev)
    lower = sma - (std * std_dev)
    current = series.iloc[-1]

    upper_val = round(float(upper.iloc[-1]), 2)
    lower_val = round(float(lower.iloc[-1]), 2)
    middle_val = round(float(sma.iloc[-1]), 2)
    width = round(((upper_val - lower_val) / middle_val) * 100, 2)

    if current >= upper_val:
        position = "above_upper"
    elif current <= lower_val:
        position = "below_lower"
    elif current > middle_val:
        position = "above_middle"
    else:
        position = "below_middle"

    return {
        "upper": upper_val,
        "middle": middle_val,
        "lower": lower_val,
        "width_pct": width,
        "position": position,
    }


def calculate_adx(highs: list, lows: list, closes: list, period: int = 14):
    if len(closes) < period * 2:
        return None

    high = pd.Series(highs)
    low = pd.Series(lows)
    close = pd.Series(closes)

    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    up_move = high - high.shift()
    down_move = low.shift() - low

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    plus_dm = pd.Series(plus_dm)
    minus_dm = pd.Series(minus_dm)

    atr = tr.ewm(alpha=1/period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1/period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(alpha=1/period, adjust=False).mean() / atr)

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    adx = dx.ewm(alpha=1/period, adjust=False).mean()

    adx_val = round(float(adx.iloc[-1]), 2)
    plus_di_val = round(float(plus_di.iloc[-1]), 2)
    minus_di_val = round(float(minus_di.iloc[-1]), 2)

    if adx_val >= 25:
        strength = "strong"
    elif adx_val >= 20:
        strength = "forming"
    else:
        strength = "weak"

    direction = "bullish" if plus_di_val > minus_di_val else "bearish"

    return {
        "adx": adx_val,
        "plus_di": plus_di_val,
        "minus_di": minus_di_val,
        "strength": strength,
        "direction": direction,
    }


def calculate_atr(highs: list, lows: list, closes: list, period: int = 14):
    if len(closes) < period + 1:
        return None

    high = pd.Series(highs)
    low = pd.Series(lows)
    close = pd.Series(closes)

    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1/period, adjust=False).mean()
    atr_val = round(float(atr.iloc[-1]), 2)
    current_price = float(close.iloc[-1])
    atr_pct = round((atr_val / current_price) * 100, 2)

    if atr_pct > 8:
        level = "very_high"
    elif atr_pct > 4:
        level = "high"
    else:
        level = "normal"

    return {
        "atr": atr_val,
        "atr_pct": atr_pct,
        "level": level,
    }


def calculate_gann_square(price: float, levels: int = 3):
    if price <= 0:
        return None

    root = price ** 0.5
    step = 0.125

    resistances = []
    supports = []

    for i in range(1, levels + 1):
        r = (root + i * step) ** 2
        s = (root - i * step) ** 2
        if s > 0:
            supports.append(round(s, 2))
        resistances.append(round(r, 2))

    return {
        "current_price": round(price, 2),
        "sqrt_price": round(root, 4),
        "resistances": resistances,
        "supports": supports,
    }


def detect_rsi_divergence(prices: list, period: int = 14, lookback: int = 30):
    if len(prices) < period + lookback:
        return None

    series = pd.Series(prices)
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    rs = avg_gain / avg_loss
    rsi_series = 100 - (100 / (1 + rs))

    recent_rsi = rsi_series.tail(lookback)

    current_rsi = float(rsi_series.iloc[-1])
    max_rsi = float(recent_rsi.max())
    min_rsi = float(recent_rsi.min())

    if current_rsi > 70 and max_rsi > 75:
        signal = "bearish_divergence"
    elif current_rsi < 30 and min_rsi < 25:
        signal = "bullish_divergence"
    else:
        signal = "none"

    return {
        "current_rsi": round(current_rsi, 2),
        "max_rsi_30d": round(max_rsi, 2),
        "min_rsi_30d": round(min_rsi, 2),
        "signal": signal,
    }