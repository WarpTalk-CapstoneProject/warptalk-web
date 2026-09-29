"use client";

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, ArrowCounterClockwise, Check } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { formatMoney } from "@/lib/format/currency";
import {
  ADMIN_MASTER_DEFAULT_RATES,
  type CurrencyRateConfig,
  type SupportedCurrency,
} from "@/lib/billing/workspace-telemetry";

const CURRENCY_OPTIONS: { code: SupportedCurrency; name: string; symbol: string }[] = [
  { code: "USD", name: "US Dollar (USD)", symbol: "$" },
  { code: "VND", name: "Vietnamese Dong (VND)", symbol: "₫" },
  { code: "EUR", name: "Euro (EUR)", symbol: "€" },
  { code: "JPY", name: "Japanese Yen (JPY)", symbol: "¥" },
  { code: "GBP", name: "British Pound (GBP)", symbol: "£" },
];

interface WorkspaceCurrencyConfigModalProps {
  currentConfig: CurrencyRateConfig;
  adminMasterRates?: Record<string, number>;
  onSave: (config: CurrencyRateConfig) => void;
  trigger?: React.ReactNode;
}

export function WorkspaceCurrencyConfigModal({
  currentConfig,
  adminMasterRates = ADMIN_MASTER_DEFAULT_RATES,
  onSave,
  trigger,
}: WorkspaceCurrencyConfigModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>(currentConfig.currency);
  const [isCustomRate, setIsCustomRate] = useState<boolean>(Boolean(currentConfig.isCustom));
  const [customRateInput, setCustomRateInput] = useState<string>(
    currentConfig.ratePerCredit.toString(),
  );

  // Sync state whenever opened or currentConfig changes
  useEffect(() => {
    if (open) {
      setSelectedCurrency(currentConfig.currency);
      setIsCustomRate(Boolean(currentConfig.isCustom));
      setCustomRateInput(currentConfig.ratePerCredit.toString());
    }
  }, [open, currentConfig]);

  const platformRate = useMemo(() => {
    return adminMasterRates[selectedCurrency] ?? ADMIN_MASTER_DEFAULT_RATES[selectedCurrency] ?? 100;
  }, [adminMasterRates, selectedCurrency]);

  const activeRate = useMemo(() => {
    if (!isCustomRate) return platformRate;
    const parsed = parseFloat(customRateInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : platformRate;
  }, [isCustomRate, customRateInput, platformRate]);

  const handleCurrencyChange = (newCurrency: string) => {
    setSelectedCurrency(newCurrency);
    if (!isCustomRate) {
      const defaultRate = adminMasterRates[newCurrency] ?? ADMIN_MASTER_DEFAULT_RATES[newCurrency] ?? 100;
      setCustomRateInput(defaultRate.toString());
    }
  };

  const handleResetToAdminMaster = () => {
    setIsCustomRate(false);
    const defaultRate = adminMasterRates[selectedCurrency] ?? ADMIN_MASTER_DEFAULT_RATES[selectedCurrency] ?? 100;
    setCustomRateInput(defaultRate.toString());
  };

  const handleSave = () => {
    onSave({
      currency: selectedCurrency,
      ratePerCredit: activeRate,
      isCustom: isCustomRate,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-[11px] font-medium tracking-[0.2px]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Valuation: {currentConfig.currency}</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-ink">
            Currency & Valuation Settings
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-muted leading-relaxed">
            Configure how meeting telemetry and credits are translated to real money. Defaults are
            governed by the Admin Master pricing policy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-xs">
          {/* 1. Preferred Currency */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">
              Reporting Currency
            </Label>
            <Select value={selectedCurrency} onValueChange={handleCurrencyChange}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Rate Mode Selection */}
          <div className="space-y-2">
            <Label className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">
              Rate Standard
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleResetToAdminMaster}
                className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors ${
                  !isCustomRate
                    ? "border-primary/50 bg-primary/5 text-ink font-medium"
                    : "border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  {!isCustomRate && <Check className="h-3.5 w-3.5 text-primary" />}
                  <span>Admin Master</span>
                </div>
                <p className="mt-1 text-[10px] text-ink-subtle">
                  Managed centrally ({platformRate} {selectedCurrency}/cr)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsCustomRate(true)}
                className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors ${
                  isCustomRate
                    ? "border-primary/50 bg-primary/5 text-ink font-medium"
                    : "border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  {isCustomRate && <Check className="h-3.5 w-3.5 text-primary" />}
                  <span>Custom Rate</span>
                </div>
                <p className="mt-1 text-[10px] text-ink-subtle">
                  Workspace contract or negotiated rate
                </p>
              </button>
            </div>
          </div>

          {/* 3. Rate Input (when custom or previewing) */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">
              Rate per 1 Credit ({selectedCurrency})
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="any"
                min="0.000001"
                disabled={!isCustomRate}
                value={isCustomRate ? customRateInput : platformRate}
                onChange={(e) => setCustomRateInput(e.target.value)}
                className="h-8 text-xs disabled:opacity-70 disabled:bg-surface-2 pr-12 font-mono"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted font-medium pointer-events-none">
                {selectedCurrency}
              </span>
            </div>
          </div>

          {/* 4. Live Conversion Preview Box */}
          <div className="rounded-lg border border-hairline bg-surface-2/60 p-2.5 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.3px] text-ink-muted">
              Live Conversion Preview
            </p>
            <div className="flex items-center justify-between text-xs text-ink">
              <span>1,000 credits</span>
              <span className="font-semibold">{formatMoney(1000 * activeRate, selectedCurrency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-ink">
              <span>Avg meeting (~1,200 cr)</span>
              <span className="font-medium text-ink-muted">
                {formatMoney(1200 * activeRate, selectedCurrency)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetToAdminMaster}
            className="h-8 text-xs text-ink-muted hover:text-ink gap-1 px-2"
          >
            <ArrowCounterClockwise className="h-3 w-3" />
            Reset to Admin Master
          </Button>

          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSave}
              className="h-8 text-xs font-medium"
            >
              Save Preferences
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
