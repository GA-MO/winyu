import {
  buildFinance, buildForecastAccuracy, buildHr, buildInventory, buildMarketing, buildProduction, buildSalesCube,
  type FinanceTables, type ForecastAccuracyTables, type HrTables, type InventoryTables, type MarketingTables,
  type ProductionTables, type SalesCube,
} from "./generator";
import { buildMarketShare, type MarketTables } from "./market-share";

type Slot<T> = { value: T | null };

const sales: Slot<SalesCube> = { value: null };
const inventory: Slot<InventoryTables> = { value: null };
const production: Slot<ProductionTables> = { value: null };
const marketing: Slot<MarketingTables> = { value: null };
const finance: Slot<FinanceTables> = { value: null };
const hr: Slot<HrTables> = { value: null };
const forecastAccuracy: Slot<ForecastAccuracyTables> = { value: null };
const market: Slot<MarketTables> = { value: null };

function fill<T>(slot: Slot<T>, build: () => T): T {
  if (slot.value) return slot.value;
  slot.value = build();
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
