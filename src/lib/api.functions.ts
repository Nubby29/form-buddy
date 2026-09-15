import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TestMode = "fill_only" | "fill_submit";

const urlSchema = z
  .string()
  .trim()
  .min(3)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid website address");

const modeSchema = z.enum(["fill_only", "fill_submit"]);

type FieldResult = {
  label: string;
  selector: string;
  field_type: string;
  required: boolean;
  filled: boolean;
  value_used: string;
  note: string;
};

type SingleFormResult = {
  formIndex: number;
  ok?: boolean | undefined;
  reason?: string | undefined;
  message?: string | undefined;
  heading?: string | undefined;
  formSelector?: string | undefined;
  fields?: FieldResult[] | undefined;
  submitLabel?: string | undefined;
  submitted?: boolean | undefined;
  outcome?: string | undefined;
  resultText?: string | undefined;
  filledShot?: string | null | undefined;
  resultShot?: string | null | undefined;
};

type RunnerResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  title?: string;
  forms?: SingleFormResult[];
  fields?: FieldResult[];
  formSelector?: string;
  submitLabel?: string;
  submitted?: boolean;
  outcome?: string;
  resultText?: string;
  filledShot?: string | null;
  resultShot?: string | null;
  durationMs?: number;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------------------------- targets --------------------------------- */

export const listTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("targets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(80),
        url: urlSchema,
        default_mode: modeSchema,
        notes: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      name: data.name,
      url: data.url,
      default_mode: data.default_mode,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("targets").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("targets")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("targets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTarget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: target, error } = await context.supabase
      .from("targets")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!target) throw new Error("Saved site not found");
    const { data: runs } = await context.supabase
      .from("runs")
      .select("id, url, mode, status, outcome, passed, created_at, fields_found, fields_filled")
      .eq("target_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { target, runs: runs ?? [] };
  });

/* ----------------------------------- runs ----------------------------------- */

export const listRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("runs")
      .select(
        "id, url, mode, status, outcome, passed, created_at, fields_found, fields_filled, target_id",
      )
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function signedShots(
  filled: string | null,
  result: string | null,
): Promise<{ filledUrl: string | null; resultUrl: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data } = await supabaseAdmin.storage.from("shots").createSignedUrl(path, 60 * 60 * 6);
    return data?.signedUrl ?? null;
  };
  return { filledUrl: await sign(filled), resultUrl: await sign(result) };
}

export const getRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("runs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Report not found");
    const { data: fields } = await context.supabase
      .from("run_fields")
      .select("*")
      .eq("run_id", data.id)
      .order("order_index");
    const shots = await signedShots(run.filled_shot_path, run.result_shot_path);

    let siblings: Array<{
      id: string;
      page_title: string | null;
      form_selector: string | null;
      passed: boolean | null;
      outcome: string | null;
      fields_found: number;
      fields_filled: number;
      created_at: string;
    }> = [];

    try {
      const createdAtMs = new Date(run.created_at).getTime();
      const windowStart = new Date(createdAtMs - 180_000).toISOString();
      const windowEnd = new Date(createdAtMs + 180_000).toISOString();

      const { data: sibs } = await context.supabase
        .from("runs")
        .select("id, page_title, form_selector, passed, outcome, fields_found, fields_filled, created_at")
        .eq("user_id", run.user_id)
        .eq("url", run.url)
        .gte("created_at", windowStart)
        .lte("created_at", windowEnd)
        .order("created_at", { ascending: true });

      if (sibs && sibs.length > 1) {
        // Only cluster runs created contiguously in the same test execution (within 35s of each other)
        const sorted = [...sibs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const currentIdx = sorted.findIndex((s) => s.id === run.id);
        if (currentIdx !== -1) {
          const MAX_GAP_MS = 35_000;
          let left = currentIdx;
          while (left > 0) {
            const gap =
              new Date(sorted[left]!.created_at).getTime() -
              new Date(sorted[left - 1]!.created_at).getTime();
            if (gap <= MAX_GAP_MS) {
              left--;
            } else {
              break;
            }
          }
          let right = currentIdx;
          while (right < sorted.length - 1) {
            const gap =
              new Date(sorted[right + 1]!.created_at).getTime() -
              new Date(sorted[right]!.created_at).getTime();
            if (gap <= MAX_GAP_MS) {
              right++;
            } else {
              break;
            }
          }
          const cluster = sorted.slice(left, right + 1);
          if (cluster.length > 1) {
            siblings = cluster;
          }
        }
      }
    } catch {}

    return { run, fields: fields ?? [], siblings, ...shots };
  });

