"use client";

import { useRef, useState } from "react";
import { BookOpen, Check, FileText, Languages, Plus, Save, Shield, Trash2, Upload, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const languageOptions = ["Vietnamese", "English", "Japanese"];

export default function WorkspaceMeetingSettingsPage() {
  const [languages, setLanguages] = useState(["Vietnamese", "English", "Japanese"]);
  const [transcriptLanguage, setTranscriptLanguage] = useState("English");
  const [creditLimit, setCreditLimit] = useState("240");
  const [documents, setDocuments] = useState([
    { name: "Company terminology.pdf", size: "2.4 MB" },
    { name: "APAC product glossary.csv", size: "840 KB" },
    { name: "Brand and speaker names.docx", size: "1.1 MB" },
  ]);
  const fileInput = useRef<HTMLInputElement>(null);

  function toggleLanguage(language: string) {
    setLanguages((current) => current.includes(language) ? current.filter((item) => item !== language) : [...current, language]);
  }

  function addDocuments(files: FileList | null) {
    if (!files) return;
    setDocuments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({ name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB` })),
    ]);
    toast.success(`${files.length} company document${files.length > 1 ? "s" : ""} added.`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden pb-1">
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={() => toast.success("Workspace meeting defaults saved.")} className="rounded-full bg-neutral-950 text-white hover:bg-neutral-800"><Save /> Save defaults</Button>
      </div>

      <section className="grid gap-2 lg:grid-cols-3">
        <SettingSummary icon={Languages} title="Languages" value={`${languages.length} enabled`} />
        <SettingSummary icon={FileText} title="Company context" value={`${documents.length} documents`} />
        <SettingSummary icon={WalletCards} title="Meeting credit limit" value={`${creditLimit} credits`} />
      </section>

      <section className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,.9fr)]">
        <div className="space-y-2">
          <Card className="rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardHeader className="px-4 py-3"><CardTitle className="flex items-center gap-2 text-base"><Languages className="h-5 w-5" />Language policy</CardTitle></CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div>
                <p className="mb-2 text-sm font-medium">Languages available when Hosts create rooms</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {languageOptions.map((language) => {
                    const selected = languages.includes(language);
                    return (
                      <button key={language} onClick={() => toggleLanguage(language)} className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition ${selected ? "border-neutral-950 bg-neutral-950 text-white" : "bg-white hover:border-neutral-400"}`}>
                        {language}{selected && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Default transcript language</label>
                <select value={transcriptLanguage} onChange={(event) => setTranscriptLanguage(event.target.value)} className="mt-2 h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none">
                  {languages.map((language) => <option key={language}>{language}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-white/70 bg-white/88">
            <CardHeader className="px-4 py-3"><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-5 w-5" />Meeting & AI policy</CardTitle></CardHeader>
            <CardContent className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
              <PolicyToggle label="Record meetings" detail="Allow Hosts to record workspace sessions." defaultChecked />
              <PolicyToggle label="Generate AI summary" detail="Create summary and action items after meetings." defaultChecked />
              <PolicyToggle label="Participant approval" detail="Require Host approval before joining." defaultChecked />
              <PolicyToggle label="Save translated audio" detail="Retain translated voice with artifacts." />
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Maximum AI credits per meeting</label>
                <Input value={creditLimit} onChange={(event) => setCreditLimit(event.target.value.replace(/\D/g, ""))} className="mt-2 h-10 rounded-xl bg-white" inputMode="numeric" />
                <p className="mt-1 text-xs text-muted-foreground">Hosts can use a lower limit, but cannot exceed this workspace policy.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-0 overflow-hidden rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-3">
            <div><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-5 w-5" />Company context library</CardTitle><p className="text-xs text-muted-foreground">Files are indexed for translation and AI analysis.</p></div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => fileInput.current?.click()}><Upload /> Upload</Button>
            <input ref={fileInput} type="file" multiple accept=".pdf,.doc,.docx,.csv,.txt" className="hidden" onChange={(event) => addDocuments(event.target.files)} />
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-y-auto p-3">
            {documents.map((document, index) => (
              <div key={`${document.name}-${index}`} className="flex items-center justify-between rounded-2xl border bg-white p-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white"><FileText className="h-4 w-4" /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{document.name}</p><p className="text-xs text-muted-foreground">{document.size} · Ready for AI context</p></div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button>
              </div>
            ))}
            <button onClick={() => fileInput.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground transition hover:border-neutral-400 hover:text-neutral-950">
              <Plus className="h-4 w-4" /> Add glossary, policy, product, or speaker context
            </button>
            <div className="rounded-2xl bg-neutral-950 p-3 text-white">
              <p className="text-sm font-medium">Database behavior</p>
              <p className="mt-1 text-xs leading-5 text-white/65">Uploaded files become shared workspace context. Hosts choose from this approved library instead of uploading duplicate documents for every meeting.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SettingSummary({ icon: Icon, title, value }: { icon: typeof Languages; title: string; value: string }) {
  return <Card className="rounded-3xl border-white/70 bg-white/88"><CardContent className="flex items-center gap-3 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950 text-white"><Icon className="h-4 w-4" /></span><div><p className="text-xs text-muted-foreground">{title}</p><p className="text-base font-semibold">{value}</p></div></CardContent></Card>;
}

function PolicyToggle({ label, detail, defaultChecked = false }: { label: string; detail: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border bg-white p-2.5">
      <div><p className="text-sm font-medium">{label}</p><p className="text-xs leading-5 text-muted-foreground">{detail}</p></div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}
