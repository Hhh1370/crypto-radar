async function loadData() {
  const loading=document.getElementById("loading"),cards=document.getElementById("cards"),error=document.getElementById("error"),btn=document.getElementById("refresh-btn");
  loading.classList.remove("hidden");cards.innerHTML="";error.classList.add("hidden");btn.disabled=true;btn.textContent="⏳ در حال تحلیل...";
  try{
    const results=await loadAllSignals();
    const main=results.slice(0,5),watch=results.slice(5,10);
    const heading=(text)=>{const h=document.createElement("h2");h.className="radar-heading";h.textContent=text;cards.appendChild(h);};
    heading("⭐ پنج پروژه اصلی");
    for(const item of main)renderCard(item);
    if(watch.length){heading("👁 پنج پروژه در فهرست مراقبت");for(const item of watch)renderCard(item);}
    const meta=document.createElement("p");meta.className="hint";const prog=results[0]?.scanProgress;meta.textContent=prog?("در این نوبت "+prog.batchSize+" بازار بررسی می‌شود؛ تا کنون "+prog.scanned+" از "+prog.total+" بازار در فهرست رتبه‌بندی‌شده ثبت شده‌اند. با هر بار بروزرسانی، دسته بعدی بازارها بررسی می‌شود."):("بازارهای اسپات USDT بایننس");cards.appendChild(meta);
    loading.classList.add("hidden");
  }catch(e){loading.classList.add("hidden");error.classList.remove("hidden");error.textContent="خطا: "+e.message+" اگر Worker تازه Deploy شده، آدرس آن را در تنظیمات بررسی کن.";}
  finally{btn.disabled=false;btn.textContent="🔄 بروزرسانی";}
}
function scoreClass(score){if(score>=70)return"score-strong";if(score>=50)return"score-medium";return"score-weak";}
function barColor(score){if(score>=70)return"#10b981";if(score>=50)return"#f59e0b";return"#ef4444";}
function formatPrice(p){if(p>=1000)return"$"+p.toLocaleString("en-US",{maximumFractionDigits:2});if(p>=1)return"$"+p.toFixed(3);return"$"+p.toPrecision(5);}
function escapeHTML(value){return String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function safeURL(value){try{const u=new URL(String(value||""));if(u.protocol==="https:"||u.protocol==="http:")return u.href;}catch(e){}return "#";}
function renderCard(data,targetId){
 const cards=document.getElementById(targetId||"cards"),bd=data.breakdown||{},tech=bd.technical||{},fund=bd.fundamental||{},news=bd.news||{},deriv=bd.derivatives||{},multi=tech.multi||{},protocol=fund.protocol||null;
 const card=document.createElement("article");card.className="card";
 const priceChange=Number(data.change24h||0),trend=multi.conflict?"⚠️ تضاد تایم‌فریم":data.verdict||"";
 const frameRows=Object.entries(multi.frames||{}).map(([k,f])=>({name:({monthly:"ماهانه",weekly:"هفتگی",daily:"روزانه"})[k]||k,f})).filter(x=>x.f.available);
 const fmt=(v)=>v==null?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:8});
 const newsRows=(news.top_titles||[]).slice(0,3);
 card.innerHTML=`
 <div class="card-header"><div class="coin-info"><div><div class="coin-symbol">${data.symbol||""} <span class="market-tag">${data.watch_status==="اصلی"?"اصلی":data.watch_status==="مراقبت"?"مراقبت":""}</span></div><div class="coin-name">${data.name||""} · ${data.marketSymbol||""}</div></div></div><div class="score-badge ${scoreClass(data.combined_signal||0)}"><div class="num">${data.combined_signal||0}</div><div class="label">امتیاز ترکیبی</div></div></div>
 <div class="price-row"><div><div class="price">${formatPrice(data.current_price||0)}</div><div class="price-change ${priceChange>=0?"change-up":"change-down"}">${priceChange>=0?"+":""}${priceChange.toFixed(2)}% · ۲۴ ساعت</div></div><div class="verdict">${trend}</div></div>
 <div class="section"><div class="section-title">📊 تفکیک امتیازها</div><div class="breakdown-bars">
 ${[["تکنیکال",tech.score||0],["بنیادی مقدماتی",fund.score||0],["اخبار",news.score||0],...(deriv.score==null?[]:[["مشتقات",deriv.score]])].map(([label,score])=>`<div class="bar-row"><div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,score))}%;background:${barColor(score)}"></div></div><div class="bar-value">${score}</div></div>`).join("")}
 </div></div>
 ${frameRows.length?`<div class="section"><div class="section-title">🧭 روند چندبازه‌ای</div><div class="chips">${frameRows.map(({name,f})=>`<span class="chip">${name}: ${f.score}/100</span>`).join("")}</div><div class="level-grid">${frameRows.map(({name,f})=>`<div class="level-box"><b>${name}</b><small>حمایت: ${(f.levels?.support||[]).slice(0,2).map(fmt).join(" · ")||"—"}</small><small>مقاومت: ${(f.levels?.resistance||[]).slice(0,2).map(fmt).join(" · ")||"—"}</small>${f.breakout&&f.breakout!=="none"?`<small>شکست: ${f.breakout==="up"?"صعودی":"نزولی"}</small>`:""}</div>`).join("")}</div>${multi.conflict?'<p class="warning-note">تضاد معنادار بین تایم‌فریم‌ها؛ ورود عجولانه مناسب نیست.</p>':""}</div>`:""}
 ${deriv.available?`<div class="section"><div class="section-title">📉 وضعیت بازار مشتقات · ${deriv.source||"Binance"}</div><div class="chips"><span class="chip">تغییر OI: ${deriv.openInterestChange24hPct==null?"—":Number(deriv.openInterestChange24hPct).toFixed(2)+"%"}</span><span class="chip">Funding: ${deriv.fundingRate==null?"—":(Number(deriv.fundingRate)*100).toFixed(4)+"%"}</span><span class="chip">نسبت لانگ/شورت: ${deriv.globalLongShortRatio==null?"—":Number(deriv.globalLongShortRatio).toFixed(2)}</span><span class="chip">Taker خرید/فروش: ${deriv.takerBuySellRatio==null?"—":Number(deriv.takerBuySellRatio).toFixed(2)}</span></div>${(deriv.signals||[]).length?`<ul class="derivative-signals">${deriv.signals.map(s=>`<li>${s}</li>`).join("")}</ul>`:""}<p class="hint">داده اهرمی می‌تواند نشانه ازدحام باشد؛ به‌تنهایی جهت قیمت را تعیین نمی‌کند.</p></div>`:""}
 ${protocol?`<div class="section"><div class="section-title">⛓ داده پروتکل از DeFiLlama</div><div class="chips"><span class="chip">${escapeHTML(protocol.name)}</span><span class="chip">TVL: ${protocol.tvl==null?"—":formatPrice(protocol.tvl)}</span><span class="chip">تغییر ۷روزه: ${protocol.change7d==null?"—":Number(protocol.change7d).toFixed(2)+"%"}</span><span class="chip">تغییر ۲۴ساعته: ${protocol.change1d==null?"—":Number(protocol.change1d).toFixed(2)+"%"}</span></div>${protocol.url?`<a class="news-item" href="${escapeHTML(safeURL(protocol.url))}" target="_blank" rel="noopener">مشاهده منبع پروتکل</a>`:""}<p class="hint">تطبیق فقط با نماد توکن انجام شده، نه شناسه رسمی؛ ممکن است پروتکل اشتباه باشد. این داده فعلاً در امتیاز نهایی لحاظ نمی‌شود.</p></div>`:""}
 ${(fund.sectors||[]).length?`<div class="section"><div class="section-title">🏭 حوزه‌های احتمالی</div><div class="chips">${fund.sectors.map(s=>`<span class="chip sector">${s}</span>`).join("")}</div></div>`:""}
 ${newsRows.length?`<div class="section"><div class="section-title">📰 اخبار مرتبط (${news.news_count||0})</div><div class="news-list">${newsRows.map(n=>`<a class="news-item" href="${escapeHTML(safeURL(n.link))}" target="_blank" rel="noopener"><span class="news-source">[${escapeHTML(n.source)}]</span> ${escapeHTML(n.title)}</a>`).join("")}</div></div>`:""}
 <p class="data-note">کیفیت داده: ${data.data_quality?.dailyCandles||data.data_quality?.candles||0} کندل روزانه · ${data.scanAgeHours>24?"آخرین اسکن "+Math.round(data.scanAgeHours)+" ساعت قبل · ":""}امتیاز حوزه/خبر مقدماتی است و احتمال موفقیت محسوب نمی‌شود.</p>`;
 cards.appendChild(card);
}
function initSettings(){
 const form=document.getElementById("api-settings"),input=document.getElementById("api-base"),status=document.getElementById("api-status");
 if(!form||!input)return;
 input.value=apiBase();
 const sourceSelect=document.getElementById("derivatives-source");
 if(sourceSelect)sourceSelect.value=localStorage.getItem("cryptoRadarDerivativesSource")||"binance";
 form.addEventListener("submit",async e=>{e.preventDefault();saveApiBase(input.value);if(sourceSelect)localStorage.setItem("cryptoRadarDerivativesSource",sourceSelect.value);status.textContent="در حال آزمایش اتصال…";try{const d=await api("/api/health");status.textContent=d.status==="ok"?"اتصال برقرار است؛ برای دریافت داده بروزرسانی را بزن.":"پاسخ نامعتبر";}catch(err){status.textContent="اتصال ناموفق: "+err.message;}});
}
window.addEventListener("DOMContentLoaded",()=>{initSettings();loadData();});
