import { useState, useEffect, useCallback } from "react";

// ── Demo data (replace with real API calls later) ──────────────────────────
const DEMO_STOCKS = [
  { ticker: "TTWO", name: "Take-Two Interactive", price: 227.70, change: -4.42, changePercent: -1.90 },
  { ticker: "NVDA", name: "Nvidia",               price: 135.58, change:  2.31, changePercent:  1.73 },
  { ticker: "MSFT", name: "Microsoft",            price: 461.20, change:  1.05, changePercent:  0.23 },
  { ticker: "LLY",  name: "Eli Lilly",            price: 798.44, change: -3.12, changePercent: -0.39 },
  { ticker: "AMZN", name: "Amazon",               price: 201.33, change:  0.88, changePercent:  0.44 },
];

const DEMO_NEWS = [
  { ticker: "TTWO", headline: "Take-Two confirms GTA VI launch date: November 19, 2026", time: "2h ago",  type: "major" },
  { ticker: "NVDA", headline: "Nvidia beats Q1 earnings — data center revenue up 23% YoY",  time: "4h ago",  type: "major" },
  { ticker: "MSFT", headline: "Microsoft Azure cloud growth accelerates in latest quarter",   time: "6h ago",  type: "normal" },
  { ticker: "LLY",  headline: "FDA grants priority review to Eli Lilly's new GLP-1 drug",   time: "1d ago",  type: "major" },
  { ticker: "AMZN", headline: "Amazon expands same-day delivery to 15 new cities",           time: "1d ago",  type: "normal" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function formatPrice(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ── Sub-components ─────────────────────────────────────────────────────────
function NotificationBanner({ notifications, onDismiss }) {
  if (!notifications.length) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
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

function NewsItem({ item }) {
  return (
    <div className={`news-item ${item.type === "major" ? "news-major" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="news-ticker">{item.ticker}</span>
        {item.type === "major" && <span className="major-badge">● MAJOR</span>}
        <span className="news-time">{item.time}</span>
      </div>
      <div className="news-headline">{item.headline}</div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function StockTracker() {
  const [watchlist, setWatchlist]       = useState(DEMO_STOCKS);
  const [news, setNews]                 = useState(DEMO_NEWS);
  const [notifications, setNotifications] = useState([]);
  const [input, setInput]               = useState("");
  const [activeTab, setActiveTab]       = useState("watchlist");
  const [lastUpdated, setLastUpdated]   = useState(new Date());
  const [notifCount, setNotifCount]     = useState(0);

  // Simulate a price refresh
  const refreshPrices = useCallback(() => {
    setWatchlist((prev) =>
      prev.map((s) => {
        const delta = (Math.random() - 0.48) * 3;
        const newPrice = Math.max(1, s.price + delta);
        const pct = (delta / s.price) * 100;
        // Fire notification if big move
        if (Math.abs(pct) > 1.5) {
          const id = Date.now() + Math.random();
          setNotifCount((c) => c + 1);
          setNotifications((n) => [
            ...n.slice(-3),
            { id, ticker: s.ticker, msg: ` moved ${pct > 0 ? "+" : ""}${pct.toFixed(2)}% — check your position!` },
          ]);
          setTimeout(() => setNotifications((n) => n.filter((x) => x.id !== id)), 5000);
        }
        return { ...s, price: newPrice, change: delta, changePercent: pct };
      })
    );
    setLastUpdated(new Date());
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(refreshPrices, 30000);
    return () => clearInterval(id);
  }, [refreshPrices]);

  const addStock = () => {
    const t = input.trim().toUpperCase();
    if (!t || watchlist.find((s) => s.ticker === t)) { setInput(""); return; }
    const newStock = { ticker: t, name: t, price: 100 + Math.random() * 200, change: 0, changePercent: 0 };
    setWatchlist((prev) => [...prev, newStock]);
    setInput("");
  };

  const removeStock = (ticker) => setWatchlist((prev) => prev.filter((s) => s.ticker !== ticker));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #0b0e14; }

        .app {
          min-height: 100vh;
          background: #0b0e14;
          color: #e8eaf0;
          font-family: 'DM Sans', sans-serif;
          padding: 0 0 60px;
        }

        /* ── Header ── */
        .header {
          background: #0f1219;
          border-bottom: 1px solid #1e2330;
          padding: 18px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .logo {
          font-family: 'Space Mono', monospace;
          font-size: 18px;
          font-weight: 700;
          color: #00e5a0;
          letter-spacing: -0.5px;
        }
        .logo span { color: #4d7cff; }
        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .last-updated {
          font-size: 11px;
          color: #4a5068;
          font-family: 'Space Mono', monospace;
        }
        .refresh-btn {
          background: #1a1f2e;
          border: 1px solid #2a3044;
          color: #00e5a0;
          padding: 7px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-family: 'Space Mono', monospace;
          cursor: pointer;
          transition: all 0.15s;
        }
        .refresh-btn:hover { background: #222840; border-color: #00e5a0; }

        /* ── Main layout ── */
        .main { max-width: 1100px; margin: 0 auto; padding: 32px 24px 0; }

        /* ── Add stock bar ── */
        .add-bar {
          display: flex;
          gap: 10px;
          margin-bottom: 32px;
        }
        .add-input {
          flex: 1;
          background: #131824;
          border: 1px solid #1e2330;
          border-radius: 8px;
          padding: 12px 16px;
          color: #e8eaf0;
          font-family: 'Space Mono', monospace;
          font-size: 14px;
          text-transform: uppercase;
          outline: none;
          transition: border-color 0.15s;
          max-width: 260px;
        }
        .add-input::placeholder { color: #3a4060; text-transform: none; }
        .add-input:focus { border-color: #4d7cff; }
        .add-btn {
          background: #4d7cff;
          border: none;
          border-radius: 8px;
          color: #fff;
          padding: 12px 22px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .add-btn:hover { background: #3a68f0; }

        /* ── Tabs ── */
        .tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 24px;
          border-bottom: 1px solid #1e2330;
        }
        .tab-btn {
          background: none;
          border: none;
          color: #4a5068;
          padding: 10px 20px 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.15s;
        }
        .tab-btn:hover { color: #9aa3c0; }
        .tab-btn.active { color: #00e5a0; border-bottom-color: #00e5a0; }
        .tab-badge {
          display: inline-block;
          background: #ff4d6a;
          color: #fff;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          margin-left: 6px;
          vertical-align: middle;
        }

        /* ── Stock grid ── */
        .stock-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }
        .stock-card {
          background: #131824;
          border: 1px solid #1e2330;
          border-radius: 12px;
          padding: 18px;
          transition: border-color 0.2s, transform 0.15s;
          position: relative;
        }
        .stock-card:hover { border-color: #2a3448; transform: translateY(-2px); }
        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .ticker-label {
          font-family: 'Space Mono', monospace;
          font-size: 15px;
          font-weight: 700;
          color: #4d7cff;
        }
        .stock-name {
          font-size: 11px;
          color: #4a5068;
          margin-top: 2px;
        }
        .remove-btn {
          background: none;
          border: none;
          color: #2a3044;
          cursor: pointer;
          font-size: 12px;
          padding: 2px 4px;
          border-radius: 4px;
          transition: color 0.15s;
          line-height: 1;
        }
        .remove-btn:hover { color: #ff4d6a; }
        .card-bottom { display: flex; justify-content: space-between; align-items: flex-end; }
        .price {
          font-family: 'Space Mono', monospace;
          font-size: 20px;
          font-weight: 700;
          color: #e8eaf0;
        }
        .change-badge {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .change-badge.up   { background: #0d2e1f; color: #00e5a0; }
        .change-badge.down { background: #2e0d16; color: #ff4d6a; }

        /* ── News feed ── */
        .news-feed { display: flex; flex-direction: column; gap: 10px; }
        .news-item {
          background: #131824;
          border: 1px solid #1e2330;
          border-left: 3px solid #1e2330;
          border-radius: 8px;
          padding: 14px 16px;
          transition: border-color 0.15s;
        }
        .news-item:hover { border-left-color: #4d7cff; }
        .news-major { border-left-color: #ff4d6a !important; }
        .news-ticker {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          color: #4d7cff;
          background: #0d1630;
          padding: 2px 7px;
          border-radius: 4px;
        }
        .major-badge {
          font-size: 10px;
          font-weight: 700;
          color: #ff4d6a;
          letter-spacing: 0.5px;
        }
        .news-time { font-size: 11px; color: #4a5068; margin-left: auto; }
        .news-headline { font-size: 13px; color: #9aa3c0; line-height: 1.5; }

        /* ── Notification banner ── */
        .notif-banner {
          background: #0f1a2e;
          border: 1px solid #4d7cff;
          border-left: 4px solid #00e5a0;
          border-radius: 10px;
          padding: 12px 14px;
          animation: slideIn 0.25s ease;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .notif-ticker {
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          font-weight: 700;
          color: #00e5a0;
          margin-right: 4px;
        }
        .notif-text { font-size: 12px; color: #9aa3c0; }
        .notif-close {
          background: none;
          border: none;
          color: #4a5068;
          cursor: pointer;
          font-size: 11px;
          flex-shrink: 0;
          padding: 0 2px;
        }
        .notif-close:hover { color: #ff4d6a; }

        /* ── Empty state ── */
        .empty {
          text-align: center;
          padding: 60px 20px;
          color: #4a5068;
          font-size: 14px;
        }
        .empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.4; }
      `}</style>

      <div className="app">
        <NotificationBanner notifications={notifications} onDismiss={(id) => setNotifications((n) => n.filter((x) => x.id !== id))} />

        {/* Header */}
        <header className="header">
          <div className="logo">stock<span>watch</span></div>
          <div className="header-right">
            <span className="last-updated">Updated {lastUpdated.toLocaleTimeString()}</span>
            <button className="refresh-btn" onClick={refreshPrices}>⟳ Refresh</button>
          </div>
        </header>

        <main className="main">
          {/* Add stock */}
          <div className="add-bar">
            <input
              className="add-input"
              placeholder="Add ticker (e.g. TTWO)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStock()}
            />
            <button className="add-btn" onClick={addStock}>+ Add Stock</button>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button className={`tab-btn ${activeTab === "watchlist" ? "active" : ""}`} onClick={() => setActiveTab("watchlist")}>
              Watchlist <span style={{ fontSize: 11, color: "#4a5068", marginLeft: 4 }}>({watchlist.length})</span>
            </button>
            <button className={`tab-btn ${activeTab === "news" ? "active" : ""}`} onClick={() => setActiveTab("news")}>
              News Feed
              {notifCount > 0 && <span className="tab-badge">{notifCount}</span>}
            </button>
          </div>

          {/* Watchlist tab */}
          {activeTab === "watchlist" && (
            watchlist.length === 0
              ? <div className="empty"><div className="empty-icon">📈</div>No stocks yet — add a ticker above</div>
              : <div className="stock-grid">
                  {watchlist.map((s) => <StockCard key={s.ticker} stock={s} onRemove={removeStock} />)}
                </div>
          )}

          {/* News tab */}
          {activeTab === "news" && (
            news.length === 0
              ? <div className="empty"><div className="empty-icon">📰</div>No news yet</div>
              : <div className="news-feed">
                  {news.map((item, i) => <NewsItem key={i} item={item} />)}
                </div>
          )}
        </main>
      </div>
    </>
  );
}
