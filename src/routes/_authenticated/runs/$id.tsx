import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Printer, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getRun, setRunSharing, deleteRun } from "@/lib/api.functions";
import { AppShell } from "@/components/app-shell";
import { ReportView } from "@/components/report-view";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/runs/$id")({
  head: () => ({
    meta: [
      { title: "Form test report — Formcheck" },
      {
        name: "description",
        content: "Field-by-field checklist and screenshot evidence for this form test run.",
      },
      { property: "og:title", content: "Form test report — Formcheck" },
      { property: "og:description", content: "Checklist and screenshot evidence for a form test." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RunReport,
});

function RunReport() {
  const { id } = Route.useParams();
  const fetchRun = useServerFn(getRun);
  const share = useServerFn(setRunSharing);
  const remove = useServerFn(deleteRun);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["run", id],
    queryFn: () => fetchRun({ data: { id } }),
  });

  const shareMutation = useMutation({
    mutationFn: (isPublic: boolean) => share({ data: { id, is_public: isPublic } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["run", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const shareUrl =
    data?.run.is_public && typeof window !== "undefined"
      ? `${window.location.origin}/r/${data.run.share_token}`
      : null;

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading report…</p>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">{(error as Error)?.message ?? "Report not found"}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All runs
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Save as PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!confirm("Delete this run and its report?")) return;
              await remove({ data: { id } });
              queryClient.invalidateQueries({ queryKey: ["runs"] });
              navigate({ to: "/dashboard" });
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <Share2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-foreground">Share by link</span>
        <Switch
          checked={!!data.run.is_public}
          onCheckedChange={(v) => shareMutation.mutate(v)}
          aria-label="Share this report by link"
        />
        {shareUrl && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
              {shareUrl}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <ReportView
        run={data.run}
        fields={data.fields}
        filledUrl={data.filledUrl}
        resultUrl={data.resultUrl}
        siblings={data.siblings}
        onSelectSibling={(sibling) => {
          navigate({ to: "/runs/$id", params: { id: sibling.id } });
        }}
      />
    </AppShell>
  );
}
