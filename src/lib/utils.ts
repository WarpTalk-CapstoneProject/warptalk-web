import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PlanDto } from "@/types/billing";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPlanDescription(planName: string): string {
  const name = (planName || "").toLowerCase();
  if (name.includes("startup")) {
    return "For growing global teams that need reliable AI summaries and history.";
  }
  if (name.includes("enterprise")) {
    return "For operators using voice cloning and native-feeling interpretation at scale.";
  }
  return "Flexible plan for customized workspace requirements and additional features.";
}

export function buildFeatureList(plan: PlanDto): string[] {
  const features: string[] = [];
  
  if (plan.creditsPerCycle) {
    features.push(`${plan.creditsPerCycle.toLocaleString()} credits per cycle`);
  }
  if (plan.maxParticipants) {
    features.push(`Up to ${plan.maxParticipants} participants per meeting`);
  }
  if (plan.maxLanguages) {
    features.push(`Up to ${plan.maxLanguages} languages simultaneously`);
  }
  
  if (plan.voiceCloneLimitMins === -1) {
    features.push("Unlimited Voice Cloning");
  } else if (plan.voiceCloneLimitMins && plan.voiceCloneLimitMins > 0) {
    features.push(`${plan.voiceCloneLimitMins} minutes of Voice Cloning`);
  }
  
  if (plan.allowGlossary) {
    features.push("Workspace Glossary & AI Customization");
  }
  
  if (plan.advancedAcl) {
    features.push("Advanced ACL permission controls");
  }

  try {
    const parsed = JSON.parse(plan.features || "[]");
    if (Array.isArray(parsed)) {
      features.push(...parsed);
    }
  } catch {}

  // Add defaults if it's completely empty
  if (features.length === 0) {
    features.push("Standard email support");
  }

  return features;
}
