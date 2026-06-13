import { useState, useEffect, useCallback } from "react";

const FINNHUB_KEY = process.env.REACT_APP_FINNHUB_KEY;
const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_KEY;
const API_URL = process.env.REACT_APP_API_URL;

//Helpers 
function formatPrice(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function timeAgo(unixTimestamp) {
  const diff = Math.floor((Date.now() / 1000) - unixTimestamp);
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

//DynamoDB via API Gateway
async function loadWatchlistFromDB(userId) {
  try {
    const res  = await fetch(`${API_URL}/watchlist?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data.watchlist || [];
  } catch (e) {
    console.error("Failed to load watchlist:", e);
    return [];
  }
}

async function saveWatchlistToDB(userId, watchlist) {
  try {
    await fetch(`${API_URL}/watchlist`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        userId,
        watchlist: watchlist.map((s) => ({ ticker: s.ticker, name: s.name })),
      }),
    });
  } catch (e) {
    console.error("Failed to save watchlist:", e);
  }
}

//Search company name 
async function searchTicker(query) {
  try {
    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const matches = data?.result || [];
    return matches
      .filter((m) => m.type === "Common Stock")
      .slice(0, 5)
      .map((m) => ({ ticker: m.symbol, name: m.description }));
  } catch (e) {
    console.error("Search failed:", e);
    return [];
  }
}

//AI Sentiment Analysis 
async function analyzeHeadline(ticker, headline) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-calls": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 120,
        messages: [{
          role: "user",
          content:`You are a stock market analyst. Analyze this news headline for the stock "${ticker}" and respond with ONLY a JSON object in this exact format:
{"sentiment":"Bullish","confidence":"High","reason":"FDA approval removes regulatory risk and opens $2B market"}

Sentiment must be exactly one of: Bullish, Bearish, Neutral
Confidence must be exactly one of: High, Medium, Low
Reason must be under 80 characters and explain the price impact clearly.

Headline: "${headline}"

Respond with JSON only, no other text.`,
        }],
      }),
    });
    const data  = await res.json();
    const text  = data?.content?.[0]?.text?.trim() || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("Sentiment analysis failed:", e);
    return { sentiment: "Neutral", confidence: "Low", reason: "Could not analyze" };
  }
}

//Fetch price 
async function fetchStockPrice(ticker, name) {
  try {
    const url  = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data || data.c === 0) return null;
    return {
      ticker,
      name: name || ticker,
      price: data.c,
      change: data.d,
      changePercent: data.dp,
    };
  } catch (e) {
    console.error("Price fetch failed for", ticker, e);
    return null;
  }
}

//Fetch news + AI analysis 
async function fetchNewsForTicker(ticker) {
  try {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const fromStr = from.toISOString().split("T")[0];
    const toStr   = to.toISOString().split("T")[0];
    const url  = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${fromStr}&to=${toStr}&token=${FINNHUB_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const top      = data.slice(0, 2);
    const analyzed = await Promise.all(
      top.map(async (item) => {
        const ai = await analyzeHeadline(ticker, item.headline);
        return {
          ticker,
          headline: item.headline,
          time: timeAgo(item.datetime),
          url: item.url,
          sentiment: ai.sentiment,
          confidence: ai.confidence,
          reason: ai.reason,
        };
      })
    );
    return analyzed;
  } catch (e) {
    console.error("News fetch failed for", ticker, e);
    return [];
  }
}

//Sub-components 
function NotificationBanner({ notifications, onDismiss }) {
  if (!notifications.length) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
      {notifications.map((n) => (
        <div key={n.id} className="notif-banner">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <span className="notif-ticker">{n.ticker}</span>
              <span className="notif-text">{n.msg}</span>
            </div>
            <button className="notif-close" onClick={() => onDismiss(n.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchBar({ onAdd, existingTickers }) {
  const [query,setQuery] = useState("");
  const [results,setResults] = useState([]);
  const [searching,setSearching] = useState(false);
  const [adding,setAdding] = useState(null);
  const [searchError,setSearchError] = useState(null);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults([]);
    setSearchError(null);
    const found = await searchTicker(q);
    if (found.length === 0) setSearchError(`No results found for "${q}". Try a different name or ticker.`);
    setResults(found);
    setSearching(false);
  };

  const handleAdd = async (ticker, name) => {
    if (existingTickers.includes(ticker)) return;
    setAdding(ticker);
    await onAdd(ticker, name);
    setAdding(null);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="search-section">
      <div className="add-bar">
        <input
          className="add-input"
          placeholder="Search by company name or ticker (e.g. Apple, TTWO, Pfizer...)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchError(null); setResults([]); }}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button className="add-btn" onClick={handleSearch} disabled={searching}>
          {searching ? "Searching..." : "🔍 Search"}
        </button>
      </div>

      {searchError && <div className="search-error">{searchError}</div>}

      {results.length > 0 && (
        <div className="search-results">
          <div className="search-results-label">Select a stock to add:</div>
          {results.map((r) => {
            const already = existingTickers.includes(r.ticker);
            return (
              <div key={r.ticker} className={`search-result-item ${already ? "already-added" : ""}`}>
                <div className="result-info">
                  <span className="result-ticker">{r.ticker}</span>
                  <span className="result-name">{r.name}</span>
                </div>
                <button
                  className="result-add-btn"
                  onClick={() => handleAdd(r.ticker, r.name)}
                  disabled={already || adding === r.ticker}
                >
                  {already ? "Added ✓" : adding === r.ticker ? "Adding..." : "+ Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StockCard({ stock, onRemove }) {
  const up = stock.change >= 0;
  return (
    <div className="stock-card">
      <div className="card-top">
        <div>
          <div className="ticker-label">{stock.ticker}</div>
          <div className="stock-name">{stock.name}</div>
        </div>
        <button className="remove-btn" onClick={() => onRemove(stock.ticker)} title="Remove">✕</button>
      </div>
      <div className="card-bottom">
        <div className="price">{formatPrice(stock.price)}</div>
        <div className={`change-badge ${up ? "up" : "down"}`}>
          {up ? "▲" : "▼"} {Math.abs(stock.changePercent).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

function SentimentBadge({ sentiment, confidence }) {
  const cfg = {
    Bullish: { bg: "#0d2e1f", color: "#00e5a0", icon: "▲" },
    Bearish: { bg: "#2e0d16", color: "#ff4d6a", icon: "▼" },
    Neutral: { bg: "#1a1f2e", color: "#9aa3c0", icon: "●" },
  }[sentiment] || { bg: "#1a1f2e", color: "#9aa3c0", icon: "●" };

  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
      padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap",
    }}>
      {cfg.icon} {sentiment} · {confidence}
    </span>
  );
}

function NewsItem({ item }) {
  return (
    <a className="news-item" href={item.url || "#"} target="_blank" rel="noreferrer">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className="news-ticker">{item.ticker}</span>
        {item.sentiment && <SentimentBadge sentiment={item.sentiment} confidence={item.confidence} />}
        <span className="news-time">{item.time}</span>
      </div>
      <div className="news-headline">{item.headline}</div>
      {item.reason && (
        <div className="ai-reason">
          <span className="ai-label">🤖 AI:</span> {item.reason}
        </div>
      )}
    </a>
  );
}

function EmptyWatchlist() {
  return (
    <div className="empty-state">
      <div className="empty-icon">📈</div>
      <div className="empty-title">Your watchlist is empty</div>
      <div className="empty-sub">Search for a company above to get started — try "Apple", "Nvidia", or "Pfizer"</div>
    </div>
  );
}

function LoadingNews() {
  return (
    <div className="news-feed">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="news-item" style={{ pointerEvents: "none" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div className="skeleton" style={{ width: 48,  height: 18, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 100, height: 18, borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ width: "85%", height: 14, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: "55%", height: 12, borderRadius: 4, marginTop: 8 }} />
        </div>
      ))}
      <div className="ai-loading-note">🤖 AI is analyzing headlines — this takes ~15 seconds...</div>
    </div>
  );
}

//Main App 
export default function StockTracker({ user, onSignOut }) {
  const [watchlist,     setWatchlist]     = useState([]);
  const [news,          setNews]          = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTab,     setActiveTab]     = useState("watchlist");
  const [lastUpdated,   setLastUpdated]   = useState(new Date());
  const [notifCount,    setNotifCount]    = useState(0);
  const [loadingNews,   setLoadingNews]   = useState(false);
  const [loadingInit,   setLoadingInit]   = useState(true);
  const [error,         setError]         = useState(null);
  const [savedMsg,      setSavedMsg]      = useState(false);

  const userEmail = user?.signInDetails?.loginId || user?.username || "User";

  function fireNotification(ticker, msg) {
    const id = Date.now() + Math.random();
    setNotifCount((c) => c + 1);
    setNotifications((n) => [...n.slice(-3), { id, ticker, msg }]);
    setTimeout(() => setNotifications((n) => n.filter((x) => x.id !== id)), 7000);
  }

  function checkPriceAlerts(stocks) {
    stocks.forEach((s) => {
      if (Math.abs(s.changePercent) > 1.5) {
        const dir = s.changePercent > 0 ? "+" : "";
        fireNotification(s.ticker, ` moved ${dir}${s.changePercent.toFixed(2)}% today!`);
      }
    });
  }

  function checkNewsAlerts(articles) {
    articles
      .filter((a) => a.confidence === "High" && a.sentiment !== "Neutral")
      .slice(0, 2)
      .forEach((a) => {
        const icon = a.sentiment === "Bullish" ? "📈" : "📉";
        fireNotification(a.ticker, ` ${icon} ${a.sentiment} — ${a.reason?.slice(0, 55)}...`);
      });
  }

  function showSaved() {
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }
  useEffect(() => {
    async function init() {
      setLoadingInit(true);
      const saved = await loadWatchlistFromDB(userEmail);
      if (saved.length === 0) { setLoadingInit(false); return; }

      //Fetch live prices for each saved ticker
      const results = await Promise.all(saved.map((s) => fetchStockPrice(s.ticker, s.name)));
      const valid   = results.filter(Boolean);
      setWatchlist(valid);
      checkPriceAlerts(valid);
      setLoadingInit(false);

      //Load news in background
      setLoadingNews(true);
      const allNews = await Promise.all(valid.map((s) => fetchNewsForTicker(s.ticker)));
      const flat    = allNews.flat().sort((a, b) => {
        const order = { Bearish: 0, Bullish: 1, Neutral: 2 };
        return (order[a.sentiment] ?? 2) - (order[b.sentiment] ?? 2);
      });
      setNews(flat);
      checkNewsAlerts(flat);
      setLoadingNews(false);
    }
    init();
  }, [userEmail]);

  //Add stock 
  const handleAddStock = useCallback(async (ticker, name) => {
    setError(null);
    const stock = await fetchStockPrice(ticker, name);
    if (!stock) {
      setError(`Could not load price for ${ticker}. Try again in a moment.`);
      return;
    }
    const updated = (prev) => [...prev, stock];
    setWatchlist((prev) => {
      const newList = [...prev, stock];
      saveWatchlistToDB(userEmail, newList).then(showSaved);
      return newList;
    });
    checkPriceAlerts([stock]);

    setLoadingNews(true);
    const stockNews = await fetchNewsForTicker(ticker);
    setNews((prev) => {
      const merged = [...stockNews, ...prev];
      merged.sort((a, b) => {
        const order = { Bearish: 0, Bullish: 1, Neutral: 2 };
        return (order[a.sentiment] ?? 2) - (order[b.sentiment] ?? 2);
      });
      return merged;
    });
    checkNewsAlerts(stockNews);
    setLoadingNews(false);
  }, [userEmail]);

  //Remove stock 
  const removeStock = useCallback((ticker) => {
    setWatchlist((prev) => {
      const newList = prev.filter((s) => s.ticker !== ticker);
      saveWatchlistToDB(userEmail, newList).then(showSaved);
      return newList;
    });
    setNews((prev) => prev.filter((n) => n.ticker !== ticker));
  }, [userEmail]);

  //Refresh prices 
  const refreshPrices = useCallback(async () => {
    if (!watchlist.length) return;
    setError(null);
    try {
      const results = await Promise.all(watchlist.map((s) => fetchStockPrice(s.ticker, s.name)));
      const valid   = results.filter(Boolean);
      if (valid.length > 0) {
        setWatchlist(valid);
        checkPriceAlerts(valid);
        setLastUpdated(new Date());
      } else {
        setError("Rate limit hit — wait 1 minute and try again.");
      }
    } catch {
      setError("Failed to refresh prices.");
    }
  }, [watchlist]);

  //Refresh news
  const refreshNews = useCallback(async () => {
    if (!watchlist.length) return;
    setLoadingNews(true);
    try {
      const allNews = await Promise.all(watchlist.map((s) => fetchNewsForTicker(s.ticker)));
      const flat    = allNews.flat().sort((a, b) => {
        const order = { Bearish: 0, Bullish: 1, Neutral: 2 };
        return (order[a.sentiment] ?? 2) - (order[b.sentiment] ?? 2);
      });
      setNews(flat);
      checkNewsAlerts(flat);
    } finally {
      setLoadingNews(false);
    }
  }, [watchlist]);

  //Auto-refresh prices every 60s, news every 5 min
  useEffect(() => {
    const p = setInterval(refreshPrices, 60000);
    const n = setInterval(refreshNews,   300000);
    return () => { clearInterval(p); clearInterval(n); };
  }, [refreshPrices, refreshNews]);

  const existingTickers = watchlist.map((s) => s.ticker);
  const bullishCount    = news.filter((n) => n.sentiment === "Bullish" && n.confidence === "High").length;
  const bearishCount    = news.filter((n) => n.sentiment === "Bearish" && n.confidence === "High").length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0b0e14; }
        .app { min-height: 100vh; background: #0b0e14; color: #e8eaf0; font-family: 'DM Sans', sans-serif; padding: 0 0 60px; }

        .header { background: #0f1219; border-bottom: 1px solid #1e2330; padding: 16px 28px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        .logo { font-family: 'Space Mono', monospace; font-size: 18px; font-weight: 700; color: #00e5a0; }
        .logo span { color: #4d7cff; }
        .api-note { font-size: 11px; color: #3a4060; font-family: 'Space Mono', monospace; margin-top: 2px; }
        .header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .user-pill { display: flex; align-items: center; gap: 8px; background: #131824; border: 1px solid #1e2330; border-radius: 20px; padding: 6px 14px; }
        .user-avatar { width: 24px; height: 24px; border-radius: 50%; background: #4d7cff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .user-email { font-size: 12px; color: #9aa3c0; font-family: 'Space Mono', monospace; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .signout-btn { background: none; border: 1px solid #2a3044; color: #4a5068; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
        .signout-btn:hover { border-color: #ff4d6a; color: #ff4d6a; }
        .last-updated { font-size: 11px; color: #4a5068; font-family: 'Space Mono', monospace; }
        .refresh-btn { background: #1a1f2e; border: 1px solid #2a3044; color: #00e5a0; padding: 7px 14px; border-radius: 6px; font-size: 12px; font-family: 'Space Mono', monospace; cursor: pointer; transition: all 0.15s; }
        .refresh-btn:hover { background: #222840; border-color: #00e5a0; }
        .saved-msg { font-size: 11px; color: #00e5a0; font-family: 'Space Mono', monospace; animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .main { max-width: 1100px; margin: 0 auto; padding: 32px 24px 0; }

        .search-section { margin-bottom: 28px; }
        .add-bar { display: flex; gap: 10px; }
        .add-input { flex: 1; background: #131824; border: 1px solid #1e2330; border-radius: 8px; padding: 13px 16px; color: #e8eaf0; font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; transition: border-color 0.15s; }
        .add-input::placeholder { color: #3a4060; }
        .add-input:focus { border-color: #4d7cff; }
        .add-btn { background: #4d7cff; border: none; border-radius: 8px; color: #fff; padding: 13px 22px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; white-space: nowrap; }
        .add-btn:hover { background: #3a68f0; }
        .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .search-error { color: #ff8fa0; font-size: 13px; margin-top: 10px; padding: 10px 14px; background: #2e0d16; border-radius: 6px; border: 1px solid #ff4d6a; }
        .search-results { margin-top: 10px; background: #131824; border: 1px solid #1e2330; border-radius: 10px; overflow: hidden; }
        .search-results-label { font-size: 11px; color: #4a5068; font-family: 'Space Mono', monospace; padding: 10px 16px 6px; }
        .search-result-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-top: 1px solid #1a1f2e; transition: background 0.15s; }
        .search-result-item:hover { background: #161c2a; }
        .search-result-item.already-added { opacity: 0.45; }
        .result-info { display: flex; align-items: center; gap: 12px; }
        .result-ticker { font-family: 'Space Mono', monospace; font-size: 13px; font-weight: 700; color: #4d7cff; min-width: 60px; }
        .result-name { font-size: 13px; color: #9aa3c0; }
        .result-add-btn { background: #1a1f2e; border: 1px solid #2a3044; color: #00e5a0; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .result-add-btn:hover:not(:disabled) { background: #222840; border-color: #00e5a0; }
        .result-add-btn:disabled { color: #4a5068; border-color: #1e2330; cursor: default; }

        .summary-bar { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .summary-pill { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; }
        .pill-bullish { background: #0d2e1f; color: #00e5a0; border: 1px solid #1a4d30; }
        .pill-bearish { background: #2e0d16; color: #ff4d6a; border: 1px solid #4d1a26; }
        .pill-neutral { background: #1a1f2e; color: #9aa3c0; border: 1px solid #2a3044; }

        .error-banner { background: #2e0d16; border: 1px solid #ff4d6a; border-radius: 8px; padding: 12px 16px; color: #ff8fa0; font-size: 13px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .error-dismiss { background: none; border: none; color: #ff4d6a; cursor: pointer; font-size: 14px; }

        .tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid #1e2330; }
        .tab-btn { background: none; border: none; color: #4a5068; padding: 10px 20px 12px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
        .tab-btn:hover { color: #9aa3c0; }
        .tab-btn.active { color: #00e5a0; border-bottom-color: #00e5a0; }
        .tab-badge { display: inline-block; background: #ff4d6a; color: #fff; border-radius: 10px; font-size: 10px; font-weight: 700; padding: 1px 6px; margin-left: 6px; vertical-align: middle; }

        .stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .stock-card { background: #131824; border: 1px solid #1e2330; border-radius: 12px; padding: 18px; transition: border-color 0.2s, transform 0.15s; }
        .stock-card:hover { border-color: #2a3448; transform: translateY(-2px); }
        .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .ticker-label { font-family: 'Space Mono', monospace; font-size: 15px; font-weight: 700; color: #4d7cff; }
        .stock-name { font-size: 11px; color: #4a5068; margin-top: 2px; }
        .remove-btn { background: none; border: none; color: #2a3044; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; transition: color 0.15s; line-height: 1; }
        .remove-btn:hover { color: #ff4d6a; }
        .card-bottom { display: flex; justify-content: space-between; align-items: flex-end; }
        .price { font-family: 'Space Mono', monospace; font-size: 20px; font-weight: 700; color: #e8eaf0; }
        .change-badge { font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; }
        .change-badge.up   { background: #0d2e1f; color: #00e5a0; }
        .change-badge.down { background: #2e0d16; color: #ff4d6a; }

        .skeleton { background: linear-gradient(90deg, #1a1f2e 25%, #222840 50%, #1a1f2e 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 4px; margin-bottom: 10px; }
        @keyframes shimmer { to { background-position: -200% 0; } }

        .news-feed { display: flex; flex-direction: column; gap: 10px; }
        .news-item { display: block; background: #131824; border: 1px solid #1e2330; border-radius: 8px; padding: 14px 16px; transition: background 0.15s; text-decoration: none; cursor: pointer; }
        .news-item:hover { background: #161c2a; }
        .news-ticker { font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; color: #4d7cff; background: #0d1630; padding: 2px 7px; border-radius: 4px; }
        .news-time { font-size: 11px; color: #4a5068; margin-left: auto; }
        .news-headline { font-size: 13px; color: #9aa3c0; line-height: 1.5; margin-bottom: 8px; }
        .ai-reason { font-size: 12px; color: #6a7490; line-height: 1.4; border-top: 1px solid #1e2330; padding-top: 8px; margin-top: 4px; }
        .ai-label { color: #4d7cff; font-weight: 600; }
        .ai-loading-note { text-align: center; padding: 16px; color: #4a5068; font-size: 13px; font-family: 'Space Mono', monospace; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .notif-banner { background: #0f1a2e; border: 1px solid #4d7cff; border-left: 4px solid #00e5a0; border-radius: 10px; padding: 12px 14px; animation: slideIn 0.25s ease; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        .notif-ticker { font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; color: #00e5a0; margin-right: 4px; }
        .notif-text { font-size: 12px; color: #9aa3c0; }
        .notif-close { background: none; border: none; color: #4a5068; cursor: pointer; font-size: 11px; flex-shrink: 0; }
        .notif-close:hover { color: #ff4d6a; }

        .empty-state { text-align: center; padding: 80px 20px; }
        .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.3; }
        .empty-title { font-size: 18px; font-weight: 600; color: #4a5068; margin-bottom: 8px; }
        .empty-sub { font-size: 13px; color: #3a4060; max-width: 360px; margin: 0 auto; line-height: 1.6; }
        .empty { text-align: center; padding: 60px 20px; color: #4a5068; font-size: 14px; }

        .init-loading { text-align: center; padding: 80px 20px; color: #4a5068; font-family: 'Space Mono', monospace; font-size: 13px; animation: pulse 1.5s infinite; }
      `}</style>

      <div className="app">
        <NotificationBanner
          notifications={notifications}
          onDismiss={(id) => setNotifications((n) => n.filter((x) => x.id !== id))}
        />

        <header className="header">
          <div>
            <div className="logo">stock<span>watch</span></div>
            <div className="api-note">Live prices · AI sentiment · Cloud sync</div>
          </div>
          <div className="header-right">
            {savedMsg && <span className="saved-msg">✓ Saved</span>}
            {watchlist.length > 0 && (
              <>
                <span className="last-updated">Updated {lastUpdated.toLocaleTimeString()}</span>
                <button className="refresh-btn" onClick={() => { refreshPrices(); refreshNews(); }}>⟳ Refresh</button>
              </>
            )}
            <div className="user-pill">
              <div className="user-avatar">{userEmail[0].toUpperCase()}</div>
              <span className="user-email">{userEmail}</span>
            </div>
            <button className="signout-btn" onClick={onSignOut}>Sign out</button>
          </div>
        </header>

        <main className="main">
          {error && (
            <div className="error-banner">
              <span>⚠ {error}</span>
              <button className="error-dismiss" onClick={() => setError(null)}>✕</button>
            </div>
          )}

          <SearchBar onAdd={handleAddStock} existingTickers={existingTickers} />

          {loadingInit ? (
            <div className="init-loading">⏳ Loading your saved watchlist...</div>
          ) : (
            <>
              {watchlist.length > 0 && (
                <>
                  {!loadingNews && news.length > 0 && (
                    <div className="summary-bar">
                      <div className="summary-pill pill-bullish">▲ {bullishCount} Bullish signals</div>
                      <div className="summary-pill pill-bearish">▼ {bearishCount} Bearish signals</div>
                      <div className="summary-pill pill-neutral">● {news.length - bullishCount - bearishCount} Neutral</div>
                    </div>
                  )}

                  <div className="tabs">
                    <button className={`tab-btn ${activeTab === "watchlist" ? "active" : ""}`} onClick={() => setActiveTab("watchlist")}>
                      Watchlist <span style={{ fontSize: 11, color: "#4a5068", marginLeft: 4 }}>({watchlist.length})</span>
                    </button>
                    <button className={`tab-btn ${activeTab === "news" ? "active" : ""}`} onClick={() => setActiveTab("news")}>
                      AI News Feed
                      {bearishCount > 0 && <span className="tab-badge">{bearishCount}</span>}
                    </button>
                  </div>

                  {activeTab === "watchlist" && (
                    <div className="stock-grid">
                      {watchlist.map((s) => <StockCard key={s.ticker} stock={s} onRemove={removeStock} />)}
                    </div>
                  )}

                  {activeTab === "news" && (
                    loadingNews
                      ? <LoadingNews />
                      : news.length === 0
                        ? <div className="empty">No news found yet — try refreshing.</div>
                        : <div className="news-feed">
                            {news.map((item, i) => <NewsItem key={i} item={item} />)}
                          </div>
                  )}
                </>
              )}

              {watchlist.length === 0 && <EmptyWatchlist />}
            </>
          )}
        </main>
      </div>
    </>
  );
}
