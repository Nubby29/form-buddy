import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRuns } from "@/lib/api.functions";
import { AppShell } from "@/components/app-shell";
import { RunForm } from "@/components/run-form";
import { MODE_LABELS, OUTCOME_LABELS, formatDate, outcomeTone, toneClasses } from "@/lib/report-format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your form test runs — Formcheck" },
      { name: "description", content: "Start a new form test and review your recent test runs." },
      { property: "og:title", content: "Your form test runs — Formcheck" },
      { property: "og:description", content: "Start a form test and review recent runs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const fetchRuns = useServerFn(listRuns);
  const { data: runs, isLoading } = useQuery({ queryKey: ["runs"], queryFn: () => fetchRuns({}) });

  return (
    <AppShell>
      <section className="rounded-xl border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">Test a form</h1>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Paste any page with a form. We open it in a real browser, fill every field and capture
          what happens.
        </p>
        <RunForm />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Recent runs
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && !runs?.length && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No runs yet. Your first test will appear here.
          </p>
        )}
        <ul className="space-y-2">
          {runs?.map((run) => {
            const tone = run.status === "failed" ? "fail" : outcomeTone(run.outcome, run.passed);
            return (
              <li key={run.id}>
                <Link
                  to="/runs/$id"
                  params={{ id: run.id }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-foreground">{run.url}</p>
                    <p className="text-xs text-muted-foreground">
                      {MODE_LABELS[run.mode]} · {run.fields_filled}/{run.fields_found} fields ·{" "}
                      {formatDate(run.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded border px-2 py-1 font-mono text-[11px] uppercase tracking-wider",
                      toneClasses(tone),
                    )}
                  >
                    {run.status === "failed"
                      ? "failed"
                      : (OUTCOME_LABELS[run.outcome ?? ""] ?? run.status)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
