import type { LucideIcon } from "lucide-react";
import { Calculator, Crown, Landmark, Map, Megaphone, ShieldCheck, Store, TrendingUp, Truck, Users } from "lucide-react";
import type { RoleId } from "@/lib/contracts";

export const ROLE_ICONS: Record<RoleId, LucideIcon> = {
  ceo: Crown,
  cfo: Landmark,
  sales_director: TrendingUp,
  sales_rsm: Map,
  sales_rep: Store,
  marketing_lead: Megaphone,
  supply_planner: Truck,
  finance_analyst: Calculator,
  hr_manager: Users,
  it_admin: ShieldCheck,
};
