import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2, ExternalLink, Globe, Play, Layers } from "lucide-react";
import { BatchTester } from "@/components/batch-tester";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RunForm } from "@/components/run-form";
import { listTargets, saveTarget, deleteTarget, type TestMode } from "@/lib/api.functions";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { MODE_LABELS, formatDate } from "@/lib/report-format";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({
    meta: [
      { title: "Saved Sites — Formcheck" },
      { name: "description", content: "Manage your saved websites and automated test targets." },
    ],
  }),
  component: TargetsPage,
});

function TargetsPage() {
  const queryClient = useQueryClient();
  const fetchTargets = useServerFn(listTargets);
  const addTarget = useServerFn(saveTarget);
  const removeTarget = useServerFn(deleteTarget);

  const [open, setOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<TestMode>("fill_only");
  const [notes, setNotes] = useState("");

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["targets"],
    queryFn: () => fetchTargets({}),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      return await addTarget({
        data: {
          name,
          url,
          default_mode: mode,
          notes: notes.trim() ? notes : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Site saved successfully");
      queryClient.invalidateQueries({ queryKey: ["targets"] });
      setOpen(false);
      setName("");
      setUrl("");
      setMode("fill_only");
      setNotes("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save site");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await removeTarget({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Site removed");
      queryClient.invalidateQueries({ queryKey: ["targets"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete site");
    },
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Saved Sites</h1>
          <p className="text-sm text-muted-foreground">
            Save forms you frequently test to rerun checks with one click.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {targets.length > 0 && (
            <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
                  <Layers className="h-4 w-4" /> Batch test all ({targets.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Batch test saved sites</DialogTitle>
                  <DialogDescription>
                    Run automated form tests across your saved websites.
                  </DialogDescription>
                </DialogHeader>
                <div className="pt-2">
                  <BatchTester
                    initialUrls={targets.map((t: any) => ({ url: t.url, targetId: t.id }))}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add Site
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Save a target site</DialogTitle>
              <DialogDescription>
                Add a website form target to your saved sites list for quick testing.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
              className="space-y-4 pt-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor="target-name">Site Name</Label>
                <Input
                  id="target-name"
                  placeholder="e.g. Lead Contact Form"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="target-url">URL</Label>
                <Input
                  id="target-url"
                  placeholder="https://example.com/contact"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Default Test Mode</Label>
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
                      className={`rounded-md border p-2.5 text-xs font-medium transition-colors ${
                        mode === m.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="target-notes">Notes (optional)</Label>
                <Textarea
                  id="target-notes"
                  placeholder="Any testing notes, credentials, or context..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending || !name || !url}>
                  {saveMutation.isPending ? "Saving..." : "Save site"}
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>


      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Loading saved sites…
        </div>
      ) : targets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Globe className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h3 className="mt-3 text-sm font-semibold">No saved sites yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Save frequently checked forms here to run automated audits anytime.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {targets.map((target) => (
            <div
              key={target.id}
              className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground line-clamp-1">{target.name}</h3>
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-secondary-foreground">
                    {MODE_LABELS[target.default_mode as TestMode] || target.default_mode}
                  </span>
                </div>

                <a
                  href={target.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary break-all"
                >
                  {target.url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>

                {target.notes && (
                  <p className="mt-3 text-xs text-muted-foreground/80 line-clamp-2">
                    {target.notes}
                  </p>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-border/60">
                {activeTargetId === target.id ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Quick Test</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setActiveTargetId(null)}
                      >
                        Close
                      </Button>
                    </div>
                    <RunForm
                      defaultUrl={target.url}
                      defaultMode={target.default_mode as TestMode}
                      targetId={target.id}
                      compact
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Added {formatDate(target.created_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(target.id)}
                        disabled={deleteMutation.isPending}
                        title="Delete target"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5 h-8 px-3"
                        onClick={() => setActiveTargetId(target.id)}
                      >
                        <Play className="h-3 w-3" /> Test
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
