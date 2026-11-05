import { useRef, useState } from "react";
import { DEFAULT_WAREHOUSE_ID, useWarehouses } from "@/components/admin/backofficeData";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganizations } from "@/components/admin/OrganizationsTab";
import { OwnershipEditor } from "@/components/admin/OwnershipEditor";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ItemDetails = {
  id: string;
  name: string;
  category: string;
  organization_id: string | null;
  warehouse_id?: string | null;
  image_url: string | null;
  comment: string | null;
  external_report_email?: string | null;
  forward_reports_to_external?: boolean | null;
  commission_type?: string | null;
  commission_value?: number | null;
};

/** Uploads an item image to the public item-images bucket and returns its URL. */
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function uploadItemImage(file: File): Promise<string> {
  const ext = IMAGE_EXT[file.type];
  if (!ext) throw new Error("Choose a JPEG, PNG or WebP image");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be 5 MB or smaller");
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("item-images")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl;
}

/**
 * Create a new item (name, organization, category, optional image and comment) or edit the image and
 * comment of an existing one. Image and comment belong to the item and are never printed on labels.
 */
export function ItemDetailsDialog({
  item,
  categories,
  onClose,
  onSaved,
}: {
  /** Omit to create a new item. */
  item?: ItemDetails | undefined;
  categories: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const creating = !item;
  const { data: orgs = [] } = useOrganizations();
  const activeOrgs = orgs.filter((o) => o.is_active || o.id === item?.organization_id);
  const [name, setName] = useState(item?.name ?? "");
  const [orgId, setOrgId] = useState(item?.organization_id ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const { data: warehouses = [] } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState(item?.warehouse_id ?? DEFAULT_WAREHOUSE_ID);
  const [comment, setComment] = useState(item?.comment ?? "");
  const [forward, setForward] = useState(Boolean(item?.forward_reports_to_external));
  const [externalEmail, setExternalEmail] = useState(item?.external_report_email ?? "");
  const [commissionType, setCommissionType] = useState(item?.commission_type ?? "");
  const [commissionValue, setCommissionValue] = useState(
    item?.commission_value == null ? "" : String(item.commission_value),
  );
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    if (f && !f.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (f && f.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 5 MB or smaller");
      return;
    }
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const save = useMutation({
    mutationFn: async () => {
      const url = file ? await uploadItemImage(file) : imageUrl;
      const commentValue = comment.trim() || null;
      const ext = externalEmail.trim();
      if (forward && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ext))
        throw new Error("Enter a valid external e-mail or turn forwarding off");
      const reportFields = {
        external_report_email: ext || null,
        forward_reports_to_external: forward && Boolean(ext),
      };
      const hasOverride =
        (commissionType === "percent" || commissionType === "fixed") && commissionValue !== "";
      if (hasOverride && !(Number(commissionValue) >= 0))
        throw new Error("Commission value must be 0 or more");
      Object.assign(reportFields, {
        commission_type: hasOverride ? commissionType : null,
        commission_value: hasOverride ? Number(commissionValue) : null,
      });
      if (creating) {
        const { data, error } = await supabase
          .from("equipment")
          .insert({
            name: name.replace(/\s+/g, " ").trim(),
            organization_id: orgId,
            warehouse_id: warehouseId,
            category: category.trim(),
            image_url: url,
            comment: commentValue,
            ...reportFields,
            item_kind: "rental",
            tracking: "serialized",
            quantity: 0,
          })
          .select("id")
          .single();
        if (error) throw error;
        // First physical unit (S/N …001) is created right away.
        const { error: unitErr } = await supabase.rpc("create_units", {
          _equipment_id: data.id,
          _count: 1,
        });
        if (unitErr) throw unitErr;
        return data.id;
      }
      const { error } = await supabase
        .from("equipment")
        .update({
          image_url: url,
          comment: commentValue,
          warehouse_id: warehouseId,
          ...reportFields,
        })
        .eq("id", item.id);
      if (error) throw error;
      return item.id;
    },
    onSuccess: (id) => {
      toast.success(creating ? "Item created — add its units below" : "Item updated");
      onSaved(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const shown = preview ?? imageUrl;
  const valid = !creating || (name.trim() && orgId && category.trim());

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{creating ? "Add item" : `Edit item · ${item.name}`}</DialogTitle>
          <DialogDescription>
            {creating
              ? "A new product type. After saving, add one or more physical units — each gets its own S/N."
              : "Image and comment belong to the item. They are not printed on labels."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="item-details"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          {creating && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="item-name">Name *</Label>
                <Input
                  id="item-name"
                  required
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item-org">Organization *</Label>
                <select
                  id="item-org"
                  required
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                >
                  <option value="">Select organization…</option>
                  {activeOrgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.parent_id
                        ? ` (sub of ${orgs.find((p) => p.id === o.parent_id)?.name ?? "—"})`
                        : o.item_prefix
                          ? ` · ${o.item_prefix}`
                          : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item-category">Category *</Label>
                <Input
                  id="item-category"
                  required
                  list="item-categories"
                  maxLength={80}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <datalist id="item-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="item-warehouse">Warehouse</Label>
            <select
              id="item-warehouse"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouses
                .filter((w) => w.is_active || w.id === warehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Image (optional)</Label>
            <div className="flex items-center gap-3">
              {shown ? (
                <img
                  src={shown}
                  alt=""
                  className="size-20 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="grid size-20 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
                  <ImagePlus className="size-5" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  aria-label="Item image"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="size-4" /> {shown ? "Replace image" : "Choose image"}
                </Button>
                {shown && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      pickFile(null);
                      setImageUrl(null);
                    }}
                  >
                    <Trash2 className="size-4" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item-comment">Comment (optional)</Label>
            <Textarea
              id="item-comment"
              maxLength={2000}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          {item && <OwnershipEditor equipmentId={item.id} />}

          <div className="grid gap-2 rounded-xl border border-border p-3">
            <Label htmlFor="item-commission-type">Commission override (optional)</Label>
            <div className="flex flex-wrap gap-2">
              <select
                id="item-commission-type"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={commissionType}
                onChange={(e) => setCommissionType(e.target.value)}
              >
                <option value="">Inherit from organization</option>
                <option value="percent">Percent of base rental</option>
                <option value="fixed">Fixed kr per rented unit</option>
              </select>
              <Input
                className="w-32"
                type="number"
                min={0}
                step="0.01"
                aria-label="Commission value"
                disabled={!commissionType}
                value={commissionValue}
                onChange={(e) => setCommissionValue(e.target.value)}
              />
              {commissionType && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCommissionType("");
                    setCommissionValue("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Added on top of the base rental price for customers. Existing orders keep the rate
              they were booked with.
            </p>
          </div>

          <div className="grid gap-2 rounded-xl border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={forward}
                onChange={(e) => setForward(e.target.checked)}
              />
              Skicka nya registreringar till extern e-post (send new QR reports to an external
              e-mail)
            </label>
            <Input
              id="item-external-email"
              type="email"
              maxLength={200}
              placeholder="ops@partner.se"
              value={externalEmail}
              onChange={(e) => setExternalEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Applies to every unit of this item. Max 5 e-mails per unit per hour; repeated
              identical messages are skipped.
            </p>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="item-details" disabled={!valid || save.isPending}>
            {save.isPending ? "Saving…" : creating ? "Create item" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
