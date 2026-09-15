import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink, Square, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { runTest, type TestMode } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface BatchItem {
  id: string;
  url: string;
  targetId?: string;
  status: "idle" | "queued" | "running" | "passed" | "failed" | "error";
  runId?: string;
  fieldsFilled?: number;
  fieldsFound?: number;
  errorMessage?: string;
  durationMs?: number;
}

export function BatchTester({
  initialUrls = [],
  defaultMode = "fill_only",
  onCompleted,
}: {
  initialUrls?: { url: string; targetId?: string }[];
  defaultMode?: TestMode;
  onCompleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const run = useServerFn(runTest);

  const [rawText, setRawText] = useState(
    initialUrls.length ? initialUrls.map((u) => u.url).join("\n") : ""
  );
  const [mode, setMode] = useState<TestMode>(defaultMode);
  const [items, setItems] = useState<BatchItem[]>(() =>
    initialUrls.map((u, i) => ({
      id: `init-${i}`,
      url: u.url,
      targetId: u.targetId,
      status: "idle",
    }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const cancelRef = useRef(false);

  // Parse lines into clean valid URLs
  const parseUrls = (text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && (line.startsWith("http://") || line.startsWith("https://") || line.includes(".")))
      .map((line) => (line.startsWith("http://") || line.startsWith("https://") ? line : `https://${line}`));
  };

  const detectedUrls = parseUrls(rawText);

  async function startBatch(urlsToRun?: BatchItem[]) {
    cancelRef.current = false;
    let queue: BatchItem[] = [];

    if (urlsToRun) {
      queue = urlsToRun.map((item) => ({ ...item, status: "queued", errorMessage: undefined }));
    } else {
      if (detectedUrls.length === 0) {
        toast.error("Please enter at least one valid website URL");
        return;
      }
      queue = detectedUrls.map((u, idx) => ({
        id: `batch-${Date.now()}-${idx}`,
        url: u,
        status: "queued",
      }));
    }

    setItems(queue);
    setIsRunning(true);

    for (let i = 0; i < queue.length; i++) {
      if (cancelRef.current) {
        setItems((prev) =>
          prev.map((item, idx) => (idx >= i && item.status === "queued" ? { ...item, status: "idle" } : item))
        );
        toast.info("Batch run cancelled");
        break;
      }

      const current = queue[i];
      setItems((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "running" } : item))
      );

      const startTime = Date.now();
      try {
        const res = await run({
          data: {
            url: current.url,
            mode,
            target_id: current.targetId ?? null,
          },
        });

        // Invalidate runs list so background queries reflect the new run
        queryClient.invalidateQueries({ queryKey: ["runs"] });

        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: "passed",
                  runId: res.id,
                  durationMs: Date.now() - startTime,
                }
              : item
          )
        );
      } catch (err) {
        const msg = (err as Error).message || "Execution error";
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: "failed",
                  errorMessage: msg,
                  durationMs: Date.now() - startTime,
                }
              : item
          )
        );
      }
    }

    setIsRunning(false);
    queryClient.invalidateQueries({ queryKey: ["runs"] });
    if (onCompleted) onCompleted();
  }

  function cancelBatch() {
    cancelRef.current = true;
  }

  function retryFailed() {
    const failedItems = items.filter((i) => i.status === "failed" || i.status === "error");
    if (failedItems.length === 0) return;
    startBatch(failedItems);
  }

  const total = items.length;
  const completed = items.filter((i) => ["passed", "failed", "error"].includes(i.status)).length;
  const passedCount = items.filter((i) => i.status === "passed").length;
  const failedCount = items.filter((i) => i.status === "failed" || i.status === "error").length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {!isRunning && total === 0 && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Target URLs (one per line)
              </label>
              {detectedUrls.length > 0 && (
                <span className="font-mono text-xs text-primary">
                  {detectedUrls.length} {detectedUrls.length === 1 ? "page" : "pages"} ready
                </span>
              )}
            </div>
            <Textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"https://example.com/contact\nhttps://example.com/signup\nhttps://example.com/feedback"}
              className="font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "fill_only",
                  title: "Fill only",
                  copy: "Autofill fields on all pages with test data. Safe, no submissions.",
                },
                {
                  value: "fill_submit",
                  title: "Fill & submit",
                  copy: "Fill and trigger submissions across all target pages.",
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
                    : "border-border bg-card hover:border-border/80 hover:bg-accent/40"
                )}
              >
                <span className="font-mono text-xs font-semibold tracking-wide text-foreground">
                  {option.title.toUpperCase()}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">{option.copy}</p>
              </button>
            ))}
          </div>

          <Button
            type="button"
            onClick={() => startBatch()}
            disabled={detectedUrls.length === 0}
            className="h-11 w-full"
          >
            <Play className="mr-2 h-4 w-4" /> Run batch test ({detectedUrls.length || 0} pages)
          </Button>
        </div>
      )}

      {(isRunning || total > 0) && (
        <div className="space-y-4 rounded-lg border border-border bg-card/60 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">
                {isRunning ? (
                  <span className="inline-flex items-center text-primary">
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Testing {completed + 1} of {total}…
                  </span>
                ) : (
                  <span>Batch complete ({completed}/{total})</span>
                )}
              </span>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-emerald-400">✓ {passedCount} passed</span>
                {failedCount > 0 && <span className="text-red-400">✗ {failedCount} failed</span>}
              </div>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs",
                  item.status === "running"
                    ? "border-primary/60 bg-primary/5"
                    : item.status === "passed"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : item.status === "failed"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border bg-card"
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">#{idx + 1}</span>
                  {item.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                  {item.status === "passed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  {item.status === "failed" && <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                  {item.status === "queued" && <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {item.status === "idle" && <div className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate font-mono text-foreground">{item.url}</span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.status === "running" && (
                    <Badge variant="outline" className="animate-pulse border-primary/50 text-[10px]">
                      Testing…
                    </Badge>
                  )}
                  {item.status === "queued" && (
                    <span className="font-mono text-[10px] text-muted-foreground">Queued</span>
                  )}
                  {item.status === "passed" && item.runId && (
                    <Link
                      to="/runs/$id"
                      params={{ id: item.runId }}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded border border-emerald-500/40 px-2 py-0.5 font-mono text-[10px] text-emerald-400 hover:bg-emerald-500/10"
                    >
                      Report <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  )}
                  {item.status === "failed" && (
                    <span className="font-mono text-[10px] text-red-400">
                      {item.errorMessage ? item.errorMessage.slice(0, 30) : "Failed"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border/60">
            {isRunning ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelBatch}
                className="h-8 text-xs text-destructive hover:bg-destructive/10"
              >
                <Square className="mr-1.5 h-3 w-3" /> Stop batch
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setItems([]);
                    setIsRunning(false);
                  }}
                  className="h-8 text-xs"
                >
                  <RotateCcw className="mr-1.5 h-3 w-3" /> New batch
                </Button>
                {failedCount > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={retryFailed}
                    className="h-8 text-xs"
                  >
                    Retry failed ({failedCount})
                  </Button>
                )}
              </div>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">
              Processed sequentially to ensure clean browser isolation.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
