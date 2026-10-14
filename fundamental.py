import httpx

DEFILLAMA_BASE = "https://api.llama.fi"

SECTOR_MAP = {
    "artificial-intelligence": "هوش مصنوعی 🤖",
    "ai-agents": "هوش مصنوعی 🤖",
    "decentralized-finance-defi": "دیفای 💰",
    "defi": "دیفای 💰",
    "gaming": "بازی 🎮",
    "play-to-earn": "بازی 🎮",
    "metaverse": "متاورس 🌐",
    "infrastructure": "زیرساخت 🏗️",
    "storage": "ذخیره‌سازی داده 💾",
    "file-sharing": "ذخیره‌سازی داده 💾",
    "privacy-coins": "حریم خصوصی 🔒",
    "cybersecurity": "امنیت سایبری 🛡️",
    "oracle": "اوراکل 🔮",
    "layer-2": "لایه ۲ ⚡",
    "smart-contract-platform": "پلتفرم قرارداد هوشمند 📜",
    "real-world-assets-rwa": "دارایی دنیای واقعی (RWA) 🏢",
    "depin": "DePIN 📡",
    "renewable-energy": "انرژی تجدیدپذیر 🔋",
    "energy": "انرژی 🔋",
    "quantum-resistant": "مقاوم در برابر کوانتوم 🔐",
}


def get_tvl(protocol_slug: str):
    """گرفتن TVL یک پروتکل از DeFiLlama"""
    try:
        url = f"{DEFILLAMA_BASE}/tvl/{protocol_slug}"
        r = httpx.get(url, timeout=15.0)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


def get_chain_tvl(chain_name: str):
    """TVL یک بلاکچین خاص"""
    try:
        url = f"{DEFILLAMA_BASE}/v2/chains"
        r = httpx.get(url, timeout=15.0)
        if r.status_code == 200:
            chains = r.json()
            for chain in chains:
                if chain["name"].lower() == chain_name.lower():
                    return chain.get("tvl")
    except Exception:
        pass
    return None


def categorize_sectors(categories: list) -> list:
    """تبدیل دسته‌بندی‌های CoinGecko به صنایع خوانا"""
    sectors = set()
    for cat in categories or []:
        cat_lower = cat.lower().replace(" ", "-")
        if cat_lower in SECTOR_MAP:
            sectors.add(SECTOR_MAP[cat_lower])
        else:
            for key, value in SECTOR_MAP.items():
                if key in cat_lower:
                    sectors.add(value)
                    break
    return list(sectors) if sectors else ["دسته‌بندی نشده ❓"]