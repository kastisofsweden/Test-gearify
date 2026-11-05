import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";

import { ProductLabelDialog } from "@/components/admin/ProductLabelDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BARCODE_TYPES, codeMarkup, randomBarcode, type BarcodeType } from "@/lib/barcodes";

export function CodePreview({ value, type }: { value: string; type: BarcodeType }) {
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    codeMarkup(value, type).then((result) => {
      if (active) setMarkup(result);
    });
    return () => {
      active = false;
    };
  }, [value, type]);

  if (!markup) {
    return (
      <p className="text-sm text-muted-foreground">
        This number cannot be encoded as {BARCODE_TYPES.find((t) => t.value === type)?.label}.
      </p>
    );
  }
  return (
    <div
      className="grid place-items-center rounded-xl bg-white p-4 [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export function BarcodeDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  value,
  type,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string | undefined;
  value: string;
  type: BarcodeType;
  onSave: (value: string, type: BarcodeType) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [draftType, setDraftType] = useState<BarcodeType>(type);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setDraftType(type);
    }
  }, [open, value, type]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit barcode</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            {title}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>

          <div className="grid gap-2">
            <Label>Barcode type</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as BarcodeType)}
            >
              {BARCODE_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label>Barcode number</Label>
            <div className="flex gap-2">
              <Input value={draft} onChange={(e) => setDraft(e.target.value.trim())} />
              <Button variant="outline" size="icon" onClick={() => setDraft(randomBarcode())}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>

          <CodePreview value={draft} type={draftType} />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {onDelete ? (
              <Button variant="destructive" onClick={onDelete}>
                Delete barcode
              </Button>
            ) : null}
            <Button variant="outline" disabled={!draft} onClick={() => setPrinting(true)}>
              <Printer className="size-4" /> Print label
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => onSave(draft, draftType)}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {printing ? (
        <ProductLabelDialog
          labels={[
            {
              name: title,
              qrValue: draft,
              barcodeValue: draft,
              idText: subtitle?.startsWith("S/N:") ? subtitle : draft,
            },
          ]}
          fileName={`label-${draft}`}
          onClose={() => setPrinting(false)}
        />
      ) : null}
    </Dialog>
  );
}
