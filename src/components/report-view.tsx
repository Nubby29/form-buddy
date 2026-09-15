import { Check, X, Minus, ExternalLink, Layers } from "lucide-react";
import { MODE_LABELS, OUTCOME_LABELS, formatDate, outcomeTone, toneClasses } from "@/lib/report-format";
import { cn } from "@/lib/utils";

type RunRow = {
  id: string;
  url: string;
  mode: string;
  status: string;
  outcome: string | null;
  passed: boolean | null;
  page_title: string | null;
  form_selector: string | null;
  fields_found: number;
  fields_filled: number;
  result_text: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
};


export type SiblingRun = {
  id: string;
  page_title: string | null;
  form_selector: string | null;
  passed: boolean | null;
  outcome: string | null;
  fields_found: number;
  fields_filled: number;
  created_at?: string;
  share_token?: string;
};

type FieldRow = {
  id: string;
  label: string | null;
  selector: string | null;
  field_type: string | null;
  value_used: string | null;
  required: boolean;
  filled: boolean;
  note: string | null;
};

export function ReportView({
  run,
  fields,
  filledUrl,
  resultUrl,
  siblings,
  onSelectSibling,
}: {
  run: RunRow;
  fields: FieldRow[];
  filledUrl: string | null;
  resultUrl: string | null;
  siblings?: SiblingRun[];
  onSelectSibling?: (sibling: SiblingRun) => void;
}) {
  const tone = run.status === "failed" ? "fail" : outcomeTone(run.outcome, run.passed);
  const verdict =
    run.status === "failed" ? "FAILED" : run.passed ? "PASS" : tone === "warn" ? "REVIEW" : "FAIL";

  return (
    <div className="space-y-6">
      {siblings && siblings.length > 1 && (
        <section className="no-print rounded-xl border border-border bg-card/60 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Multiple forms tested on this page ({siblings.length})
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Switch form to view its individual results
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {siblings.map((sib, idx) => {
              const isCurrent = sib.id === run.id;
              const formNum = idx + 1;
              let formLabel = `Form ${formNum}`;
              if (sib.page_title) {
                const match = sib.page_title.match(/Form \d+[:\s•]*(.*)/i);
                if (match && match[1]?.trim()) {
                  formLabel = `Form ${formNum}: ${match[1].trim()}`;
                }
              }
              const sibPassed = sib.passed;
              return (
                <button
                  key={sib.id}
                  type="button"
                  onClick={() => onSelectSibling?.(sib)}
                  className={cn(
                    "group inline-flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-left text-sm transition-all cursor-pointer",
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary font-medium shadow-sm ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-border/80 hover:bg-accent/40 text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      sibPassed
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {sibPassed ? "✓" : "✗"}
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate max-w-[14rem] sm:max-w-[20rem] font-medium">
                      {formLabel}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {sib.fields_filled}/{sib.fields_found} fields • {sibPassed ? "Passed" : "Needs review"}
                    </span>
                  </div>
                  {isCurrent && (
                    <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                      Viewing
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Test report
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold text-foreground">
              {run.page_title || run.url}
            </h1>
            <a
              href={run.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 break-all font-mono text-xs text-muted-foreground hover:text-primary"
            >
              {run.url} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <span
            className={cn(
              "rounded-md border px-3 py-1.5 font-mono text-sm font-semibold tracking-widest",
              toneClasses(tone),
            )}
          >
            {verdict}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border/70 pt-4 sm:grid-cols-4">
          <Stat label="Mode" value={MODE_LABELS[run.mode] ?? run.mode} />
          <Stat
            label="Outcome"
            value={
              run.status === "failed"
                ? "Could not run"
                : (OUTCOME_LABELS[run.outcome ?? ""] ?? run.outcome ?? "—")
            }
          />
          <Stat label="Fields filled" value={`${run.fields_filled} / ${run.fields_found}`} />
          <Stat
            label="Duration"
            value={run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"}
          />
        </dl>
        <p className="mt-3 font-mono text-xs text-muted-foreground">{formatDate(run.created_at)}</p>

        {run.error_message && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {run.error_message}
          </p>
        )}
        {run.result_text && (
          <div className="mt-4 rounded-md border border-border bg-background/60 p-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Page response
            </p>
            <p className="mt-1 text-sm text-foreground">{run.result_text}</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Evidence title="1 — Filled form" url={filledUrl} />
        <Evidence
          title="2 — Result state"
          url={resultUrl}
          empty={
            run.mode === "fill_only"
              ? "Not captured — this run only filled the form."
              : "No result screenshot captured."
          }
        />
      </section>

      {fields.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Field checklist
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Value used</th>
                  <th className="px-5 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id} className="border-b border-border/40 last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="text-foreground">{f.label}</span>
                      {f.required && (
                        <span className="ml-2 font-mono text-[10px] uppercase text-warning">
                          required
                        </span>
                      )}
                      {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {f.field_type}
                    </td>
                    <td className="max-w-[22rem] px-3 py-2.5 font-mono text-xs text-foreground">
                      <span className="line-clamp-2 break-words">{f.value_used}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {f.filled ? (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      ) : (
                        <X className="ml-auto h-4 w-4 text-destructive" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Evidence({ title, url, empty }: { title: string; url: string | null; empty?: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card">
      <figcaption className="border-b border-border px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </figcaption>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer noopener">
          <img
            src={url}
            alt={title}
            loading="lazy"
            className="max-h-[520px] w-full bg-white object-contain object-top"
          />
        </a>
      ) : (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Minus className="h-4 w-4" /> {empty ?? "Not captured"}
        </div>
      )}
    </figure>
  );
}