export const setRunSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_public: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("runs")
      .update({ is_public: data.is_public })
      .eq("id", data.id)
      .select("share_token, is_public")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public, read-only report fetched by its unguessable share token. */
export const getSharedReport = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run } = await supabaseAdmin
      .from("runs")
      .select("*")
      .eq("share_token", data.token)
      .eq("is_public", true)
      .maybeSingle();
    if (!run) throw new Error("This report is not shared or no longer exists");
    const { data: fields } = await supabaseAdmin
      .from("run_fields")
      .select("*")
      .eq("run_id", run.id)
      .order("order_index");
    const shots = await signedShots(run.filled_shot_path, run.result_shot_path);

    let siblings: Array<{
      id: string;
      page_title: string | null;
      form_selector: string | null;
      passed: boolean | null;
      outcome: string | null;
      fields_found: number;
      fields_filled: number;
      created_at: string;
      share_token?: string;
    }> = [];

    try {
      const createdAtMs = new Date(run.created_at).getTime();
      const windowStart = new Date(createdAtMs - 180_000).toISOString();
      const windowEnd = new Date(createdAtMs + 180_000).toISOString();

      const { data: sibs } = await supabaseAdmin
        .from("runs")
        .select("id, page_title, form_selector, passed, outcome, fields_found, fields_filled, created_at, share_token, is_public")
        .eq("user_id", run.user_id)
        .eq("url", run.url)
        .gte("created_at", windowStart)
        .lte("created_at", windowEnd)
        .order("created_at", { ascending: true });

      if (sibs && sibs.length > 1) {
        const publicSibs = sibs.filter((s: any) => s.is_public);
        const sorted = [...publicSibs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const currentIdx = sorted.findIndex((s) => s.id === run.id);
        if (currentIdx !== -1) {
          const MAX_GAP_MS = 35_000;
          let left = currentIdx;
          while (left > 0) {
            const gap =
              new Date(sorted[left]!.created_at).getTime() -
              new Date(sorted[left - 1]!.created_at).getTime();
            if (gap <= MAX_GAP_MS) {
              left--;
            } else {
              break;
            }
          }
          let right = currentIdx;
          while (right < sorted.length - 1) {
            const gap =
              new Date(sorted[right + 1]!.created_at).getTime() -
              new Date(sorted[right]!.created_at).getTime();
            if (gap <= MAX_GAP_MS) {
              right++;
            } else {
              break;
            }
          }
          const cluster = sorted.slice(left, right + 1);
          if (cluster.length > 1) {
            siblings = cluster;
          }
        }
      }
    } catch {}

    const { user_id: _userId, ...safeRun } = run;
    return { run: safeRun, fields: fields ?? [], siblings, ...shots };
  });

/* --------------------------------- execution -------------------------------- */

