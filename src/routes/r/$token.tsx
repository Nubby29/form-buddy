import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { getSharedReport } from "@/lib/api.functions";
import { ReportView } from "@/components/report-view";
import { Brand } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "Shared form test report — Formcheck" },
      {
        name: "description",
        content:
          "A shared, read-only form test report: fields filled, values used and screenshot evidence.",
      },
      { property: "og:title", content: "Shared form test report — Formcheck" },
      {
        property: "og:description",
        content: "Read-only evidence of an automated website form test.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharedReport,
});

function SharedReport() {
  const { token } = Route.useParams();
  const fetchReport = useServerFn(getSharedReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared", token],
    queryFn: () => fetchReport({ data: { token } }),
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print border-b border-border/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Brand />
          {data && (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Save as PDF
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {isLoading && <p className="text-sm text-muted-foreground">Loading report…</p>}
        {error && (
          <p className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            This report is not shared, or the link is no longer valid.
          </p>
        )}
        {data && (
          <ReportView
            run={{ ...data.run, id: data.run.id }}
            fields={data.fields}
            filledUrl={data.filledUrl}
            resultUrl={data.resultUrl}
          />
        )}
      </main>
    </div>
  );
}
