import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, Layers } from "lucide-react";
import { toast } from "sonner";
import { runTest, type TestMode } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BatchTester } from "@/components/batch-tester";
import { cn } from "@/lib/utils";

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
  const [running, setRunning] = useState(false);
  const navigate = useNavigate();
  const run = useServerFn(runTest);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setRunning(true);
    try {
      const result = await run({ data: { url, mode, target_id: targetId ?? null } });
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
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/contact"
                className="h-11 flex-1 font-mono text-sm"
                inputMode="url"
                aria-label="Website address to test"
              />
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
    </div>
  );
}
