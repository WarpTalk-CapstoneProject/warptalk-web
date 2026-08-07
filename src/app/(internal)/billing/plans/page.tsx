"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createHubConnection } from "@/lib/signalr";
import { billingService } from "@/services/billing.service";
import { getErrorMessage } from "@/lib/errors";
import type { PlanDto, PlanMutationDto } from "@/types/billing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Edit2,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/currency";

interface PlanFormState {
  name: string;
  slug: string;
  tier: string;
  price: number;
  currency: string;
  billingCycle: string;
  creditsPerCycle: number;
  maxParticipants: number;
  maxLanguages: number;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
  features: string;
  featuresText: string;
  sortOrder: number;
  isActive: boolean;
}

const initialFormState: PlanFormState = {
  name: "",
  slug: "",
  tier: "Startup",
  price: 0,
  currency: "VND",
  billingCycle: "monthly",
  creditsPerCycle: 1000,
  maxParticipants: 5,
  maxLanguages: 3,
  voiceCloneEnabled: false,
  aiAssistantEnabled: false,
  glossaryEnabled: false,
  dedicatedGpu: false,
  features: "[]",
  featuresText: "",
  sortOrder: 0,
  isActive: true,
};

export default function AdminPlansPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PlanFormState>(initialFormState);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivatingPlanId, setDeactivatingPlanId] = useState<string | null>(
    null,
  );
  const [deactivatingPlanName, setDeactivatingPlanName] = useState("");

  // SignalR for real-time plan updates in Admin panel
  useEffect(() => {
    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      if (notification?.type === "billing.plan_changed") {
        toast.info(notification.content, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      }
    });

    let isMounted = true;
    connection.start().catch((err) => {
      if (!isMounted) return;
      if (err?.message?.includes("stop() was called")) return;
    });

    return () => {
      isMounted = false;
      connection.stop();
    };
  }, [queryClient]);

  // Queries
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => billingService.getPlans(),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newPlan: PlanMutationDto) =>
      billingService.createPlan(newPlan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setIsDialogOpen(false);
      setFormState(initialFormState);
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, "Failed to create plan."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: PlanMutationDto }) =>
      billingService.updatePlan(id, plan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setIsDialogOpen(false);
      setEditingPlanId(null);
      setFormState(initialFormState);
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, "Failed to update plan."));
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => billingService.deactivatePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: unknown) => {
      alert(getErrorMessage(err, "Failed to deactivate plan."));
    },
  });

  const handleOpenCreate = () => {
    setEditingPlanId(null);
    setFormState(initialFormState);
    setErrorMsg(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (plan: PlanDto) => {
    setEditingPlanId(plan.id);
    setFormState({
      name: plan.name,
      slug: plan.slug,
      tier: plan.tier || "Startup",
      price: plan.price,
      currency: plan.currency || "VND",
      billingCycle: plan.billingCycle || "monthly",
      creditsPerCycle: plan.creditsPerCycle || 0,
      maxParticipants: plan.maxParticipants || 0,
      maxLanguages: plan.maxLanguages || 0,
      voiceCloneEnabled: plan.voiceCloneEnabled || false,
      aiAssistantEnabled: plan.aiAssistantEnabled || false,
      glossaryEnabled: plan.glossaryEnabled || false,
      dedicatedGpu: plan.dedicatedGpu || false,
      features: plan.features || "[]",
      featuresText: (() => {
        try {
          const arr = JSON.parse(plan.features || "[]");
          return Array.isArray(arr) ? arr.join("\n") : "";
        } catch {
          return "";
        }
      })(),
      sortOrder: plan.sortOrder || 0,
      isActive: plan.isActive !== false,
    });
    setErrorMsg(null);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    setErrorMsg(null);

    // Validation
    if (!formState.name.trim()) {
      setErrorMsg("Name is required.");
      return;
    }
    if (formState.name.length > 100) {
      setErrorMsg("Name must not exceed 100 characters.");
      return;
    }

    if (!formState.slug.trim()) {
      setErrorMsg("Slug is required.");
      return;
    }
    if (formState.slug.length > 50) {
      setErrorMsg("Slug must not exceed 50 characters.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formState.slug)) {
      setErrorMsg(
        "Slug must be lowercase alphanumeric characters and hyphens only (e.g., 'gold-tier').",
      );
      return;
    }

    if (!formState.tier.trim()) {
      setErrorMsg("Tier is required.");
      return;
    }
    if (formState.tier.length > 20) {
      setErrorMsg("Tier must not exceed 20 characters.");
      return;
    }

    const currency = (formState.currency || "").toUpperCase().trim();
    if (currency.length !== 3) {
      setErrorMsg("Currency must be a 3-character ISO code.");
      return;
    }

    const billingCycle = (formState.billingCycle || "").toLowerCase().trim();
    if (
      billingCycle !== "monthly" &&
      billingCycle !== "semiannual" &&
      billingCycle !== "yearly"
    ) {
      setErrorMsg(
        "Billing cycle must be 'monthly', 'semiannual', or 'yearly'.",
      );
      return;
    }

    // Stripe Minimum Charge Limits Validation
    let minPrice = 0.5;
    if (currency === "VND") minPrice = 15000;
    else if (currency === "JPY") minPrice = 50;
    else if (currency === "GBP") minPrice = 0.3;
    else minPrice = 0.5;

    if (formState.price < minPrice) {
      setErrorMsg(
        `Price for ${currency} must be at least ${minPrice} due to Stripe payment constraints.`,
      );
      return;
    }

    if (formState.creditsPerCycle < 0) {
      setErrorMsg("Credits must be non-negative.");
      return;
    }
    if (formState.maxParticipants < 2) {
      setErrorMsg("Max participants must be at least 2.");
      return;
    }
    if (formState.maxLanguages < 1) {
      setErrorMsg("Max languages must be at least 1.");
      return;
    }
    if (formState.sortOrder < 0) {
      setErrorMsg("Sort order must be non-negative.");
      return;
    }

    // Convert lines to JSON array string
    const lines = formState.featuresText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const { featuresText, ...rest } = formState;
    void featuresText;
    const payload = {
      ...rest,
      features: JSON.stringify(lines),
    };

    if (editingPlanId) {
      updateMutation.mutate({ id: editingPlanId, plan: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDeactivate = (id: string, name: string) => {
    setDeactivatingPlanId(id);
    setDeactivatingPlanName(name);
    setShowDeactivateDialog(true);
  };

  const confirmDeactivate = () => {
    if (deactivatingPlanId) {
      deactivateMutation.mutate(deactivatingPlanId);
      setShowDeactivateDialog(false);
      setDeactivatingPlanId(null);
      setDeactivatingPlanName("");
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-6 p-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between bg-surface-1 p-6 rounded-xl border border-hairline shadow-linear">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/billing">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Badge
              variant="outline"
              className="bg-surface-2 text-ink border-hairline"
            >
              Admin Panel
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">
              Subscription Plans
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Manage commercial packages, usage limits, and Stripe synchronization
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-primary hover:bg-primary-hover text-primary-foreground gap-2 rounded-md"
        >
          <Plus className="h-4 w-4" /> Add New Plan
        </Button>
      </div>

      {/* Plan list card */}
      <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
        <CardHeader>
          <CardTitle>All Packages</CardTitle>
          <CardDescription>
            View, modify, or deactivate user-facing packages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 border border-dashed rounded-lg border-hairline p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No subscription packages found.
              </p>
              <Button onClick={handleOpenCreate} variant="outline" size="sm">
                Create First Plan
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-hairline hover:bg-transparent">
                  <TableHead className="w-[180px]">Name</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Credits/Cycle</TableHead>
                  <TableHead>Limits (Voice / Glossary / ACL)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow
                    key={plan.id}
                    className="border-hairline hover:bg-surface-2/20"
                  >
                    <TableCell className="font-medium">
                      <div>
                        <span className="text-sm">{plan.name}</span>
                        <div className="text-xs text-muted-foreground font-mono">
                          {plan.slug}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-surface-2">
                        {plan.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-sm">
                        {plan.price === 0
                          ? "Free"
                          : formatMoney(plan.price, plan.currency)}
                      </span>
                      <div className="text-xs text-muted-foreground capitalize">
                        {plan.billingCycle}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {plan.creditsPerCycle?.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2
                            className={`h-3.5 w-3.5 ${plan.voiceCloneEnabled ? "text-emerald-500" : "text-muted-foreground"}`}
                          />
                          Voice Clone:{" "}
                          {plan.voiceCloneEnabled ? "Enabled" : "Disabled"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2
                            className={`h-3.5 w-3.5 ${plan.glossaryEnabled ? "text-emerald-500" : "text-muted-foreground"}`}
                          />
                          Glossary Access:{" "}
                          {plan.glossaryEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          plan.isActive !== false ? "default" : "destructive"
                        }
                        className="rounded-full"
                      >
                        {plan.isActive !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={() => handleOpenEdit(plan)}
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-ink"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleDeactivate(plan.id, plan.name)}
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          disabled={plan.isActive === false}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          style={{ maxWidth: "900px", width: "95vw" }}
          className="bg-surface-1 border-hairline text-ink rounded-lg shadow-linear max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {editingPlanId
                ? "Edit Subscription Plan"
                : "Create New Subscription Plan"}
            </DialogTitle>
            <DialogDescription>
              Define plan pricing, limits, and specific AI feature flags.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid gap-5 py-4">
            {/* General Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Plan Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Startup, Enterprise"
                  value={formState.name}
                  onChange={(e) =>
                    setFormState({ ...formState, name: e.target.value })
                  }
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">Slug (URL identity)</Label>
                <Input
                  id="slug"
                  placeholder="e.g. startup-plan, enterprise-tier"
                  value={formState.slug}
                  onChange={(e) =>
                    setFormState({ ...formState, slug: e.target.value })
                  }
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
            </div>

            {/* Pricing & Limits */}
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  value={formState.price}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formState.currency}
                  onValueChange={(val) =>
                    setFormState({ ...formState, currency: val || "" })
                  }
                >
                  <SelectTrigger className="w-full bg-surface-2 border-hairline focus:ring-primary-focus">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-1 border-hairline text-ink">
                    <SelectItem value="VND">VND</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billingCycle">Billing Cycle</Label>
                <Select
                  value={formState.billingCycle}
                  onValueChange={(val) =>
                    setFormState({ ...formState, billingCycle: val || "" })
                  }
                >
                  <SelectTrigger className="w-full bg-surface-2 border-hairline focus:ring-primary-focus">
                    <SelectValue placeholder="Select cycle" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-1 border-hairline text-ink">
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="semiannual">6 Months</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Technical Limits */}
            <div className="grid grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="credits">Credits/Cycle</Label>
                <Input
                  id="credits"
                  type="number"
                  value={formState.creditsPerCycle}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      creditsPerCycle: parseInt(e.target.value) || 0,
                    })
                  }
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tier">Tier Level</Label>
                <Input
                  id="tier"
                  placeholder="e.g. Pro, Premium"
                  value={formState.tier}
                  onChange={(e) =>
                    setFormState({ ...formState, tier: e.target.value })
                  }
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxParticipants">Max Participants</Label>
                <Input
                  id="maxParticipants"
                  type="number"
                  value={formState.maxParticipants}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      maxParticipants: parseInt(e.target.value) || 0,
                    })
                  }
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxLanguages">Max Languages</Label>
                <Input
                  id="maxLanguages"
                  type="number"
                  min={1}
                  max={3}
                  value={formState.maxLanguages}
                  onChange={(e) => {
                    let val = parseInt(e.target.value) || 1;
                    if (val > 3) val = 3;
                    if (val < 1) val = 1;
                    setFormState({ ...formState, maxLanguages: val });
                  }}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
            </div>

            {/* Feature Flags */}
            <div className="border border-hairline rounded-lg p-4 bg-surface-2/20 space-y-4">
              <h3 className="text-sm font-semibold text-ink/80 mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-primary" /> Feature
                Authorization Flags
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="voiceClone">Voice Cloning</Label>
                    <p className="text-xs text-muted-foreground">
                      Allows neural voice mimicking
                    </p>
                  </div>
                  <Switch
                    id="voiceClone"
                    checked={formState.voiceCloneEnabled}
                    onCheckedChange={(checked) =>
                      setFormState({ ...formState, voiceCloneEnabled: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="aiAssistant">AI Assistant</Label>
                    <p className="text-xs text-muted-foreground">
                      Interactive AI in meetings
                    </p>
                  </div>
                  <Switch
                    id="aiAssistant"
                    checked={formState.aiAssistantEnabled}
                    onCheckedChange={(checked) =>
                      setFormState({
                        ...formState,
                        aiAssistantEnabled: checked,
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="glossaryEnabled">Glossary Access</Label>
                    <p className="text-xs text-muted-foreground">
                      Define business specific terminology
                    </p>
                  </div>
                  <Switch
                    id="glossaryEnabled"
                    checked={formState.glossaryEnabled}
                    onCheckedChange={(checked) =>
                      setFormState({ ...formState, glossaryEnabled: checked })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Sub Limits & Features JSON */}
            <div className="grid gap-2">
              <Label htmlFor="sortOrder">Sort Order (display sequence)</Label>
              <Input
                id="sortOrder"
                type="number"
                value={formState.sortOrder}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    sortOrder: parseInt(e.target.value) || 0,
                  })
                }
                className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="features">Plan Highlights (One per line)</Label>
              <Textarea
                id="features"
                rows={4}
                placeholder="e.g. Up to 5 participants&#10;Realtime Translation&#10;Standard neural TTS"
                value={formState.featuresText}
                onChange={(e) =>
                  setFormState({ ...formState, featuresText: e.target.value })
                }
                className="bg-surface-2 border-hairline focus-visible:ring-primary-focus font-mono text-xs"
              />
            </div>

            {editingPlanId && (
              <div className="flex items-center justify-between border-t border-hairline pt-3 mt-1">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">Active Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Keep this enabled for users to view and purchase
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={formState.isActive}
                  onCheckedChange={(checked) =>
                    setFormState({ ...formState, isActive: checked })
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-hairline pt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="rounded-md"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-md"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                "Save Package"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Plan confirmation dialog */}
      <Dialog
        open={showDeactivateDialog}
        onOpenChange={setShowDeactivateDialog}
      >
        <DialogContent className="sm:max-w-[440px] border-hairline bg-surface-1 shadow-lg rounded-xl text-ink">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Deactivate billing package?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-muted mt-1">
              Are you sure you want to deactivate and soft-delete the plan{" "}
              <strong>{deactivatingPlanName}</strong>? Active subscriptions will
              still refer to it, but new users won’t be able to select it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 flex-row justify-end mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowDeactivateDialog(false)}
              className="rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deactivateMutation.isPending}
              onClick={confirmDeactivate}
              className="rounded-md"
            >
              {deactivateMutation.isPending
                ? "Deactivating..."
                : "Deactivate Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
