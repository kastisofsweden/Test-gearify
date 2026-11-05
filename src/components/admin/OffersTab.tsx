import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  OFFER_STATUSES,
  formatDate,
  formatSek,
  offerTotals,
  type Equipment,
  type Lead,
  type Offer,
  type OfferItem,
} from "@/lib/rental";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Plus, Send, Trash2, X } from "lucide-react";

type DraftItem = {
  id?: string;
  equipment_id: string | null;
  description: string;
  quantity: number;
  days: number;
  unit_price: number;
};

const statusTone: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  sent: "bg-primary/15 text-primary border-primary/30",
  accepted: "bg-chart-2/25 border-chart-2/40",
  declined: "bg-destructive/15 text-destructive border-destructive/30",
};

export function OffersTab({
  pendingLead,
  onConsumeLead,
}: {
  pendingLead: Lead | null;
  onConsumeLead: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<Lead | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (pendingLead) {
      setCreatingFor(pendingLead);
      setEditingId(null);
      setIsNew(true);
      onConsumeLead();
    }
  }, [pendingLead, onConsumeLead]);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Offer[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Offer deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isNew || editingId) {
    return (
      <OfferEditor
        offerId={editingId}
        lead={creatingFor}
        onClose={() => {
          setIsNew(false);
          setEditingId(null);
          setCreatingFor(null);
        }}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setCreatingFor(null);
            setIsNew(true);
          }}
        >
          <Plus className="size-4" /> New offer
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Offer</th>
              <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Customer</th>
              <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Rental</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading offers…
                </td>
              </tr>
            )}
            {!isLoading && offers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No offers yet.
                </td>
              </tr>
            )}
            {offers.map((offer) => (
              <tr key={offer.id} className="border-t border-border/70 hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <span className="font-medium">{offer.offer_number}</span>
                  <span className="block text-xs text-muted-foreground">{offer.title}</span>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {offer.customer_name ?? "—"}
                  <span className="block text-xs">{offer.customer_email ?? ""}</span>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                  {formatDate(offer.rental_start)} – {formatDate(offer.rental_end)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={statusTone[offer.status]}>
                    {offer.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {offer.status !== "draft" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `${window.location.origin}/offer/${offer.share_token}`,
                          );
                          toast.success("Share link copied");
                        }}
                      >
                        <Copy className="size-4" /> Link
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setEditingId(offer.id)}>
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete offer"
                      onClick={() => remove.mutate(offer.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OfferEditor({
  offerId,
  lead,
  onClose,
}: {
  offerId: string | null;
  lead: Lead | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: lead ? `AV rental — ${lead.name}` : "AV rental offer",
    customer_name: lead?.name ?? "",
    customer_email: lead?.email ?? "",
    rental_start: lead?.rental_start ?? "",
    rental_end: lead?.rental_end ?? "",
    discount_percent: 0,
    vat_percent: 25,
    valid_until: "",
    intro: "",
    terms:
      "Pickup in Stockholm. Insurance and operator not included. Cancellation free of charge up to 48h before pickup.",
    internal_notes: "",
    status: "draft",
  });
  const [items, setItems] = useState<DraftItem[]>([]);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [offerNumber, setOfferNumber] = useState<string | null>(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Equipment[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["offer", offerId],
    enabled: Boolean(offerId),
    queryFn: async () => {
      const [{ data: offer, error }, { data: offerItems, error: itemsError }] = await Promise.all([
        supabase.from("offers").select("*").eq("id", offerId!).single(),
        supabase.from("offer_items").select("*").eq("offer_id", offerId!).order("sort_order"),
      ]);
      if (error) throw error;
      if (itemsError) throw itemsError;
      return { offer: offer as Offer, items: (offerItems ?? []) as OfferItem[] };
    },
  });

  useEffect(() => {
    if (!existing) return;
    const o = existing.offer;
    setForm({
      title: o.title,
      customer_name: o.customer_name ?? "",
      customer_email: o.customer_email ?? "",
      rental_start: o.rental_start ?? "",
      rental_end: o.rental_end ?? "",
      discount_percent: Number(o.discount_percent),
      vat_percent: Number(o.vat_percent),
      valid_until: o.valid_until ?? "",
      intro: o.intro ?? "",
      terms: o.terms ?? "",
      internal_notes: o.internal_notes ?? "",
      status: o.status,
    });
    setShareToken(o.share_token);
    setOfferNumber(o.offer_number);
    setItems(
      existing.items.map((i) => ({
        id: i.id,
        equipment_id: i.equipment_id,
        description: i.description,
        quantity: Number(i.quantity),
        days: Number(i.days),
        unit_price: Number(i.unit_price),
      })),
    );
  }, [existing]);

  const totals = useMemo(
    () => offerTotals(items, form.discount_percent, form.vat_percent),
    [items, form.discount_percent, form.vat_percent],
  );

  const save = useMutation({
    mutationFn: async (nextStatus?: string) => {
      const payload = {
        lead_id: lead?.id ?? existing?.offer.lead_id ?? null,
        title: form.title,
        customer_name: form.customer_name || null,
        customer_email: form.customer_email || null,
        rental_start: form.rental_start || null,
        rental_end: form.rental_end || null,
        discount_percent: Number(form.discount_percent),
        vat_percent: Number(form.vat_percent),
        valid_until: form.valid_until || null,
        intro: form.intro || null,
        terms: form.terms || null,
        internal_notes: form.internal_notes || null,
        status: nextStatus ?? form.status,
        ...(nextStatus === "sent" ? { sent_at: new Date().toISOString() } : {}),
      };

      let id = offerId ?? existing?.offer.id ?? null;
      if (id) {
        const { error } = await supabase.from("offers").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("offers")
          .insert(payload)
          .select("id, share_token, offer_number")
          .single();
        if (error) throw error;
        id = data.id;
        setShareToken(data.share_token);
        setOfferNumber(data.offer_number);
      }

      const { error: deleteError } = await supabase.from("offer_items").delete().eq("offer_id", id);
      if (deleteError) throw deleteError;
      if (items.length) {
        const { error: insertError } = await supabase.from("offer_items").insert(
          items.map((item, index) => ({
            offer_id: id,
            equipment_id: item.equipment_id,
            description: item.description,
            quantity: item.quantity,
            days: item.days,
            unit_price: item.unit_price,
            sort_order: index,
          })),
        );
        if (insertError) throw insertError;
      }

      if (lead?.id && nextStatus === "sent") {
        await supabase.from("leads").update({ status: "quoted" }).eq("id", lead.id);
      }
      return { id, nextStatus };
    },
    onSuccess: ({ nextStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (nextStatus === "sent") {
        setForm((f) => ({ ...f, status: "sent" }));
        toast.success("Offer marked as sent — share the link with the customer");
      } else {
        toast.success("Offer saved");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addEquipment = (equipmentId: string) => {
    const item = equipment.find((e) => e.id === equipmentId);
    if (!item) return;
    setItems((prev) => [
      ...prev,
      {
        equipment_id: item.id,
        description: item.name,
        quantity: 1,
        days: 1,
        unit_price: Number(item.daily_price),
      },
    ]);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="grid gap-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Close editor" onClick={onClose}>
            <X className="size-4" />
          </Button>
          <div>
            <h2 className="font-display text-2xl tracking-wide">{offerNumber ?? "New offer"}</h2>
            <p className="text-xs text-muted-foreground">
              {form.status === "draft" ? "Draft — not visible to customer" : "Shared with customer"}
            </p>
          </div>
        </div>

        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="grid gap-2">
            <Label htmlFor="offer-title">Title</Label>
            <Input
              id="offer-title"
              value={form.title}
              maxLength={160}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="offer-name">Customer name</Label>
              <Input
                id="offer-name"
                value={form.customer_name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-email">Customer email</Label>
              <Input
                id="offer-email"
                type="email"
                value={form.customer_email}
                maxLength={200}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-start">Rental start</Label>
              <Input
                id="offer-start"
                type="date"
                value={form.rental_start}
                onChange={(e) => setForm({ ...form, rental_start: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-end">Rental end</Label>
              <Input
                id="offer-end"
                type="date"
                value={form.rental_end}
                onChange={(e) => setForm({ ...form, rental_end: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="offer-intro">Intro to customer</Label>
            <Textarea
              id="offer-intro"
              rows={3}
              maxLength={2000}
              value={form.intro}
              onChange={(e) => setForm({ ...form, intro: e.target.value })}
            />
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-xl tracking-wide">Line items</h3>
            <div className="flex items-center gap-2">
              <Select onValueChange={addEquipment}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Add from catalog" />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { equipment_id: null, description: "", quantity: 1, days: 1, unit_price: 0 },
                  ])
                }
              >
                <Plus className="size-4" /> Custom
              </Button>
            </div>
          </div>

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No items yet — add gear from the catalog.
            </p>
          )}

          <div className="grid gap-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-xl border border-border/70 bg-secondary/30 p-3 sm:grid-cols-[1fr_70px_70px_110px_36px] sm:items-end"
              >
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`desc-${index}`}>
                    Description
                  </Label>
                  <Input
                    id={`desc-${index}`}
                    value={item.description}
                    maxLength={200}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, description: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`qty-${index}`}>
                    Qty
                  </Label>
                  <Input
                    id={`qty-${index}`}
                    type="number"
                    min={1}
                    value={String(item.quantity)}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, quantity: Number(e.target.value) } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`days-${index}`}>
                    Days
                  </Label>
                  <Input
                    id={`days-${index}`}
                    type="number"
                    min={1}
                    value={String(item.days)}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, days: Number(e.target.value) } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`price-${index}`}>
                    Price / day
                  </Label>
                  <Input
                    id={`price-${index}`}
                    type="number"
                    min={0}
                    value={String(item.unit_price)}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, unit_price: Number(e.target.value) } : it,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="grid gap-2">
            <Label htmlFor="offer-terms">Terms</Label>
            <Textarea
              id="offer-terms"
              rows={3}
              maxLength={4000}
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="offer-notes">Internal notes (never shared)</Label>
            <Textarea
              id="offer-notes"
              rows={2}
              maxLength={4000}
              value={form.internal_notes}
              onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
            />
          </div>
        </section>
      </div>

      <aside className="grid content-start gap-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
        <h3 className="font-display text-xl tracking-wide">Summary</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs" htmlFor="discount">
              Discount %
            </Label>
            <Input
              id="discount"
              type="number"
              min={0}
              max={100}
              value={String(form.discount_percent)}
              onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs" htmlFor="vat">
              VAT %
            </Label>
            <Input
              id="vat"
              type="number"
              min={0}
              max={100}
              value={String(form.vat_percent)}
              onChange={(e) => setForm({ ...form, vat_percent: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs" htmlFor="valid">
            Valid until
          </Label>
          <Input
            id="valid"
            type="date"
            value={form.valid_until}
            onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
          />
        </div>

        <dl className="grid gap-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatSek(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Discount</dt>
            <dd>-{formatSek(totals.discount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT</dt>
            <dd>{formatSek(totals.vat)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-display text-2xl">
            <dt>Total</dt>
            <dd className="text-primary">{formatSek(totals.total)}</dd>
          </div>
        </dl>

        <div className="grid gap-2">
          <Select
            value={form.status}
            onValueChange={(value) => setForm({ ...form, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => save.mutate(undefined)}
            disabled={save.isPending}
          >
            Save draft
          </Button>
          <Button onClick={() => save.mutate("sent")} disabled={save.isPending}>
            <Send className="size-4" /> Save &amp; mark as sent
          </Button>
          {shareToken && (
            <Button
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(`${window.location.origin}/offer/${shareToken}`);
                toast.success("Share link copied");
              }}
            >
              <Copy className="size-4" /> Copy share link
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
