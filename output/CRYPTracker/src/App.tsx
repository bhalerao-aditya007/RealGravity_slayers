import React, { useState, useEffect, useMemo } from 'react';
import { getInitialAssets, subscribeLivePrices, generateOrderBook } from './services/cryptoService';
import { CryptoAsset, TradeEntry, PriceAlert } from './types/crypto';

export function App() {
  const [assets, setAssets] = useState<CryptoAsset[]>(getInitialAssets());
  const [selectedId, setSelectedId] = useState<string>('bitcoin');
  const [search, setSearch] = useState('');
  const [filterFav, setFilterFav] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(['bitcoin', 'ethereum', 'solana']);
  const [activeInterval, setActiveInterval] = useState<'1H' | '24H' | '7D' | '1M'>('24H');
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'chart' | 'orderbook' | 'alerts'>('chart');
  const [alerts, setAlerts] = useState<PriceAlert[]>([
    { id: '1', assetId: 'bitcoin', targetPrice: 70000, condition: 'above', active: true },
    { id: '2', assetId: 'ethereum', targetPrice: 3400, condition: 'below', active: true }
  ]);
  const [newAlertPrice, setNewAlertPrice] = useState('');
  const [ping, setPing] = useState(24);

  useEffect(() => {
    const unsub = subscribeLivePrices(
      (latest) => setAssets(latest),
      (trade) => setTrades((prev) => [trade, ...prev.slice(0, 14)])
    );

    const pingTimer = setInterval(() => {
      setPing(Math.floor(18 + Math.random() * 12));
    }, 3000);

    return () => {
      unsub();
      clearInterval(pingTimer);
    };
  }, []);

  const selected = assets.find((a) => a.id === selectedId) || assets[0];
  const orderBook = useMemo(() => generateOrderBook(selected.price), [selected.price]);

  const filtered = assets.filter((a) => {
    const matchSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.symbol.toLowerCase().includes(search.toLowerCase());
    const matchFav = !filterFav || favorites.includes(a.id);
    return matchSearch && matchFav;
  });

  const toggleFav = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(newAlertPrice);
    if (!p) return;
    setAlerts((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        assetId: selected.id,
        targetPrice: p,
        condition: p >= selected.price ? 'above' : 'below',
        active: true,
      },
    ]);
    setNewAlertPrice('');
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-black">
      {/* 1. Global Market Stats Ticker */}
      <div className="h-8 bg-[#0C1017] border-b border-slate-800/80 px-6 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Cryptos:</span>
            <span className="text-slate-200 font-semibold">2.4M+</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Market Cap:</span>
            <span className="text-slate-200 font-semibold">$2.58T</span>
            <span className="text-emerald-400 font-bold">+2.4%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">24h Vol:</span>
            <span className="text-slate-200 font-semibold">$94.2B</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Dominance:</span>
            <span className="text-amber-400 font-semibold">BTC 54.8%</span>
            <span className="text-blue-400 font-semibold">ETH 16.2%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">ETH Gas:</span>
            <span className="text-emerald-400 font-semibold">14 Gwei</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            WS Active ({ping}ms)
          </span>
        </div>
      </div>

      {/* 2. Top Header Bar */}
      <header className="h-16 border-b border-slate-800/80 bg-[#0C1017]/90 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-orange-500/25">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-lg tracking-wide text-white">CRYPTracker <span className="text-amber-400">PRO</span></h1>
              <span className="text-[10px] font-mono bg-amber-400/15 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded font-bold">
                ENTERPRISE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Multi-Exchange Real-Time Liquidity & Price Matrix</p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search coin (BTC, ETH, SOL)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#111722] border border-slate-700/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 w-64 shadow-inner"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-white">
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => setFilterFav(!filterFav)}
            className={`px-3 py-1.5 text-xs rounded-xl font-semibold transition-all flex items-center gap-1.5 border ${
              filterFav
                ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md shadow-amber-400/20'
                : 'bg-[#111722] border-slate-700/80 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
            }`}
          >
            <span>★</span>
            <span>Starred ({favorites.length})</span>
          </button>
        </div>
      </header>

      {/* 3. Main Dashboard Layout */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* Left Column: Asset Market Feed (Col 1-3) */}
        <aside className="col-span-12 lg:col-span-3 border-r border-slate-800/80 bg-[#0C1017]/50 flex flex-col h-[calc(100vh-6rem)]">
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Market Instruments</span>
            <span className="text-[10px] font-mono text-slate-500">{filtered.length} pairs listed</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filtered.map((coin) => {
              const isSelected = coin.id === selectedId;
              const isPositive = coin.change24h >= 0;
              return (
                <div
                  key={coin.id}
                  onClick={() => setSelectedId(coin.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-[#17202F] border-amber-400/60 shadow-lg shadow-amber-400/5'
                      : 'bg-[#111722]/80 border-slate-800/60 hover:border-slate-700 hover:bg-[#17202F]/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => toggleFav(coin.id, e)}
                        className={`text-sm ${favorites.includes(coin.id) ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
                      >
                        ★
                      </button>
                      <div>
                        <div className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                          {coin.name}
                          <span className="text-[10px] font-mono text-slate-400 font-normal">{coin.symbol}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="font-bold text-sm text-slate-100">
                        ${coin.price.toLocaleString(undefined, { minimumFractionDigits: coin.price < 1 ? 4 : 2 })}
                      </div>
                      <div className={`text-[11px] font-semibold flex items-center justify-end gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '▲ +' : '▼ '}{coin.change24h}%
                      </div>
                    </div>
                  </div>

                  {/* Micro Sparkline Preview */}
                  <div className="h-6 w-full flex items-end gap-1 pt-1 opacity-70">
                    {coin.sparkline.map((val, idx) => {
                      const min = Math.min(...coin.sparkline);
                      const max = Math.max(...coin.sparkline);
                      const range = max - min || 1;
                      const h = Math.max(15, Math.min(100, ((val - min) / range) * 100));
                      return (
                        <div
                          key={idx}
                          style={{ height: `${h}%` }}
                          className={`flex-1 rounded-t ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Column: Active Terminal & Charts (Col 4-9) */}
        <main className="col-span-12 lg:col-span-6 flex flex-col h-[calc(100vh-6rem)] overflow-y-auto border-r border-slate-800/80 bg-[#07090E]">
          {/* Header Instrument Bar */}
          <div className="p-6 border-b border-slate-800/80 bg-[#0C1017]/80 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">PERPETUAL TICKER</span>
                  <span className="text-[11px] font-mono text-slate-400">· Binance / CoinGecko Synced</span>
                </div>
                <h2 className="text-3xl font-black text-white mt-1 flex items-center gap-3">
                  {selected.name}
                  <span className="text-sm font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                    {selected.symbol}/USD
                  </span>
                </h2>
              </div>

              <div className="text-right font-mono">
                <div className="text-4xl font-black text-amber-400 tracking-tight">
                  ${selected.price.toLocaleString(undefined, { minimumFractionDigits: selected.price < 1 ? 4 : 2 })}
                </div>
                <div className={`text-sm font-bold mt-1 flex items-center justify-end gap-1.5 ${selected.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className={`px-2 py-0.5 rounded text-xs ${selected.change24h >= 0 ? 'bg-emerald-500/15' : 'bg-rose-500/15'}`}>
                    {selected.change24h >= 0 ? '▲ +' : '▼ '}{selected.change24h}% (24h)
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-4 gap-3 mt-6">
              <div className="bg-[#111722] p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400 uppercase">24h High</div>
                <div className="font-mono font-bold text-sm text-slate-100 mt-0.5">
                  ${selected.high24h.toLocaleString(undefined, { minimumFractionDigits: selected.price < 1 ? 4 : 2 })}
                </div>
              </div>
              <div className="bg-[#111722] p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400 uppercase">24h Low</div>
                <div className="font-mono font-bold text-sm text-slate-100 mt-0.5">
                  ${selected.low24h.toLocaleString(undefined, { minimumFractionDigits: selected.price < 1 ? 4 : 2 })}
                </div>
              </div>
              <div className="bg-[#111722] p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400 uppercase">24h Volume</div>
                <div className="font-mono font-bold text-sm text-slate-100 mt-0.5">
                  ${(selected.volume24h / 1e9).toFixed(2)}B
                </div>
              </div>
              <div className="bg-[#111722] p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Market Cap</div>
                <div className="font-mono font-bold text-sm text-amber-300 mt-0.5">
                  ${(selected.marketCap / 1e9).toFixed(1)}B
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Chart & Sub-Tabs */}
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5 bg-[#111722] p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('chart')}
                  className={`px-3 py-1 text-xs rounded-lg font-bold transition-all ${
                    activeTab === 'chart' ? 'bg-amber-400 text-black shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Live Wave Chart
                </button>
                <button
                  onClick={() => setActiveTab('orderbook')}
                  className={`px-3 py-1 text-xs rounded-lg font-bold transition-all ${
                    activeTab === 'orderbook' ? 'bg-amber-400 text-black shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Order Depth
                </button>
                <button
                  onClick={() => setActiveTab('alerts')}
                  className={`px-3 py-1 text-xs rounded-lg font-bold transition-all ${
                    activeTab === 'alerts' ? 'bg-amber-400 text-black shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Alerts ({alerts.length})
                </button>
              </div>

              {/* Interval Buttons */}
              <div className="flex items-center gap-1 font-mono text-xs">
                {(['1H', '24H', '7D', '1M'] as const).map((inv) => (
                  <button
                    key={inv}
                    onClick={() => setActiveInterval(inv)}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      activeInterval === inv ? 'bg-slate-700 text-amber-400 font-bold' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {inv}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 1: Live Interactive SVG Chart */}
            {activeTab === 'chart' && (
              <div className="flex-1 bg-[#0C1017] rounded-2xl border border-slate-800/80 p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center z-10">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span className="text-xs font-mono font-bold text-slate-300 uppercase">Live High-Frequency Tick Wave</span>
                  </div>
                  <span className="text-xs font-mono text-slate-500">Interval: {activeInterval} · Auto-scaling</span>
                </div>

                {/* SVG Visualizer */}
                <div className="h-64 w-full flex items-end gap-3 pt-8 pb-4 relative z-10">
                  {selected.sparkline.map((val, idx) => {
                    const min = Math.min(...selected.sparkline);
                    const max = Math.max(...selected.sparkline);
                    const range = max - min || 1;
                    const heightPercent = Math.max(12, Math.min(95, ((val - min) / range) * 100));
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-amber-500/30 via-amber-400/70 to-amber-300 rounded-t-lg transition-all duration-300 group-hover:from-amber-400 group-hover:to-amber-200 group-hover:shadow-lg group-hover:shadow-amber-400/20"
                        />
                        <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          ${val}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-800 pt-3 flex justify-between text-xs font-mono text-slate-500">
                  <span>Low: ${selected.low24h}</span>
                  <span className="text-amber-400 font-bold">Current: ${selected.price}</span>
                  <span>High: ${selected.high24h}</span>
                </div>
              </div>
            )}

            {/* Tab 2: Order Depth Ladder */}
            {activeTab === 'orderbook' && (
              <div className="flex-1 bg-[#0C1017] rounded-2xl border border-slate-800/80 p-5 font-mono text-xs">
                <div className="grid grid-cols-2 gap-6">
                  {/* Bids */}
                  <div>
                    <div className="font-bold text-emerald-400 mb-2 pb-1 border-b border-slate-800 flex justify-between">
                      <span>BID PRICE (USD)</span>
                      <span>AMOUNT ({selected.symbol})</span>
                    </div>
                    <div className="space-y-1.5">
                      {orderBook.bids.map((b, i) => (
                        <div key={i} className="flex justify-between relative py-0.5">
                          <div
                            style={{ width: `${Math.min(100, b.total * 30)}%` }}
                            className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 -z-0"
                          />
                          <span className="text-emerald-400 font-semibold z-10">${b.price}</span>
                          <span className="text-slate-300 z-10">{b.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Asks */}
                  <div>
                    <div className="font-bold text-rose-400 mb-2 pb-1 border-b border-slate-800 flex justify-between">
                      <span>ASK PRICE (USD)</span>
                      <span>AMOUNT ({selected.symbol})</span>
                    </div>
                    <div className="space-y-1.5">
                      {orderBook.asks.map((a, i) => (
                        <div key={i} className="flex justify-between relative py-0.5">
                          <div
                            style={{ width: `${Math.min(100, a.total * 30)}%` }}
                            className="absolute left-0 top-0 bottom-0 bg-rose-500/10 -z-0"
                          />
                          <span className="text-rose-400 font-semibold z-10">${a.price}</span>
                          <span className="text-slate-300 z-10">{a.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Alerts Engine */}
            {activeTab === 'alerts' && (
              <div className="flex-1 bg-[#0C1017] rounded-2xl border border-slate-800/80 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-200 mb-4">Configured Price Triggers for {selected.name}</h3>
                  <div className="space-y-2">
                    {alerts.map((al) => (
                      <div
                        key={al.id}
                        className="bg-[#111722] border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400">🔔</span>
                          <span>Trigger when {al.assetId} goes <b>{al.condition.toUpperCase()}</b> ${al.targetPrice}</span>
                        </div>
                        <span className="text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded">ACTIVE</span>
                      </div>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleAddAlert} className="flex items-center gap-3 pt-4 border-t border-slate-800">
                  <input
                    type="number"
                    step="any"
                    value={newAlertPrice}
                    onChange={(e) => setNewAlertPrice(e.target.value)}
                    placeholder={`Target price for ${selected.symbol}...`}
                    className="flex-1 bg-[#111722] border border-slate-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                  <button
                    type="submit"
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md shadow-amber-400/20"
                  >
                    Set Live Alert
                  </button>
                </form>
              </div>
            )}
          </div>
        </main>

        {/* Right Column: Live Stream Trades & Execution Log (Col 10-12) */}
        <aside className="col-span-12 lg:col-span-3 bg-[#0C1017]/50 flex flex-col h-[calc(100vh-6rem)]">
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Real-Time Trades</span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Streaming
            </span>
          </div>

          <div className="p-3 font-mono text-[11px] text-slate-500 border-b border-slate-800 flex justify-between">
            <span>PRICE</span>
            <span>QTY</span>
            <span>TIME</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
            {trades.map((t) => (
              <div
                key={t.id}
                className={`flex justify-between items-center p-2 rounded-lg transition-colors ${
                  t.side === 'buy' ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'bg-rose-500/5 hover:bg-rose-500/10'
                }`}
              >
                <span className={`font-bold ${t.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${t.price}
                </span>
                <span className="text-slate-300">{t.amount} {t.symbol}</span>
                <span className="text-slate-500 text-[10px]">{t.time}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
