import { describe, it, expect } from "vitest";
import { getInitialAssets } from "../services/cryptoService";

describe("CRYPTracker Core Service", () => {
  it("loads default crypto assets with prices and symbols", () => {
    const assets = getInitialAssets();
    expect(assets.length).toBeGreaterThanOrEqual(4);
    const btc = assets.find(a => a.symbol === "BTC");
    expect(btc).toBeDefined();
    expect(btc?.price).toBeGreaterThan(0);
  });

  it("ensures sparklines have historical data points", () => {
    const assets = getInitialAssets();
    for (const a of assets) {
      expect(a.sparkline.length).toBeGreaterThan(0);
    }
  });
});
