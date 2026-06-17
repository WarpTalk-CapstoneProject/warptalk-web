import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DeviceSelect({ label, icon, value, devices, fallback, onChange }: any) {
  const selectedDevice = devices.find((d: any) => d.deviceId === value);
  const validValue = selectedDevice ? value : "default";

  let displayValue = fallback;
  if (selectedDevice) {
    let deviceName = selectedDevice.label && selectedDevice.label.trim() !== "" ? selectedDevice.label : `${label} ${devices.indexOf(selectedDevice) + 1}`;
    if (deviceName === selectedDevice.deviceId || deviceName.length > 40) {
      deviceName = `${label} ${devices.indexOf(selectedDevice) + 1}`;
    }
    displayValue = deviceName;
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium flex items-center gap-1.5 text-ink-muted">
        {icon} {label}
      </label>
      <Select value={validValue} onValueChange={(val) => onChange(val === "default" ? "" : val)}>
        <SelectTrigger className="h-[32px] bg-canvas border border-border text-ink text-[13px] rounded-[6px] w-full truncate focus:ring-2 focus:ring-ring/50 focus:border-ring">
          {displayValue}
        </SelectTrigger>
        <SelectContent className="bg-surface-1 border-border text-ink rounded-[6px]">
          <SelectItem value="default" className="focus:bg-surface-2 focus:text-ink text-[13px]">{fallback}</SelectItem>
          {devices.map((d: any, i: number) => {
            let deviceName = d.label && d.label.trim() !== "" ? d.label : `${label} ${i + 1}`;
            if (deviceName === d.deviceId || deviceName.length > 40) {
              deviceName = `${label} ${i + 1}`;
            }
            const deviceId = d.deviceId || `device-${i}`;
            return (
              <SelectItem key={deviceId} value={deviceId} className="focus:bg-surface-2 focus:text-ink text-[13px] truncate">
                {deviceName}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