export const runTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        url: urlSchema,
        mode: modeSchema,
        target_id: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = process.env["BROWSERLESS_TOKEN"];
    const { supabase, userId } = context;

    const { data: run, error: insertError } = await supabase
      .from("runs")
      .insert({
        user_id: userId,
        url: data.url,
        mode: data.mode,
        target_id: data.target_id ?? null,
        status: "running",
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    const runId = run.id as string;

    const fail = async (message: string) => {
      await supabase
        .from("runs")
        .update({ status: "failed", outcome: "error", passed: false, error_message: message })
        .eq("id", runId);
      return { id: runId };
    };

    if (!token) return fail("The browser testing service is not configured yet.");

    let result: RunnerResult;
    try {
      const { BROWSER_SCRIPT } = await import("./browser-script.server");
      const res = await fetch(
        `https://production-sfo.browserless.io/function?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: BROWSER_SCRIPT,
            context: { url: data.url, mode: data.mode },
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        return fail(`Browser service error (${res.status}): ${text.slice(0, 300)}`);
      }
      const rawBody: unknown = await res.json();
      const wrapper = rawBody as { data?: RunnerResult; ok?: boolean } | null;
      // Browserless may return the runner's { data, type } wrapper instead of the unwrapped payload
      if (wrapper && typeof wrapper === "object" && wrapper.data && typeof wrapper.data === "object" && !("ok" in wrapper)) {
        result = wrapper.data;
      } else {
        result = (rawBody ?? {}) as RunnerResult;
      }
    } catch (e) {
      return fail(`Could not reach the browser service: ${(e as Error).message}`);
    }

    if (!result.ok) {
      const reason =
        result.reason === "no_fields"
          ? (result.message || "No fillable form fields were found on this page.")
          : result.reason === "navigation_failed"
            ? `The page could not be loaded: ${result.message ?? "unknown error"}`
            : `The test could not be completed. Runner returned: ${JSON.stringify(result).slice(0, 200)}`;
      return fail(reason);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const formsToRecord: SingleFormResult[] =
      result.forms && result.forms.length > 0
        ? result.forms
        : [
            {
              formIndex: 0,
              heading: result.title ?? "Form 1",
              formSelector: result.formSelector,
              fields: result.fields ?? [],
              submitLabel: result.submitLabel,
              submitted: result.submitted,
              outcome: result.outcome,
              resultText: result.resultText,
              filledShot: result.filledShot,
              resultShot: result.resultShot,
            },
          ];

    const allRunIds: string[] = [];

    for (let i = 0; i < formsToRecord.length; i++) {
      const f = formsToRecord[i]!;
      let currentRunId = runId;

      if (i > 0) {
        // Create an additional run record for subsequent forms on the same page
        const { data: nextRun, error: nextError } = await supabase
          .from("runs")
          .insert({
            user_id: userId,
            url: data.url,
            mode: data.mode,
            target_id: data.target_id ?? null,
            status: "running",
          })
          .select("id")
          .single();
        if (nextError || !nextRun) {
          throw new Error(
            `Could not record form ${i + 1} of ${formsToRecord.length}: ${
              nextError?.message ?? "run row was not created"
            }`,
          );
        }
        currentRunId = nextRun.id as string;
      }

      allRunIds.push(currentRunId);

      if (f.ok === false) {
        await supabase
          .from("runs")
          .update({
            status: "failed",
            outcome: "error",
            passed: false,
            page_title: f.heading ?? null,
            error_message:
              f.message ?? f.reason ?? "This form could not be filled by the automated test.",
          })
          .eq("id", currentRunId);
        continue;
      }

      const upload = async (b64: string | null | undefined, name: string) => {
        if (!b64) return null;
        const path = `${userId}/${currentRunId}-${name}.png`;
        const { error } = await supabaseAdmin.storage
          .from("shots")
          .upload(path, b64ToBytes(b64), { contentType: "image/png", upsert: true });
        if (error) return null;
        return path;
      };

      const filledPath = await upload(f.filledShot, "filled");
      const resultPath = await upload(f.resultShot, "result");

      const fields = f.fields ?? [];
      const filledCount = fields.filter((field) => field.filled).length;
      const outcome = f.outcome ?? "filled_only";
      const passed =
        data.mode === "fill_only"
          ? fields.length > 0 && filledCount === fields.length
          : outcome === "submitted" && filledCount === fields.length;

      if (fields.length) {
        await supabaseAdmin.from("run_fields").insert(
          fields.map((field, fieldIdx) => ({
            run_id: currentRunId,
            user_id: userId,
            label: field.label,
            selector: field.selector,
            field_type: field.field_type,
            value_used: field.value_used,
            required: !!field.required,
            filled: !!field.filled,
            note: field.note || null,
            order_index: fieldIdx,
          })),
        );
      }

      const formTitleSuffix =
        formsToRecord.length > 1
          ? ` • Form ${i + 1}${f.heading ? `: ${f.heading}` : ""}`
          : "";
      const fullPageTitle = (result.title ? `${result.title}${formTitleSuffix}` : f.heading ?? null);

      await supabase
        .from("runs")
        .update({
          status: "done",
          outcome,
          passed,
          page_title: fullPageTitle,
          form_selector: f.formSelector ?? null,
          fields_found: fields.length,
          fields_filled: filledCount,
          filled_shot_path: filledPath,
          result_shot_path: resultPath,
          result_text: f.resultText ?? null,
          duration_ms: result.durationMs ?? null,
        })
        .eq("id", currentRunId);
    }

    return { id: runId, ids: allRunIds };
  });

function decodeHtmlEntities(str: string): string {
  let prev = "";
  let curr = str;
  for (let i = 0; i < 3 && prev !== curr; i++) {
    prev = curr;
    curr = curr
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&ndash;/g, "–")
      .replace(/&mdash;/g, "—")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, "\"")
      .replace(/&hellip;/g, "…")
      .replace(/&#(\d+);/g, (_, dec) => {
        const code = parseInt(dec, 10);
        return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const code = parseInt(hex, 16);
        return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
      });
  }
  return curr;
}

export const fetchPageTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ url: z.string().trim() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const targetUrl = data.url.startsWith("http") ? data.url : `https://${data.url}`;
      const res = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(4000),
      });
      const html = await res.text();
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (match && match[1]) {
        const raw = match[1].trim().replace(/\s+/g, " ");
        const decoded = decodeHtmlEntities(raw);
        const clean = decoded.split(/[|•–—]/)[0].trim() || decoded;
        return { title: clean };
      }
    } catch {}
    return { title: null };
  });
