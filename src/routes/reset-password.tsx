import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  // The recovery session only exists in the browser (URL + local storage).
  ssr: false,
  head: () => ({
    meta: [
      { title: "Choose a new password | Renthub" },
      { name: "description", content: "Set a new password for your Renthub back office account." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Choose a new password | Renthub" },
      {
        property: "og:description",
        content: "Set a new password for your Renthub back office account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type LinkState = "checking" | "ready" | "invalid";

function readUrlParams() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return {
    error: hash.get("error") ?? query.get("error"),
    errorDescription: hash.get("error_description") ?? query.get("error_description"),
    code: query.get("code"),
  };
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LinkState>("checking");
  const [reason, setReason] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const params = readUrlParams();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) setState("ready");
    });

    const resolve = async () => {
      if (params.error) {
        setReason(params.errorDescription?.replace(/\+/g, " ") ?? null);
        setState("invalid");
        return;
      }
      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (!active) return;
        if (error) {
          setReason(error.message);
          setState("invalid");
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        setState("ready");
        return;
      }
      // Implicit flow: the client parses the #access_token fragment during init;
      // getSession() waits for that to finish.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      setState((current) =>
        current === "ready" ? current : sessionData.session ? "ready" : "invalid",
      );
    };

    void resolve();
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("The password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("The passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated.");
      navigate({ to: "/admin", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16 font-sans">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="Renthub.se home" className="inline-flex">
          <BrandLogo className="h-9 w-auto max-w-[240px]" />
        </Link>
        <div className="mt-6 rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-elegant)]">
          <h1 className="font-display text-3xl tracking-wide">Choose a new password</h1>

          {state === "checking" && (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Checking your reset link…
            </p>
          )}

          {state === "invalid" && (
            <div className="mt-4 grid gap-4">
              <div
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
              >
                <p className="font-medium text-destructive">
                  This reset link is invalid or has expired.
                </p>
                {reason ? <p className="mt-1 text-muted-foreground">{reason}</p> : null}
                <p className="mt-2 text-muted-foreground">
                  Request a new link from the sign-in page.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/auth">Back to sign in</Link>
              </Button>
            </div>
          )}

          {state === "ready" && (
            <form onSubmit={onSubmit} className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={tooShort || undefined}
                  required
                />
                <p className={`text-xs ${tooShort ? "text-destructive" : "text-muted-foreground"}`}>
                  At least 8 characters.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch || undefined}
                  required
                />
                {mismatch ? (
                  <p className="text-xs text-destructive">The passwords do not match.</p>
                ) : null}
              </div>
              <Button
                type="submit"
                disabled={saving || password.length < 8 || password !== confirm}
              >
                {saving ? "Saving…" : "Save new password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
