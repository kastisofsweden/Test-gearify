import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  COMPANIES_KEY,
  DEFAULT_COMPANY_ID,
  selectClass,
  STAFF_KEY,
  useCompanies,
  useStaff,
  type StaffMember,
} from "@/components/admin/backofficeData";
import { formatSek } from "@/lib/rental";

type Draft = Omit<StaffMember, "id"> & { id?: string };

export function StaffTab() {
  const qc = useQueryClient();
  const { data: staff = [] } = useStaff();
  const { data: companies = [] } = useCompanies();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCompany, setNewCompany] = useState("");

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name.trim(),
        email: d.email.trim().toLowerCase(),
        user_id: d.user_id?.trim() || null,
        company_id: d.company_id,
        hourly_rate_sek: Number(d.hourly_rate_sek),
        is_active: d.is_active,
      };
      const { error } = d.id
        ? await supabase.from("staff").update(payload).eq("id", d.id)
        : await supabase.from("staff").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: STAFF_KEY });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "That email is already used" : e.message),
  });

  const addCompany = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("companies").insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCompany("");
      qc.invalidateQueries({ queryKey: COMPANIES_KEY });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "Company already exists" : e.message),
  });

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <div className="grid gap-2">
            <Label htmlFor="new-company">Companies</Label>
            <Input
              id="new-company"
              placeholder="New company name"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={newCompany.trim().length < 2}
            onClick={() => addCompany.mutate(newCompany)}
          >
            Add company
          </Button>
        </div>
        <Button
          onClick={() =>
            setDraft({
              name: "",
              email: "",
              user_id: null,
              company_id: DEFAULT_COMPANY_ID,
              hourly_rate_sek: 600,
              is_active: true,
            })
          }
        >
          <Plus className="size-4" /> New staff member
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Companies: {companies.map((c) => c.name).join(", ") || "—"}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Company</th>
              <th className="p-3">Hourly rate</th>
              <th className="p-3">Login linked</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr
                key={s.id}
                className="cursor-pointer border-t border-border hover:bg-secondary/50"
                onClick={() => setDraft({ ...s })}
              >
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3">{s.email}</td>
                <td className="p-3">{companyName(s.company_id)}</td>
                <td className="p-3">{formatSek(Number(s.hourly_rate_sek))}/h</td>
                <td className="p-3">{s.user_id ? "Yes" : "No"}</td>
                <td className="p-3">{s.is_active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <form
          className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.name.trim() || !draft.email.includes("@")) {
              toast.error("Name and a valid email are required");
              return;
            }
            save.mutate(draft);
          }}
        >
          <h2 className="font-display text-xl sm:col-span-2">
            {draft.id ? `Edit ${draft.name}` : "New staff member"}
          </h2>
          <div className="grid gap-2">
            <Label htmlFor="st-name">Name *</Label>
            <Input
              id="st-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-email">Email *</Label>
            <Input
              id="st-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-company">Company</Label>
            <select
              id="st-company"
              className={selectClass}
              value={draft.company_id}
              onChange={(e) => setDraft({ ...draft, company_id: e.target.value })}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-rate">Hourly rate (SEK)</Label>
            <Input
              id="st-rate"
              type="number"
              min={0}
              value={String(draft.hourly_rate_sek)}
              onChange={(e) => setDraft({ ...draft, hourly_rate_sek: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="st-user">Linked login user id (optional)</Label>
            <Input
              id="st-user"
              placeholder="uuid of the account, so My jobs shows their assignments"
              value={draft.user_id ?? ""}
              onChange={(e) => setDraft({ ...draft, user_id: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.is_active}
              onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
            />
            Active
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
