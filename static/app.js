const WATCHLIST = ["bitcoin", "ethereum", "solana"];

async function loadData(forceRefresh = false) {
  const loading = document.getElementById("loading");
  const cards = document.getElementById("cards");
  const error = document.getElementById("error");
  const btn = document.getElementById("refresh-btn");

  loading.classList.remove("hidden");
  cards.innerHTML = "";
  error.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "⏳ در حال تحلیل...";

  try {
    const results = [];

    for (const coinId of WATCHLIST) {
      try {
        const r = await fetch(`/signal/${coinId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        results.push(data);
        renderCard(data);
      } catch (e) {
        console.error(`Error for ${coinId}:`, e);
      }
    }

    if (results.length === 0) {
      throw new Error("هیچ داده‌ای دریافت نشد");
    }

    loading.classList.add("hidden");
  } catch (e) {
    loading.classList.add("hidden");
    error.classList.remove("hidden");
    error.textContent = "خطا: " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 بروزرسانی";
  }
}

function scoreClass(score) {
  if (score >= 60) return "score-strong";
  if (score >= 40) return "score-medium";
  return "score-weak";
}

function barColor(score) {
  if (score >= 60) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function formatPrice(p) {
  if (p >= 1000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}

function renderCard(data) {
  const cards = document.getElementById("cards");
  const bd = data.breakdown || {};
  const tech = bd.technical || {};
  const fund = bd.fundamental || {};
  const news = bd.news || {};

  const card = document.createElement("div");
  card.className = "card";

  const techSignals = (tech.signals || []).slice(0, 4);
  const sectors = (fund.sectors || []).filter(s => !s.includes("دسته‌بندی"));
  const topNews = (news.top_titles || []).slice(0, 3);

  card.innerHTML = `
    <div class="card-header">
      <div class="coin-info">
        <div>
          <div class="coin-symbol">${data.symbol}</div>
          <div class="coin-name">${data.name}</div>
        </div>
      </div>
      <div class="score-badge ${scoreClass(data.combined_signal)}">
        <div class="num">${data.combined_signal}</div>
        <div class="label">امتیاز</div>
      </div>
    </div>

    <div class="price-row">
      <div class="price">${formatPrice(data.current_price)}</div>
      <div class="verdict">${data.verdict}</div>
    </div>

    <div class="section">
      <div class="section-title">📊 تفکیک امتیازها</div>
      <div class="breakdown-bars">
        <div class="bar-row">
          <div class="bar-label">تکنیکال</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${tech.score || 0}%;background:${barColor(tech.score || 0)}"></div>
          </div>
          <div class="bar-value">${tech.score || 0}</div>
        </div>
        <div class="bar-row">
          <div class="bar-label">بنیادی</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${fund.score || 0}%;background:${barColor(fund.score || 0)}"></div>
          </div>
          <div class="bar-value">${fund.score || 0}</div>
        </div>
        <div class="bar-row">
          <div class="bar-label">اخبار</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${news.score || 0}%;background:${barColor(news.score || 0)}"></div>
          </div>
          <div class="bar-value">${news.score || 0}</div>
        </div>
      </div>
    </div>

    ${techSignals.length > 0 ? `
    <div class="section">
      <div class="section-title">📈 سیگنال‌های تکنیکال</div>
      <div class="chips">
        ${techSignals.map(s => `<span class="chip">${s}</span>`).join("")}
      </div>
    </div>
    ` : ""}

    ${sectors.length > 0 ? `
    <div class="section">
      <div class="section-title">🏭 صنایع</div>
      <div class="chips">
        ${sectors.map(s => `<span class="chip sector">${s}</span>`).join("")}
      </div>
    </div>
    ` : ""}

    ${topNews.length > 0 ? `
    <div class="section">
      <div class="section-title">📰 اخبار (${news.sources_count} منبع، ${news.news_count} خبر)</div>
      <div class="news-list">
        ${topNews.map(n => `
          <a class="news-item" href="${n.link}" target="_blank" rel="noopener">
            <span class="news-source">[${n.source}]</span>
            ${n.title}
          </a>
        `).join("")}
      </div>
    </div>
    ` : ""}
  `;

  cards.appendChild(card);
}

// بارگذاری خودکار در شروع
window.addEventListener("DOMContentLoaded", () => loadData());