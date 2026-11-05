import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Flashlight,
  SwitchCamera,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MOVE_PROBLEM_LABEL,
  UNIT_STATUS_LABEL,
  isDuplicateScan,
  moveWarning,
  type MoveAction,
} from "@/lib/units";

type ScanResult =
  | {
      kind: "order";
      order_id: string;
      order_number: string;
      status: string;
      customer: string | null;
    }
  | {
      kind: "unit";
      stock_item_id: string;
      matched_alias?: string | null;
      unit_number: string;
      serial_code: string | null;
      identifier: string;
      status: string;
      equipment_id: string;
      equipment_name: string;
    }
  | {
      kind: "product";
      equipment_id: string;
      equipment_name: string;
      sku: string | null;
      serial_code: string | null;
      legacy_barcode: string | null;
    }
  | { kind: "unknown"; code: string };

type SessionItem = {
  id: string;
  /** Display code: the S/N (serial_code), falling back to the legacy unit number. */
  code: string;
  product: string;
  status: string;
};

type OrderOption = {
  id: string;
  order_number: string;
  status: string;
  starts_on: string;
  ends_on: string;
  customer: string | null;
};

type Problem = {
  unit_id: string;
  unit_number: string | null;
  serial_code: string | null;
  status: string | null;
  reason: string;
};
type MoveResponse =
  | {
      ok: true;
      moved: {
        unit_id: string;
        unit_number: string;
        serial_code: string | null;
        forced: boolean;
      }[];
    }
  | { ok: false; problems: Problem[] };

type Flash = { tone: "ok" | "warn" | "error"; text: string; at: number };

const STORAGE_KEY = "renthub-scan-session-v1";

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending confirmation",
  draft: "Draft",
  reserved: "Reserved",
  picked_up: "Picked up",
  returned: "Returned",
};

// ------------------------------------------------------------ feedback ----

let audioCtx: AudioContext | null = null;
function audio() {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, duration: number) {
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.15, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

function feedback(kind: "ok" | "warn" | "error") {
  if (kind === "ok") {
    tone(1400, 0, 0.09);
    vibrate(40);
  } else {
    tone(320, 0, 0.12);
    tone(320, 0.17, 0.12);
    vibrate(kind === "warn" ? [40, 60, 40] : [80, 60, 80]);
  }
}

// -------------------------------------------------------- camera errors ----

function cameraErrorMessage(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "The camera only works over HTTPS. Open the back office on its https:// address, or use the scanner/manual field below.";
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "This browser can't access a camera. Use a barcode scanner or type the code below.";
  }
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera access was blocked. Safari (iPhone/iPad): Settings › Safari › Camera › Allow, or tap “aA” in the address bar › Website Settings › Camera. Chrome: tap the lock icon next to the address › Permissions › Camera › Allow. Then press Start camera again. The scanner/manual field keeps working meanwhile.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Use a barcode scanner or type the code below.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "The camera is in use by another app or tab. Close it there and press Start camera again.";
    case "SecurityError":
      return "The browser blocked the camera for security reasons. Make sure the page is opened over HTTPS and not inside a restricted frame.";
    default:
      return error instanceof Error && error.message
        ? `Could not start the camera: ${error.message}`
        : "Could not start the camera.";
  }
}

// ------------------------------------------------------------- component ----

