import { useEffect, useRef, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LABEL,
  buildLabelPdf,
  formatMm,
  printInstruction,
  printPdfBlob,
  renderLabels,
  type LabelInput,
  type RenderResult,
} from "@/lib/productLabel";

/** On-screen scale of the preview (proportional, not physical size). */
const PREVIEW_PX_PER_MM = 6;

/** Rasterises every page of the label PDF so the preview is literally the file that gets printed. */
function PdfPages({ bytes, heightMm }: { bytes: ArrayBuffer; heightMm: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const host = ref.current;
    if (!host) return;
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
      const canvases: HTMLCanvasElement[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const cssW = LABEL.widthMm * PREVIEW_PX_PER_MM;
        const scale = (cssW / base.width) * Math.max(2, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${(cssW * vp.height) / vp.width}px`;
        canvas.className = "block bg-white shadow-sm ring-1 ring-border";
        canvas.setAttribute("aria-label", `Label ${p} of ${pdf.numPages}`);
        canvas.dataset["page"] = String(p);
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        canvases.push(canvas);
      }
      if (!cancelled) host.replaceChildren(...canvases);
      void pdf.destroy();
    })().catch(() => {
      if (!cancelled) host.textContent = "Preview unavailable – download the PDF to check it.";
    });
    return () => {
      cancelled = true;
    };
  }, [bytes, heightMm]);
  return (
    <div ref={ref} data-testid="label-pdf-preview" className="grid place-items-center gap-3" />
  );
}

/** Preview, print and PDF for the one Renthub label (product or unit) – all from one PDF. */
export function ProductLabelDialog({
  labels,
  fileName,
  onClose,
  onPrinted,
}: {
  labels: LabelInput[];
  fileName: string;
  onClose: () => void;
  /** Called after the print dialog has been opened. */
  onPrinted?: () => void;
}) {
  const [result, setResult] = useState<RenderResult | null>(null);
  const [pdf, setPdf] = useState<{ blob: Blob; bytes: ArrayBuffer } | null>(null);

  useEffect(() => {
    let active = true;
    setPdf(null);
    void (async () => {
      const r = await renderLabels(labels);
      if (!active) return;
      setResult(r);
      if (!r.labels.length) return;
      const doc = await buildLabelPdf(r);
      const bytes = doc.output("arraybuffer");
      if (active) setPdf({ bytes, blob: new Blob([bytes], { type: "application/pdf" }) });
    })().catch((e) => toast.error(e instanceof Error ? e.message : "Could not create the labels"));
    return () => {
      active = false;
    };
  }, [labels]);

  const ready = Boolean(pdf);
  const h = result?.heightMm ?? LABEL.heightMm;
  const count = result?.labels.length ?? labels.length;

  const downloadPdf = () => {
    if (!pdf) return;
    const url = URL.createObjectURL(pdf.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const print = async () => {
    if (!pdf) return;
    await printPdfBlob(pdf.blob);
    onPrinted?.();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Print {labels.length === 1 ? "label" : `${labels.length} labels`}
          </DialogTitle>
          <DialogDescription>
            <span data-testid="label-format">62 × {formatMm(h)} mm</span> · DK-22205 · {count} page
            {count === 1 ? "" : "s"}, one label per page · preview of the exact PDF that is printed
            (scaled)
          </DialogDescription>
        </DialogHeader>
        {result && h > LABEL.heightMm && (
          <p className="rounded-lg border border-border bg-muted/50 p-2 text-sm">
            The codes don't fit scannably on 62 × {LABEL.heightMm} mm, so this job uses{" "}
            <strong>62 × {formatMm(h)} mm</strong>.
          </p>
        )}
        <div className="max-h-[50vh] overflow-y-auto rounded-xl bg-muted/50 p-4">
          {!pdf ? (
            <p className="text-center text-sm text-muted-foreground">
              {result && !result.labels.length ? "Nothing to print." : "Generating…"}
            </p>
          ) : (
            <PdfPages bytes={pdf.bytes} heightMm={h} />
          )}
          {result && result.failed.length > 0 && (
            <p className="mt-3 text-sm text-destructive">
              {result.failed.length} code{result.failed.length === 1 ? "" : "s"} too long or invalid
              for Code 128: {result.failed.map((f) => f.barcodeValue).join(", ")}
            </p>
          )}
        </div>
        <p className="rounded-lg border border-border bg-card p-3 text-sm">{printInstruction(h)}</p>
        <p className="text-xs text-muted-foreground">
          Print and Download use the same PDF as the preview; it contains no date, title, URL or
          page numbers. Printer choice, paper size, scaling and cutting are set in the print dialog
          and can't be controlled by the app.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={downloadPdf} disabled={!ready}>
            <FileDown className="size-4" /> Download PDF
          </Button>
          <Button onClick={() => void print()} disabled={!ready}>
            <Printer className="size-4" /> Print label{count > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
