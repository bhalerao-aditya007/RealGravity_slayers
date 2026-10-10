import { CryptoAsset, OrderBookEntry, TradeEntry } from '../types/crypto';

export const INITIAL_ASSETS: CryptoAsset[] = [
  {
    id: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    price: 68420.50,
    change24h: 3.42,
    high24h: 69200.00,
    low24h: 66100.00,
    volume24h: 28400000000,
    marketCap: 1348000000000,
    sparkline: [66200, 66450, 66900, 66800, 67200, 67800, 68100, 67950, 68420]
  },
  {
    id: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    price: 3484.30,
    change24h: -1.15,
    high24h: 3580.00,
    low24h: 3410.00,
    volume24h: 14200000000,
    marketCap: 418000000000,
    sparkline: [3520, 3540, 3510, 3470, 3490, 3460, 3440, 3475, 3484]
  },
  {
    id: 'solana',
    symbol: 'SOL',
    name: 'Solana',
    price: 178.65,
    change24h: 7.82,
    high24h: 182.50,
    low24h: 164.00,
    volume24h: 4200000000,
    marketCap: 83000000000,
    sparkline: [165, 167, 171, 169, 173, 175, 174, 177, 178.65]
  },
  {
    id: 'binancecoin',
    symbol: 'BNB',
    name: 'BNB',
    price: 588.40,
    change24h: 0.85,
    high24h: 595.00,
    low24h: 580.00,
    volume24h: 1100000000,
    marketCap: 87000000000,
    sparkline: [582, 583, 587, 584, 588, 586, 587, 588, 588.40]
  },
  {
    id: 'ripple',
    symbol: 'XRP',
    name: 'XRP',
    price: 0.5824,
    change24h: 2.15,
    high24h: 0.6010,
    low24h: 0.5650,
    volume24h: 920000000,
    marketCap: 32500000000,
    sparkline: [0.570, 0.568, 0.574, 0.578, 0.576, 0.581, 0.579, 0.582, 0.5824]
  },
  {
    id: 'cardano',
    symbol: 'ADA',
    name: 'Cardano',
    price: 0.465,
    change24h: -0.45,
    high24h: 0.482,
    low24h: 0.455,
    volume24h: 380000000,
    marketCap: 16600000000,
    sparkline: [0.47, 0.468, 0.472, 0.469, 0.466, 0.464, 0.467, 0.465]
  },
  {
    id: 'avalanche',
    symbol: 'AVAX',
    name: 'Avalanche',
    price: 31.40,
    change24h: 4.60,
    high24h: 32.80,
    low24h: 29.50,
    volume24h: 540000000,
    marketCap: 12400000000,
    sparkline: [29.8, 30.2, 30.7, 30.4, 31.0, 31.2, 31.4]
  }
];

export function getInitialAssets(): CryptoAsset[] {
  return [...INITIAL_ASSETS];
}

export function generateOrderBook(basePrice: number): { bids: OrderBookEntry[]; asks: OrderBookEntry[] } {
  const bids: OrderBookEntry[] = [];
  const asks: OrderBookEntry[] = [];
  let bidTotal = 0;
  let askTotal = 0;

  for (let i = 1; i <= 6; i++) {
    const bPrice = Number((basePrice * (1 - i * 0.0008)).toFixed(basePrice < 1 ? 4 : 2));
    const bAmount = Number((Math.random() * (basePrice > 1000 ? 1.5 : 25) + 0.1).toFixed(3));
    bidTotal += bAmount;
    bids.push({ price: bPrice, amount: bAmount, total: Number(bidTotal.toFixed(3)) });

    const aPrice = Number((basePrice * (1 + i * 0.0008)).toFixed(basePrice < 1 ? 4 : 2));
    const aAmount = Number((Math.random() * (basePrice > 1000 ? 1.5 : 25) + 0.1).toFixed(3));
    askTotal += aAmount;
    asks.push({ price: aPrice, amount: aAmount, total: Number(askTotal.toFixed(3)) });
  }

  return { bids, asks };
}

export function subscribeLivePrices(
  onAssets: (assets: CryptoAsset[]) => void,
  onTrade: (trade: TradeEntry) => void
) {
  let assets = [...INITIAL_ASSETS];

  const interval = setInterval(() => {
    const targetIdx = Math.floor(Math.random() * assets.length);
    const target = assets[targetIdx];
    const deltaPercent = (Math.random() - 0.485) * 0.006;
    const newPrice = Number((target.price * (1 + deltaPercent)).toFixed(target.price < 1 ? 4 : 2));

    assets = assets.map((a, i) => {
      if (i !== targetIdx) return a;
      const spark = [...a.sparkline.slice(1), newPrice];
      return {
        ...a,
        price: newPrice,
        change24h: Number((a.change24h + deltaPercent * 15).toFixed(2)),
        high24h: Math.max(a.high24h, newPrice),
        low24h: Math.min(a.low24h, newPrice),
        sparkline: spark,
      };
    });

    onAssets(assets);

    onTrade({
      id: Math.random().toString(36).substring(7),
      symbol: target.symbol,
      price: newPrice,
      amount: Number((Math.random() * (target.price > 1000 ? 0.8 : 12) + 0.05).toFixed(4)),
      side: deltaPercent >= 0 ? 'buy' : 'sell',
      time: new Date().toLocaleTimeString(),
    });
  }, 950);

  return () => clearInterval(interval);
}