export function ScanTab() {
  const queryClient = useQueryClient();

  const [action, setAction] = useState<MoveAction>("check_out");
  const [items, setItems] = useState<SessionItem[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [restored, setRestored] = useState(false);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [code, setCode] = useState("");

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const wedgeRef = useRef<HTMLInputElement | null>(null);
  const lastRef = useRef({ code: "", at: 0 });
  const inFlight = useRef(new Set<string>());
  const itemsRef = useRef<SessionItem[]>(items);
  itemsRef.current = items;
  const actionRef = useRef(action);
  actionRef.current = action;

  // -- session persistence --------------------------------------------------
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          action: MoveAction;
          items: SessionItem[];
          orderId: string | null;
          reference: string;
        }>;
        if (saved.action === "check_out" || saved.action === "check_in") setAction(saved.action);
        if (Array.isArray(saved.items)) setItems(saved.items);
        if (typeof saved.orderId === "string") setOrderId(saved.orderId);
        if (typeof saved.reference === "string") setReference(saved.reference);
      }
    } catch {
      /* ignore broken storage */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ action, items, orderId, reference }));
    } catch {
      /* storage full or disabled */
    }
  }, [restored, action, items, orderId, reference]);

  // -- orders -----------------------------------------------------------------
  const { data: orders = [] } = useQuery({
    queryKey: ["scan-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, starts_on, ends_on, customers(name)")
        .in("status", ["draft", "reserved", "picked_up", "returned"])
        .order("starts_on", { ascending: true })
        .limit(500);
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      const rank = (o: { status: string; ends_on: string }) =>
        o.status === "picked_up"
          ? 0
          : o.status === "reserved" && o.ends_on >= today
            ? 1
            : o.status === "draft"
              ? 2
              : 3;
      return (data ?? [])
        .map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          starts_on: o.starts_on,
          ends_on: o.ends_on,
          customer: (o.customers as { name: string } | null)?.name ?? null,
        }))
        .sort(
          (a, b) => rank(a) - rank(b) || a.starts_on.localeCompare(b.starts_on),
        ) as OrderOption[];
    },
  });
  const selectedOrder = orders.find((o) => o.id === orderId) ?? null;

  // -- focus management -------------------------------------------------------
  const focusWedge = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    const typingElsewhere =
      active &&
      active !== wedgeRef.current &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
    if (!typingElsewhere) wedgeRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    focusWedge();
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role='combobox'], [data-no-refocus]")) return;
      window.setTimeout(focusWedge, 0);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [focusWedge]);

  const show = (kind: Flash["tone"], text: string) => {
    setFlash({ tone: kind, text, at: Date.now() });
    feedback(kind);
  };

  // -- scanning ---------------------------------------------------------------
  const handleCode = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      const now = Date.now();
      if (isDuplicateScan(lastRef.current, value, now) || inFlight.current.has(value)) return;
      lastRef.current = { code: value, at: now };
      inFlight.current.add(value);
      setSummary(null);

      try {
        const { data, error } = await supabase.rpc("scan_lookup", { _code: value });
        if (error) {
          show("error", error.message);
          return;
        }
        const result = data as unknown as ScanResult;

        if (result.kind === "unit") {
          if (itemsRef.current.some((i) => i.id === result.stock_item_id)) {
            show("warn", `${result.serial_code ?? result.unit_number} is already in the list`);
            return;
          }
          const item: SessionItem = {
            id: result.stock_item_id,
            code: result.serial_code ?? result.unit_number ?? result.identifier,
            product: result.equipment_name,
            status: result.status,
          };
          setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [item, ...prev]));
          setProblems(null);
          const warning = moveWarning(actionRef.current, item.status);
          const alias = result.matched_alias ? ` (old label ${result.matched_alias})` : "";
          if (warning) show("warn", `${item.code}${alias} · ${item.product} — ${warning}`);
          else show("ok", `${item.code}${alias} · ${item.product}`);
          return;
        }
        if (result.kind === "order") {
          setOrderId(result.order_id);
          show(
            "ok",
            `Booking ${result.order_number}${result.customer ? ` · ${result.customer}` : ""} selected`,
          );
          return;
        }
        if (result.kind === "product") {
          show(
            "warn",
            `${result.equipment_name} (${result.serial_code ?? "product"}) is a product code — scan the unit's own label`,
          );
          return;
        }
        show("error", `No unit matches “${value}”`);
      } catch (error) {
        show("error", error instanceof Error ? error.message : "Lookup failed");
      } finally {
        inFlight.current.delete(value);
        focusWedge();
      }
    },
    [focusWedge],
  );

  const handleCodeRef = useRef(handleCode);
  handleCodeRef.current = handleCode;

  // -- camera -----------------------------------------------------------------
  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* already stopped */
    }
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(
    async (requestedDeviceId?: string | null) => {
      setCameraError(null);
      audio(); // unlock audio on this user gesture
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(cameraErrorMessage(null));
        return;
      }
      stopCamera();
      setCameraStarting(true);
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all(
          [import("@zxing/browser"), import("@zxing/library")],
        );
        const hints = new Map<unknown, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_128,
          BarcodeFormat.EAN_13,
        ]);
        const reader = new BrowserMultiFormatReader(hints as Map<never, unknown>, {
          delayBetweenScanAttempts: 120,
        });
        const video = videoRef.current;
        if (!video) throw new Error("Video element is not ready");
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: requestedDeviceId
            ? { deviceId: { exact: requestedDeviceId } }
            : { facingMode: { ideal: "environment" } },
        };
        const controls = await reader.decodeFromConstraints(constraints, video, (result) => {
          if (result) void handleCodeRef.current(result.getText());
        });
        controlsRef.current = controls;
        setCameraOn(true);
        setTorchSupported(typeof controls.switchTorch === "function");

        try {
          const list = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "videoinput",
          );
          setDevices(list);
          const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
          const activeId = track?.getSettings().deviceId ?? requestedDeviceId ?? null;
          setDeviceId(activeId);
        } catch {
          /* device list is optional */
        }
      } catch (error) {
        stopCamera();
        setCameraError(cameraErrorMessage(error));
      } finally {
        setCameraStarting(false);
        focusWedge();
      }
    },
    [focusWedge, stopCamera],
  );

  const switchCamera = () => {
    if (devices.length < 2) return;
    const index = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(index + 1) % devices.length];
    if (next) void startCamera(next.deviceId);
  };

  const toggleTorch = async () => {
    try {
      await controlsRef.current?.switchTorch?.(!torchOn);
      setTorchOn((v) => !v);
    } catch {
      toast.error("The torch could not be switched on this camera");
    }
  };

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopCamera();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopCamera();
    };
  }, [stopCamera]);

  // -- confirm ------------------------------------------------------------------
  const move = useMutation({
    mutationFn: async (force: boolean) => {
      const ids = itemsRef.current.map((i) => i.id);
      const { data, error } = await supabase.rpc("unit_move", {
        _unit_ids: ids,
        _action: action,
        _force: force,
        ...(orderId ? { _order_id: orderId } : {}),
        ...(reference.trim() ? { _reference: reference.trim() } : {}),
      });
      if (error) throw error;
      return data as unknown as MoveResponse;
    },
    onSuccess: (res) => {
      if (!res.ok) {
        setProblems(res.problems);
        show(
          "warn",
          `${res.problems.length} unit${res.problems.length === 1 ? " needs" : "s need"} attention`,
        );
        return;
      }
      const forced = res.moved.filter((m) => m.forced).length;
      const text = `${action === "check_out" ? "Checked out" : "Checked in"} ${res.moved.length} unit${
        res.moved.length === 1 ? "" : "s"
      }${selectedOrder ? ` · ${selectedOrder.order_number}` : ""}${reference.trim() ? ` · ${reference.trim()}` : ""}${
        forced ? ` · ${forced} forced` : ""
      }`;
      setSummary(text);
      setItems([]);
      setProblems(null);
      show("ok", text);
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["unit-history"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      queryClient.invalidateQueries({ queryKey: ["stock-calendar"] });
    },
    onError: (error: Error) => show("error", error.message),
  });

  const problemById = useMemo(
    () => new Map((problems ?? []).map((p) => [p.unit_id, p])),
    [problems],
  );
  const warnings = items.filter((i) => moveWarning(action, i.status)).length;

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setProblems((prev) => (prev ? prev.filter((p) => p.unit_id !== id) : prev));
  };

  const removeProblemUnits = () => {
    const ids = new Set((problems ?? []).map((p) => p.unit_id));
    setItems((prev) => prev.filter((i) => !ids.has(i.id)));
    setProblems(null);
  };

  const clearSession = () => {
    setItems([]);
    setProblems(null);
    setSummary(null);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <div
          className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1"
          role="radiogroup"
          aria-label="Scan mode"
        >
          {(
            [
              ["check_out", "Check out"],
              ["check_in", "Check in"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={action === value}
              onClick={() => {
                setAction(value);
                setProblems(null);
              }}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                action === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            audio();
            const value = code;
            setCode("");
            void handleCode(value);
          }}
          className="grid gap-2 rounded-2xl border border-border bg-card p-4"
        >
          <Label htmlFor="scan-code">Scan or type a code</Label>
          <div className="flex gap-2">
            <Input
              id="scan-code"
              ref={wedgeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="RM-000123, QR link or booking number"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="go"
              className="font-mono"
            />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Handheld scanners type into this field and press Enter. Scanning a booking number
            selects that booking.
          </p>
        </form>

        {flash && (
          <div
            key={flash.at}
            role="status"
            aria-live="polite"
            className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium animate-in fade-in zoom-in-95 ${
              flash.tone === "ok"
                ? "border-primary/40 bg-primary/10"
                : flash.tone === "warn"
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {flash.tone === "ok" ? (
              <CheckCircle2 className="size-5 shrink-0 text-primary" />
            ) : (
              <AlertTriangle className="size-5 shrink-0" />
            )}
            <span className="min-w-0 break-words">{flash.text}</span>
          </div>
        )}

        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="relative overflow-hidden rounded-xl border border-border bg-foreground">
            <video
              ref={videoRef}
              className="aspect-video w-full object-cover"
              muted
              playsInline
              autoPlay
              aria-label="Camera preview"
            />
            {!cameraOn && (
              <div className="absolute inset-0 grid place-items-center bg-foreground/80 text-center text-sm text-background">
                {cameraStarting ? "Starting camera…" : "Camera is off"}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {cameraOn ? (
              <Button variant="outline" onClick={stopCamera}>
                <CameraOff className="size-4" /> Stop camera
              </Button>
            ) : (
              <Button onClick={() => void startCamera(deviceId)} disabled={cameraStarting}>
                <Camera className="size-4" /> Start camera
              </Button>
            )}
            {cameraOn && devices.length > 1 && (
              <Button variant="outline" onClick={switchCamera}>
                <SwitchCamera className="size-4" /> Switch camera
              </Button>
            )}
            {cameraOn && torchSupported && (
              <Button variant="outline" onClick={() => void toggleTorch()} aria-pressed={torchOn}>
                <Flashlight className="size-4" /> {torchOn ? "Torch off" : "Torch on"}
              </Button>
            )}
          </div>
          {cameraError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
            >
              {cameraError}
            </p>
          )}
        </div>

        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <OrderPicker orders={orders} selected={selectedOrder} onSelect={setOrderId} />
          <div className="grid gap-2">
            <Label htmlFor="scan-reference">Reference (optional)</Label>
            <Input
              id="scan-reference"
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Job, customer or event"
            />
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
            <div>
              <h2 className="font-semibold">Scanned units</h2>
              <p className="text-sm text-muted-foreground">
                {items.length} unit{items.length === 1 ? "" : "s"}
                {warnings ? ` · ${warnings} with warnings` : ""}
              </p>
            </div>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSession} data-no-refocus>
                Clear list
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {summary ?? "Scan unit labels to build the list."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const warning = moveWarning(action, item.status);
                const problem = problemById.get(item.id);
                return (
                  <li
                    key={item.id}
                    className={`flex items-start gap-3 p-3 ${problem ? "bg-destructive/5" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold">{item.code}</p>
                      <p className="truncate text-sm">{item.product}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline">
                          {UNIT_STATUS_LABEL[item.status] ?? item.status}
                        </Badge>
                        {warning && (
                          <Badge variant="secondary" className="gap-1">
                            <AlertTriangle className="size-3" /> {warning}
                          </Badge>
                        )}
                        {problem && (
                          <Badge variant="destructive">
                            {MOVE_PROBLEM_LABEL[problem.reason] ?? problem.reason}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${item.code}`}
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {problems && problems.length > 0 && (
          <div
            role="alert"
            className="grid gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
          >
            <p className="font-semibold">
              Nothing was moved — {problems.length} unit
              {problems.length === 1 ? " needs" : "s need"} attention.
            </p>
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={p.unit_id}>
                  <span className="font-mono">
                    {p.serial_code ?? p.unit_number ?? p.unit_id.slice(0, 8)}
                  </span>
                  : {MOVE_PROBLEM_LABEL[p.reason] ?? p.reason}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => move.mutate(true)}
                disabled={move.isPending || problems.some((p) => p.reason === "not_found")}
              >
                Force anyway
              </Button>
              <Button variant="outline" onClick={removeProblemUnits}>
                Remove problem units
              </Button>
            </div>
          </div>
        )}

        <Button
          size="lg"
          disabled={items.length === 0 || move.isPending}
          onClick={() => {
            audio();
            move.mutate(false);
          }}
        >
          {move.isPending
            ? "Saving…"
            : `Confirm ${items.length} unit${items.length === 1 ? "" : "s"} · ${
                action === "check_out" ? "Check out" : "Check in"
              }`}
        </Button>
        {summary && items.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="size-4" /> {summary}
          </p>
        )}
      </div>
    </div>
  );
}

function OrderPicker({
  orders,
  selected,
  onSelect,
}: {
  orders: OrderOption[];
  selected: OrderOption | null;
  onSelect: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter(
        (o) =>
          !q ||
          o.order_number.toLowerCase().includes(q) ||
          (o.customer ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [orders, query]);

  if (selected) {
    return (
      <div className="grid gap-2">
        <Label>Booking (optional)</Label>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
          <span className="min-w-0">
            <span className="font-mono font-semibold">{selected.order_number}</span>
            {selected.customer ? ` · ${selected.customer}` : ""}
            <span className="block text-xs text-muted-foreground">
              {ORDER_STATUS_LABEL[selected.status] ?? selected.status} · {selected.starts_on} →{" "}
              {selected.ends_on}
            </span>
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Clear booking"
            onClick={() => onSelect(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid gap-2">
      <Label htmlFor="scan-order">Booking (optional)</Label>
      <Input
        id="scan-order"
        role="combobox"
        aria-expanded={open}
        aria-controls="scan-order-list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Search booking number or customer"
      />
      {open && (
        <ul
          id="scan-order-list"
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No bookings found</li>
          ) : (
            matches.map((o) => (
              <li key={o.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  data-no-refocus
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(o.id);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span className="font-mono font-semibold">{o.order_number}</span>
                  {o.customer ? ` · ${o.customer}` : ""}
                  <span className="block text-xs text-muted-foreground">
                    {ORDER_STATUS_LABEL[o.status] ?? o.status} · {o.starts_on} → {o.ends_on}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
