export const OUTCOME_LABELS: Record<string, string> = {
  filled_only: "Filled, not submitted",
  submitted: "Submitted successfully",
  validation_blocked: "Blocked by validation",
  no_submit_button: "No submit button found",
  submit_error: "Submit failed",
  unknown_result: "Submitted, result unclear",
  error: "Test failed",
};

export const MODE_LABELS: Record<string, string> = {
  fill_only: "Fill only",
  fill_submit: "Fill & submit",
};

export function outcomeTone(outcome: string | null, passed: boolean | null) {
  if (passed) return "pass";
  if (outcome === "validation_blocked" || outcome === "unknown_result") return "warn";
  if (!outcome) return "muted";
  return "fail";
}

export function toneClasses(tone: string) {
  switch (tone) {
    case "pass":
      return "border-primary/40 bg-primary/10 text-primary";
    case "warn":
      return "border-warning/40 bg-warning/10 text-warning";
    case "fail":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
