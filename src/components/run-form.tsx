import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Layers, Bookmark, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { runTest, listTargets, saveTarget, type TestMode } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BatchTester } from "@/components/batch-tester";
import { cn } from "@/lib/utils";

type TargetRow = {
  id: string;
  name: string;
  url: string;
  default_mode: string;
  notes: string | null;
};

export function RunForm({
  defaultUrl = "",
  defaultMode = "fill_only",
  targetId,
  compact = false,
}: {
  defaultUrl?: string;
  defaultMode?: TestMode;
  targetId?: string;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<"single" | "batch">("single");
  const [url, setUrl] = useState(defaultUrl);
  const [mode, setMode] = useState<TestMode>(defaultMode);
  const [activeTargetId, setActiveTargetId] = useState<string | undefined>(targetId);
  const [running, setRunning] = useState(false);
  const navigate = useNavigate();
  const run = useServerFn(runTest);
  const queryClient = useQueryClient();

  const fetchTargets = useServerFn(listTargets);
  const addTarget = useServerFn(saveTarget);
  const { data: targets = [] } = useQuery({
    queryKey: ["targets"],
    queryFn: async () => (await fetchTargets()) as unknown as TargetRow[],
  });

  const normalize = (v: string) => v.trim().replace(/\/+$/, "").toLowerCase();
  const alreadySaved = targets.some((t) => normalize(t.url) === normalize(url));

  // Save-target dialog state
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saveOpen && !saveName) {
      try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        setSaveName(u.hostname.replace(/^www\./, ""));
      } catch {
        setSaveName(url.slice(0, 40));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveOpen]);

  function pickTarget(id: string) {
    const t = targets.find((x) => x.id === id);
    if (!t) return;
    setUrl(t.url);
    setMode((t.default_mode === "fill_submit" ? "fill_submit" : "fill_only") as TestMode);
    setActiveTargetId(t.id);
  }

  async function saveCurrentUrl() {
    if (!saveName.trim() || !url.trim()) return;
    setSaving(true);
    try {
      const res = await addTarget({
        data: {
          name: saveName.trim(),
          url: url.trim(),
          default_mode: mode,
          notes: saveNotes.trim() || null,
        },
      });
      setActiveTargetId(res.id);
      queryClient.invalidateQueries({ queryKey: ["targets"] });
      toast.success("Site saved");
      setSaveOpen(false);
      setSaveName("");
      setSaveNotes("");
    } catch (error) {
      toast.error((error as Error).message || "Could not save this site");
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setRunning(true);
    try {
      const result = await run({ data: { url, mode, target_id: activeTargetId ?? null } });
      navigate({ to: "/runs/$id", params: { id: result.id } });
    } catch (error) {
      toast.error((error as Error).message || "The test could not be started");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "single" | "batch")} className="w-full">
        <div className="flex items-center justify-between pb-1">
          <TabsList className="grid w-64 grid-cols-2">
            <TabsTrigger value="single" className="text-xs">Single URL</TabsTrigger>
            <TabsTrigger value="batch" className="text-xs flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Batch testing
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="single" className="mt-3">
          <form onSubmit={submit} className={cn("space-y-4", compact && "space-y-3")}>
            {targets.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={activeTargetId ?? ""} onValueChange={pickTarget}>
                  <SelectTrigger className="h-9 w-full font-mono text-xs sm:w-72">
                    <SelectValue placeholder="Select saved URL" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="font-mono text-xs">
                        {t.name} — {t.url}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {targets.length} saved {targets.length === 1 ? "site" : "sites"}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setActiveTargetId(undefined);
                }}
                placeholder="https://example.com/contact"
                className="h-11 flex-1 font-mono text-sm"
                inputMode="url"
                aria-label="Website address to test"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 px-3"
                disabled={!url.trim() || alreadySaved}
                onClick={() => setSaveOpen(true)}
                title={alreadySaved ? "Already in your saved sites" : "Save this URL"}
                aria-label="Save this URL"
              >
                {alreadySaved ? (
                  <Bookmark className="h-4 w-4 fill-current text-primary" />
                ) : (
                  <BookmarkPlus className="h-4 w-4" />
                )}
                <span className="ml-2 text-xs sm:hidden">
                  {alreadySaved ? "Saved" : "Save URL"}
                </span>
              </Button>
              <Button type="submit" disabled={running || !url.trim()} className="h-11 px-6">
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" /> Run test
                  </>
                )}
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "fill_only",
                    title: "Fill only",
                    copy: "Detect fields and autofill with realistic dummy data. Nothing is sent.",
                  },
                  {
                    value: "fill_submit",
                    title: "Fill & submit",
                    copy: "Autofill, then press submit and capture what the site responds with.",
                  },
                ] as const
              ).map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    mode === option.value
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-card hover:border-border/80 hover:bg-accent/40",
                  )}
                >
                  <span className="font-mono text-xs font-semibold tracking-wide text-foreground">
                    {option.title.toUpperCase()}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">{option.copy}</p>
                </button>
              ))}
            </div>

            {running && (
              <p className="text-xs text-muted-foreground">
                Opening the page in a real browser — this usually takes 15–40 seconds.
              </p>
            )}
          </form>
        </TabsContent>

        <TabsContent value="batch" className="mt-3">
          <BatchTester defaultMode={mode} />
        </TabsContent>
      </Tabs>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this URL</DialogTitle>
            <DialogDescription>
              Add it to your saved sites so you can pick it next time instead of typing it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="quick-save-name">Name</Label>
              <Input
                id="quick-save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Lead contact form"
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <p className="break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-xs text-muted-foreground">
                {url}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Default test mode</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "fill_only", label: "Fill only" },
                    { value: "fill_submit", label: "Fill & submit" },
                  ] as const
                ).map((m) => (
                  <button
                    type="button"
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "rounded-md border p-2.5 text-xs font-medium transition-colors",
                      mode === m.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-save-notes">Notes (optional)</Label>
              <Textarea
                id="quick-save-notes"
                rows={2}
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="Any context for this form…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveCurrentUrl} disabled={saving || !saveName.trim()}>
                {saving ? "Saving…" : "Save site"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
