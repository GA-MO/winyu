export type Department = {
  id: string; nameTh: string; label: string;
  baseHeadcount: number; monthlyGrowth: number; attritionBase: number; avgSalaryThb: number;
};

export const DEPARTMENTS: readonly Department[] = [
  { id: "dept_sales", nameTh: "ขาย", label: "Sales", baseHeadcount: 1240, monthlyGrowth: 0.0035, attritionBase: 0.014, avgSalaryThb: 42_500 },
  { id: "dept_marketing", nameTh: "การตลาด", label: "Marketing", baseHeadcount: 186, monthlyGrowth: 0.004, attritionBase: 0.012, avgSalaryThb: 58_400 },
  { id: "dept_supply_chain", nameTh: "ซัพพลายเชน", label: "Supply chain", baseHeadcount: 430, monthlyGrowth: 0.002, attritionBase: 0.009, avgSalaryThb: 46_800 },
  { id: "dept_production", nameTh: "การผลิต", label: "Production", baseHeadcount: 2150, monthlyGrowth: 0.001, attritionBase: 0.011, avgSalaryThb: 33_900 },
  { id: "dept_finance", nameTh: "การเงิน", label: "Finance", baseHeadcount: 142, monthlyGrowth: 0.0015, attritionBase: 0.008, avgSalaryThb: 61_200 },
  { id: "dept_hr", nameTh: "ทรัพยากรบุคคล", label: "Human resources", baseHeadcount: 78, monthlyGrowth: 0.001, attritionBase: 0.008, avgSalaryThb: 52_600 },
  { id: "dept_it", nameTh: "ไอที", label: "IT", baseHeadcount: 96, monthlyGrowth: 0.006, attritionBase: 0.016, avgSalaryThb: 74_300 },
  { id: "dept_executive", nameTh: "บริหาร", label: "Executive", baseHeadcount: 24, monthlyGrowth: 0.0005, attritionBase: 0.004, avgSalaryThb: 168_000 },
];

export const DEPARTMENT_INDEX: ReadonlyMap<string, number> = new Map(DEPARTMENTS.map((department, index) => [department.id, index]));

export function departmentById(id: string): Department | null {
  const index = DEPARTMENT_INDEX.get(id);
  return index === undefined ? null : (DEPARTMENTS[index] as Department);
}
