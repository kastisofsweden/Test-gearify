import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_SETTINGS_QUERY_KEY, useAppSettings } from "@/components/admin/labelContext";
import { checkQrDomains } from "@/lib/qrSettings.functions";
import { normalizeBaseUrl, resolveQrBaseUrl } from "@/lib/unitUrls";

/** Admin: QR base URL for new labels + legacy QR domains that must keep serving /i/<token>. */
export function QrSettingsTab() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useAppSettings();
  const [base, setBase] = useState<string | null>(null);
  const [newLegacy, setNewLegacy] = useState("");
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({});
  const check = useServerFn(checkQrDomains);

  const legacy = settings?.qr_legacy_domains ?? [];
  const effective = resolveQrBaseUrl(
    settings,
    import.meta.env["VITE_PUBLIC_SITE_URL"] as string | undefined,
    typeof window !== "undefined" ? window.location.origin : null,
  );

  const save = useMutation({
    mutationFn: async (patch: { qr_base_url?: string | null; qr_legacy_domains?: string[] }) => {
      const { error } = await supabase.from("app_settings").update(patch).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: APP_SETTINGS_QUERY_KEY });
      setBase(null);
      setNewLegacy("");
      toast.success("QR settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runCheck = useMutation({
    mutationFn: () => check({ data: { domains: [effective, ...legacy].slice(0, 10) } }),
    onSuccess: (rows) =>
      setResults(Object.fromEntries(rows.map((r) => [r.domain, { ok: r.ok, detail: r.detail }]))),
    onError: (e: Error) =>
      toast.error(
        e.message.includes("rate_limited") ? "Wait 30 seconds between checks" : e.message,
      ),
  });

  const submitBase = () => {
    const raw = (base ?? "").trim();
    const n = raw ? normalizeBaseUrl(raw) : null;
    if (raw && !n) {
      toast.error("Enter an https address without a path, e.g. https://qr.renthub.se");
      return;
    }
    save.mutate({ qr_base_url: n });
  };

  const status = (d: string) => {
    const r = results[d];
    if (!r) return null;
    return (
      <span className={r.ok ? "text-xs text-primary" : "text-xs text-destructive"}>
        {r.ok ? "OK" : `Fail — ${r.detail}`}
      </span>
    );
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid max-w-3xl gap-5">
      <div>
        <h2 className="font-display text-2xl">QR domain</h2>
        <p className="text-sm text-muted-foreground">
          New labels encode <span className="font-mono">{effective}/i/&lt;token&gt;</span>. The
          token never changes, so a label keeps working as long as its domain still serves this app.
        </p>
      </div>

      <form
        className="grid gap-3 rounded-2xl border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submitBase();
        }}
      >
        <Label htmlFor="qr-base">QR base URL for new labels</Label>
        <Input
          id="qr-base"
          placeholder="https://qr.renthub.se (empty = site address / browser origin)"
          value={base ?? settings?.qr_base_url ?? ""}
          onChange={(e) => setBase(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          When you change it, the previous address is added to the legacy list automatically. Use
          one permanent domain (e.g. qr.renthub.se) that never changes.
        </p>
        <div>
          <Button type="submit" disabled={save.isPending || base === null}>
            Save
          </Button>
        </div>
      </form>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">Domains used on printed labels</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCheck.mutate()}
            disabled={runCheck.isPending}
          >
            {runCheck.isPending ? "Checking…" : "Check domains"}
          </Button>
        </div>
        <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs">
          Old QR domains must keep pointing at this project (or redirect), otherwise labels already
          printed stop working.
        </p>
        <ul className="grid gap-2 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span className="font-mono">{effective}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              current {status(effective)}
            </span>
          </li>
          {legacy.map((d) => (
            <li key={d} className="flex items-center justify-between gap-3">
              <span className="font-mono">{d}</span>
              <span className="flex items-center gap-2">
                {status(d)}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Remove ${d}? Labels printed with it are not changed.`))
                      save.mutate({ qr_legacy_domains: legacy.filter((x) => x !== d) });
                  }}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = normalizeBaseUrl(newLegacy);
            if (!n) {
              toast.error("Enter an https address, e.g. https://old.example.se");
              return;
            }
            save.mutate({ qr_legacy_domains: [...legacy, n] });
          }}
        >
          <Input
            placeholder="Add a domain used on old labels"
            value={newLegacy}
            onChange={(e) => setNewLegacy(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!newLegacy.trim()}>
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}
