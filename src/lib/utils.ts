import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// WT-853: the plan card copy moved to lib/billing/plan-copy — ONE place every subscription page
// reads a plan's description and benefits from. Re-exported so existing imports keep working.
export { buildFeatureList, describePlan, getPlanDescription } from "./billing/plan-copy";
