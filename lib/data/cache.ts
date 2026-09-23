import {
  buildFinance, buildForecastAccuracy, buildHr, buildInventory, buildMarketing, buildProduction, buildSalesCube,
  type FinanceTables, type ForecastAccuracyTables, type HrTables, type InventoryTables, type MarketingTables,
  type ProductionTables, type SalesCube,
} from "./generator";
import { buildMarketShare, type MarketTables } from "./market-share";

type Slot<T> = { value: T | null; buildMs: number };

const sales: Slot<SalesCube> = { value: null, buildMs: 0 };
const inventory: Slot<InventoryTables> = { value: null, buildMs: 0 };
const production: Slot<ProductionTables> = { value: null, buildMs: 0 };
const marketing: Slot<MarketingTables> = { value: null, buildMs: 0 };
const finance: Slot<FinanceTables> = { value: null, buildMs: 0 };
const hr: Slot<HrTables> = { value: null, buildMs: 0 };
const forecastAccuracy: Slot<ForecastAccuracyTables> = { value: null, buildMs: 0 };
const market: Slot<MarketTables> = { value: null, buildMs: 0 };

function fill<T>(slot: Slot<T>, build: () => T): T {
  if (slot.value) return slot.value;
  const started = performance.now();
  slot.value = build();
  slot.buildMs = performance.now() - started;
  return slot.value;
}

/** The sell-in / sell-out / target cube, built once per process. */
export function salesCube(): SalesCube {
  return fill(sales, buildSalesCube);
}

export function inventoryTables(): InventoryTables {
  return fill(inventory, () => buildInventory(salesCube()));
}

export function productionTables(): ProductionTables {
  return fill(production, buildProduction);
}

export function marketingTables(): MarketingTables {
  return fill(marketing, buildMarketing);
}

export function financeTables(): FinanceTables {
  return fill(finance, () => buildFinance(salesCube()));
}

export function hrTables(): HrTables {
  return fill(hr, buildHr);
}

export function forecastAccuracyTables(): ForecastAccuracyTables {
  return fill(forecastAccuracy, buildForecastAccuracy);
}

export function marketTables(): MarketTables {
  return fill(market, () => buildMarketShare(salesCube()));
}

export function warmAll(): void {
  salesCube();
  inventoryTables();
  productionTables();
  marketingTables();
  financeTables();
  hrTables();
  forecastAccuracyTables();
  marketTables();
}

export function buildTimings(): Record<string, number> {
  return {
    sales: sales.buildMs,
    inventory: inventory.buildMs,
    production: production.buildMs,
    marketing: marketing.buildMs,
    finance: finance.buildMs,
    hr: hr.buildMs,
    forecastAccuracy: forecastAccuracy.buildMs,
    market: market.buildMs,
  };
}

export function resetCaches(): void {
  for (const slot of [sales, inventory, production, marketing, finance, hr, forecastAccuracy, market]) {
    slot.value = null;
    slot.buildMs = 0;
  }
}
