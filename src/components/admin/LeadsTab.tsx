import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_STATUSES, formatDate, type Lead } from "@/lib/rental";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

const statusTone: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  contacted: "bg-accent text-accent-foreground border-border",
  quoted: "bg-chart-2/20 text-foreground border-border",
  won: "bg-chart-2/25 text-foreground border-chart-2/40",
  lost: "bg-destructive/15 text-destructive border-destructive/30",
};

export function LeadStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={statusTone[status] ?? "border-border"}>
      {status}
    </Badge>
  );
}

export function LeadsTab({ onCreateOffer }: { onCreateOffer: (lead: Lead) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Lead> }) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createLead = useMutation({
    mutationFn: async (payload: Partial<Lead>) => {
      const { error } = await supabase.from("leads").insert({
        name: payload.name!,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        company: payload.company ?? null,
        message: payload.message ?? null,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setCreateOpen(false);
      toast.success("Lead created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(
    () =>
      leads.filter((lead) => {
        const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
        const haystack = `${lead.name} ${lead.email ?? ""} ${lead.company ?? ""}`.toLowerCase();
        return matchesStatus && haystack.includes(search.toLowerCase());
      }),
    [leads, search, statusFilter],
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, email, company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> New lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New lead</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createLead.mutate({
                  name: String(fd.get("name") ?? "").trim(),
                  email: String(fd.get("email") ?? "").trim() || null,
                  phone: String(fd.get("phone") ?? "").trim() || null,
                  company: String(fd.get("company") ?? "").trim() || null,
                  message: String(fd.get("message") ?? "").trim() || null,
                });
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required maxLength={120} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" maxLength={200} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" maxLength={40} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" maxLength={120} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" name="message" rows={3} maxLength={2000} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createLead.isPending}>
                  Save lead
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Lead</th>
              <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Contact</th>
              <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Dates</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading leads…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No leads yet.
                </td>
              </tr>
            )}
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-t border-border/70 hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <button className="text-left" onClick={() => setSelected(lead)}>
                    <span className="font-medium">{lead.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {lead.company || lead.source} · {formatDate(lead.created_at)}
                    </span>
                  </button>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  <span className="block">{lead.email ?? "—"}</span>
                  <span className="block text-xs">{lead.phone ?? ""}</span>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                  {formatDate(lead.rental_start)} – {formatDate(lead.rental_end)}
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={lead.status}
                    onValueChange={(value) =>
                      updateLead.mutate({ id: lead.id, patch: { status: value } })
                    }
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelected(lead)}>
                      Open
                    </Button>
                    <Button size="sm" onClick={() => onCreateOffer(lead)}>
                      Offer
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeadDetailDialog
        lead={selected}
        onClose={() => setSelected(null)}
        onSave={(patch) => selected && updateLead.mutate({ id: selected.id, patch })}
        onCreateOffer={(lead) => {
          setSelected(null);
          onCreateOffer(lead);
        }}
      />
    </div>
  );
}

function LeadDetailDialog({
  lead,
  onClose,
  onSave,
  onCreateOffer,
}: {
  lead: Lead | null;
  onClose: () => void;
  onSave: (patch: Partial<Lead>) => void;
  onCreateOffer: (lead: Lead) => void;
}) {
  const [notes, setNotes] = useState("");
  const [followup, setFollowup] = useState("");

  useEffect(() => {
    setNotes(lead?.notes ?? "");
    setFollowup(lead?.followup_date ?? "");
  }, [lead]);

  if (!lead) return null;

  return (
    <Dialog open={Boolean(lead)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">{lead.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          <div className="grid gap-1 rounded-xl border border-border bg-secondary/40 p-4">
            <span>{lead.email ?? "No email"}</span>
            <span>{lead.phone ?? "No phone"}</span>
            <span className="text-muted-foreground">
              {lead.company ?? "—"} · source: {lead.source}
            </span>
            <span className="text-muted-foreground">
              Rental: {formatDate(lead.rental_start)} – {formatDate(lead.rental_end)}
            </span>
          </div>
          {lead.message && (
            <p className="rounded-xl border border-border p-4 text-muted-foreground">
              {lead.message}
            </p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="followup">Follow-up date</Label>
            <Input
              id="followup"
              type="date"
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea
              id="notes"
              rows={4}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onCreateOffer(lead)}>
            Create offer
          </Button>
          <Button
            onClick={() => {
              onSave({ notes: notes || null, followup_date: followup || null });
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
