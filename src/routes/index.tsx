import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, ArrowRight, ShieldCheck, Camera, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Form Buddy — Automated Website Form Testing" },
      {
        name: "description",
        content:
          "Test web forms on any website automatically. Enter a link to detect inputs, autofill test data, capture before & after screenshots, and get instant diagnostic reports.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { user } = useSession();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-base font-semibold tracking-[0.18em]">
            <ScanLine className="h-5 w-5 text-primary" />
            FORMCHECK
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-accent/40 px-3 py-1 text-xs font-mono text-muted-foreground mb-6">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Zero-config headless form automation
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight">
            Automate form testing on any website with just a link.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Form Buddy opens any webpage in a real browser, maps every input, populates realistic dummy
            data, and captures targeted screenshots of the filled and post-submit states.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="h-12 px-8 font-medium gap-2">
              <Link to={user ? "/dashboard" : "/auth"}>
                {user ? "Open Dashboard" : "Start Testing Free"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-12 border-t border-border/60">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Two Testing Modes</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Choose <strong>Fill Only</strong> to inspect field detection and autofill safety without
                triggering actions, or <strong>Fill & Submit</strong> to verify live validation and response banners.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Camera className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Targeted Visual Snapshots</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Side-by-side cropped screenshots centered on your form containers before and after
                submission to review real UI outcomes at a glance.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Auditable Reports & Saved Sites</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Get field-by-field pass/fail checklists, export PDF summaries, generate shareable links for
                team reviews, and save frequent targets.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Form Buddy. Headless automated form testing.</p>
      </footer>
    </div>
  );
}
