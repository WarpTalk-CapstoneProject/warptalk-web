import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, FilePdf, Link as LinkIcon, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { PillButton } from "./pill-button";

const MOCK_RESOURCES = [
  { id: "1", name: "CAPSTONE PROJECT REGISTER", type: "doc" },
  { id: "2", name: "Meeting Agenda Template", type: "doc" },
  { id: "3", name: "Design Assets Q3", type: "link" },
  { id: "4", name: "Q2 Marketing Report", type: "pdf" },
];

export function ResourcePicker({ 
  resources, 
  onChange
}: { 
  resources: string[]; 
  onChange: (val: string[]) => void;
}) {
  const active = resources.length > 0;
  
  let labelText = "Resources";
  if (resources.length === 1) {
    const r = MOCK_RESOURCES.find(x => x.id === resources[0]);
    labelText = r ? r.name : "1 resource";
  } else if (resources.length > 1) {
    labelText = `${resources.length} resources`;
  }

  const toggleResource = (id: string) => {
    if (resources.includes(id)) {
      onChange(resources.filter(r => r !== id));
    } else {
      onChange([...resources, id]);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "pdf": return <FilePdf weight="duotone" className="text-red-500" size={16} />;
      case "link": return <LinkIcon weight="bold" className="text-blue-500" size={16} />;
      default: return <FileText weight="duotone" className="text-indigo-500" size={16} />;
    }
  };

  return (
    <Popover>
      <PopoverTrigger 
        render={
          <PillButton 
            icon={FileText} 
            label={labelText} 
            active={active} 
          />
        }
      />
      <PopoverContent align="start" className="w-[280px] p-2 bg-canvas rounded-xl shadow-xl border border-border/60">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-ink-muted px-1 mb-1 block">Library Resources</label>
          <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
            {MOCK_RESOURCES.map(res => {
              const isSelected = resources.includes(res.id);
              return (
                <button 
                  key={res.id} 
                  onClick={() => toggleResource(res.id)}
                  className={`flex items-center gap-2 text-[12px] px-2 py-1.5 rounded transition-colors text-left ${isSelected ? "bg-surface-2" : "hover:bg-surface-1"}`}
                >
                  <div className="shrink-0">
                    {getIcon(res.type)}
                  </div>
                  <span className="truncate font-medium text-ink flex-1">{res.name}</span>
                  {isSelected && <CheckCircle weight="fill" size={14} className="text-blue-500" />}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
