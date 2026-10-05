import type { Brand, BusinessUnit, Region } from "./identity";

type Named = { id: string; nameTh: string; label: string };

/** The warehouse's dimension tables: every entity a metric can be split or filtered by, with just what Winyu reads from it. */
export type MasterData = {
  regions: { id: Region; nameTh: string }[];
  businessUnits: { id: BusinessUnit; nameTh: string }[];
  provinces: { id: string; nameTh: string; region: Region }[];
  agents: { id: string; nameTh: string; provinceId: string; region: Region; servingDc: string }[];
  brands: { id: Brand; nameTh: string; label: string; nicknames: string[]; businessUnit: BusinessUnit }[];
  packs: { id: string; nameTh: string }[];
  skus: { id: string; nameTh: string; label: string; brand: Brand; pack: string }[];
  dcs: (Named & { region: Region })[];
  plants: (Named & { region: Region })[];
  campaigns: Named[];
  departments: (Named & { headcount: number })[];
  channels: Named[];
  chains: Named[];
  makers: (Named & { nicknames: string[] })[];
  ownMaker: string;
};
