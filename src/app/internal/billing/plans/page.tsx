"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, ArrowLeft, Loader2, Sparkles, Shield, User, Globe, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { billingService } from "@/services/billing.service";
import Link from "next/link";

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
  voiceCloneLimitMins: number;
  allowGlossary: boolean;
  allowAcl: boolean;
  features: string;
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
  voiceCloneLimitMins: 0,
  allowGlossary: false,
  allowAcl: false,
  features: "[]",
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
  const [deactivatingPlanId, setDeactivatingPlanId] = useState<string | null>(null);
  const [deactivatingPlanName, setDeactivatingPlanName] = useState("");

  // Queries
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => billingService.getPlans(),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newPlan: any) => billingService.createPlan(newPlan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setIsDialogOpen(false);
      setFormState(initialFormState);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.Message || "Failed to create plan.");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: any }) => billingService.updatePlan(id, plan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setIsDialogOpen(false);
      setEditingPlanId(null);
      setFormState(initialFormState);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.Message || "Failed to update plan.");
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => billingService.deactivatePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.Message || "Failed to deactivate plan.");
    }
  });

  const handleOpenCreate = () => {
    setEditingPlanId(null);
    setFormState(initialFormState);
    setErrorMsg(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (plan: any) => {
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
      voiceCloneLimitMins: plan.voiceCloneLimitMins || 0,
      allowGlossary: plan.allowGlossary || false,
      allowAcl: plan.allowAcl || false,
      features: plan.features || "[]",
      sortOrder: plan.sortOrder || 0,
      isActive: plan.isActive !== false,
    });
    setErrorMsg(null);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    setErrorMsg(null);

    // Validation
    if (!formState.name.trim()) { setErrorMsg("Name is required."); return; }
    if (!formState.slug.trim()) { setErrorMsg("Slug is required."); return; }
    if (formState.price < 0) { setErrorMsg("Price must be non-negative."); return; }
    if (formState.creditsPerCycle < 0) { setErrorMsg("Credits must be non-negative."); return; }

    // Parse features to confirm it's valid JSON
    try {
      JSON.parse(formState.features);
    } catch {
      setErrorMsg("Features must be a valid JSON array string (e.g. [\"Feature 1\", \"Feature 2\"]).");
      return;
    }

    if (editingPlanId) {
      updateMutation.mutate({ id: editingPlanId, plan: formState });
    } else {
      createMutation.mutate(formState);
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
            <Link href="/internal/billing">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Badge variant="outline" className="bg-surface-2 text-ink border-hairline">Admin Panel</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">Subscription Plans</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Manage commercial packages, usage limits, and Stripe synchronization</p>
        </div>
        <Button onClick={handleOpenCreate} className="bg-primary hover:bg-primary-hover text-primary-foreground gap-2 rounded-md">
          <Plus className="h-4 w-4" /> Add New Plan
        </Button>
      </div>

      {/* Plan list card */}
      <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
        <CardHeader>
          <CardTitle>All Packages</CardTitle>
          <CardDescription>View, modify, or deactivate user-facing packages.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 border border-dashed rounded-lg border-hairline p-6 text-center">
              <p className="text-sm text-muted-foreground">No subscription packages found.</p>
              <Button onClick={handleOpenCreate} variant="outline" size="sm">Create First Plan</Button>
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
                {plans.map((plan: any) => (
                  <TableRow key={plan.id} className="border-hairline hover:bg-surface-2/20">
                    <TableCell className="font-medium">
                      <div>
                        <span className="text-sm">{plan.name}</span>
                        <div className="text-xs text-muted-foreground font-mono">{plan.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-surface-2">{plan.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-sm">
                        {plan.price === 0 ? "Free" : `${plan.price.toLocaleString()} ${plan.currency}`}
                      </span>
                      <div className="text-xs text-muted-foreground capitalize">{plan.billingCycle}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{plan.creditsPerCycle?.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className={`h-3.5 w-3.5 ${plan.voiceCloneEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                          Voice Clone: {plan.voiceCloneEnabled ? `${plan.voiceCloneLimitMins || "Unlimited"} mins` : "Disabled"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className={`h-3.5 w-3.5 ${plan.allowGlossary ? "text-emerald-500" : "text-muted-foreground"}`} />
                          Glossary Access: {plan.allowGlossary ? "Enabled" : "Disabled"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className={`h-3.5 w-3.5 ${plan.allowAcl ? "text-emerald-500" : "text-muted-foreground"}`} />
                          Advanced ACL: {plan.allowAcl ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive !== false ? "default" : "destructive"} className="rounded-full">
                        {plan.isActive !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => handleOpenEdit(plan)} size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-ink">
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
        <DialogContent className="max-w-2xl bg-surface-1 border-hairline text-ink rounded-lg shadow-linear max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {editingPlanId ? "Edit Subscription Plan" : "Create New Subscription Plan"}
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
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">Slug (URL identity)</Label>
                <Input
                  id="slug"
                  placeholder="e.g. startup-plan, enterprise-tier"
                  value={formState.slug}
                  onChange={(e) => setFormState({ ...formState, slug: e.target.value })}
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
                  onChange={(e) => setFormState({ ...formState, price: parseFloat(e.target.value) || 0 })}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select value={formState.currency} onValueChange={(val) => setFormState({ ...formState, currency: val || "" })}>
                  <SelectTrigger className="bg-surface-2 border-hairline focus:ring-primary-focus">
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
                <Select value={formState.billingCycle} onValueChange={(val) => setFormState({ ...formState, billingCycle: val || "" })}>
                  <SelectTrigger className="bg-surface-2 border-hairline focus:ring-primary-focus">
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
                  onChange={(e) => setFormState({ ...formState, creditsPerCycle: parseInt(e.target.value) || 0 })}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tier">Tier Level</Label>
                <Select value={formState.tier} onValueChange={(val) => setFormState({ ...formState, tier: val || "" })}>
                  <SelectTrigger className="bg-surface-2 border-hairline focus:ring-primary-focus">
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-1 border-hairline text-ink">
                    <SelectItem value="Free">Free</SelectItem>
                    <SelectItem value="Startup">Startup</SelectItem>
                    <SelectItem value="Enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxParticipants">Max Participants</Label>
                <Input
                  id="maxParticipants"
                  type="number"
                  value={formState.maxParticipants}
                  onChange={(e) => setFormState({ ...formState, maxParticipants: parseInt(e.target.value) || 0 })}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxLanguages">Max Languages</Label>
                <Input
                  id="maxLanguages"
                  type="number"
                  value={formState.maxLanguages}
                  onChange={(e) => setFormState({ ...formState, maxLanguages: parseInt(e.target.value) || 0 })}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
            </div>

            {/* Feature Flags */}
            <div className="border border-hairline rounded-lg p-4 bg-surface-2/20 space-y-4">
              <h3 className="text-sm font-semibold text-ink/80 mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-primary" /> Feature Authorization Flags
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="voiceClone">Voice Cloning</Label>
                    <p className="text-xs text-muted-foreground">Allows neural voice mimicking</p>
                  </div>
                  <Switch
                    id="voiceClone"
                    checked={formState.voiceCloneEnabled}
                    onCheckedChange={(checked) => setFormState({ ...formState, voiceCloneEnabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="aiAssistant">AI Assistant</Label>
                    <p className="text-xs text-muted-foreground">Interactive AI in meetings</p>
                  </div>
                  <Switch
                    id="aiAssistant"
                    checked={formState.aiAssistantEnabled}
                    onCheckedChange={(checked) => setFormState({ ...formState, aiAssistantEnabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="glossaryEnabled">Glossary Access</Label>
                    <p className="text-xs text-muted-foreground">Define business specific terminology</p>
                  </div>
                  <Switch
                    id="glossaryEnabled"
                    checked={formState.glossaryEnabled}
                    onCheckedChange={(checked) => setFormState({ ...formState, glossaryEnabled: checked, allowGlossary: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="allowAcl">Advanced ACL</Label>
                    <p className="text-xs text-muted-foreground">Strict document sharing permissions</p>
                  </div>
                  <Switch
                    id="allowAcl"
                    checked={formState.allowAcl}
                    onCheckedChange={(checked) => setFormState({ ...formState, allowAcl: checked })}
                  />
                </div>
              </div>
            </div>

            {/* Sub Limits & Features JSON */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="vcLimit">Voice Clone Monthly limit (Minutes)</Label>
                <Input
                  id="vcLimit"
                  type="number"
                  placeholder="0 = Unlimited"
                  value={formState.voiceCloneLimitMins}
                  onChange={(e) => setFormState({ ...formState, voiceCloneLimitMins: parseInt(e.target.value) || 0 })}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                  disabled={!formState.voiceCloneEnabled}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sortOrder">Sort Order (display sequence)</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formState.sortOrder}
                  onChange={(e) => setFormState({ ...formState, sortOrder: parseInt(e.target.value) || 0 })}
                  className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="features">Plan Highlights (JSON Array String)</Label>
              <Textarea
                id="features"
                rows={2}
                placeholder='e.g. ["Up to 5 participants", "Realtime Translation", "Standard neural TTS"]'
                value={formState.features}
                onChange={(e) => setFormState({ ...formState, features: e.target.value })}
                className="bg-surface-2 border-hairline focus-visible:ring-primary-focus font-mono text-xs"
              />
            </div>
            
            {editingPlanId && (
              <div className="flex items-center justify-between border-t border-hairline pt-3 mt-1">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">Active Status</Label>
                  <p className="text-xs text-muted-foreground">Keep this enabled for users to view and purchase</p>
                </div>
                <Switch
                  id="isActive"
                  checked={formState.isActive}
                  onCheckedChange={(checked) => setFormState({ ...formState, isActive: checked })}
                />
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-hairline pt-4 gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-md">
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
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent className="sm:max-w-[440px] border-hairline bg-surface-1 shadow-lg rounded-xl text-ink">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Deactivate billing package?</DialogTitle>
            <DialogDescription className="text-sm text-ink-muted mt-1">
              Are you sure you want to deactivate and soft-delete the plan <strong>{deactivatingPlanName}</strong>? Active subscriptions will still refer to it, but new users won't be able to select it.
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
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
