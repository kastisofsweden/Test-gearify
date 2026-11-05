import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin sign in | Renthub" },
      {
        name: "description",
        content: "Sign in to the Renthub back office to manage leads and offers.",
      },
      { property: "og:title", content: "Admin sign in | Renthub" },
      { property: "og:description", content: "Sign in to the Renthub back office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/admin" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/reset-password",
      });
      // Only rate limiting is surfaced; anything else stays neutral so the
      // form never reveals whether an address has an account.
      if (error && error.status === 429) {
        toast.error("Too many requests. Please wait a moment and try again.");
        return;
      }
      setResetSent(true);
    } catch {
      setResetSent(true);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: "signin" | "forgot") => {
    setMode(next);
    setResetSent(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16 font-sans">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="Renthub.se home" className="inline-flex">
          <BrandLogo className="h-9 w-auto max-w-[240px]" />
        </Link>
        <div className="mt-6 rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-elegant)]">
          <h1 className="font-display text-3xl tracking-wide">
            {mode === "signin" ? "Back office sign in" : "Reset password"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "Enter your email and we will send you a link to choose a new password."
              : "Manage leads, build offers and send them out."}
          </p>

          {mode === "forgot" ? (
            resetSent ? (
              <div
                role="status"
                className="mt-6 rounded-xl border border-border bg-muted/50 p-4 text-sm"
              >
                If the address has an account, a reset link has been sent. Check your inbox and spam
                folder.
              </div>
            ) : (
              <form onSubmit={onForgot} className="mt-6 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? "Please wait…" : "Send reset link"}
                </Button>
              </form>
            )
          ) : (
            <form onSubmit={onSubmit} className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "Please wait…" : "Sign in"}
              </Button>
            </form>
          )}

          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="mt-5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to sign in
            </button>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Staff accounts are invite-only. Ask an admin for an invitation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
