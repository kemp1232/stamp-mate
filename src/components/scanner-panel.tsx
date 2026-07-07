"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { extractCardToken } from "@/lib/card-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SCANNER_ELEMENT_ID = "staff-qr-scanner";

/**
 * html5-qrcode's stop() throws *synchronously* (not a rejected promise)
 * when called while the scanner isn't actively running — which happens
 * routinely here: React Strict Mode's dev-only double-invoke can unmount
 * before start() resolves, and stop() also gets called once already in the
 * scan-success handler before the unmount cleanup runs again.
 */
function safeStop(scanner: Html5Qrcode) {
  try {
    const state = scanner.getState();
    if (
      state === Html5QrcodeScannerState.SCANNING ||
      state === Html5QrcodeScannerState.PAUSED
    ) {
      return scanner.stop().catch(() => {});
    }
  } catch {
    // getState() itself is unexpected to throw, but ignore defensively.
  }
  return Promise.resolve();
}

type ScannerState =
  | "loading"
  | "scanning"
  | "denied"
  | "unavailable"
  | "success"
  | "invalid";

export function ScannerPanel() {
  const router = useRouter();
  const [state, setState] = useState<ScannerState>("loading");
  const [manualValue, setManualValue] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decodedText) => {
          if (cancelled) return;
          const token = extractCardToken(decodedText);
          if (!token) {
            setState("invalid");
            return;
          }
          setState("success");
          safeStop(scanner);
          router.push(`/staff/cards/${token}`);
        },
        () => {
          // Fires continuously while no QR code is in frame — not an error.
        },
      )
      .then(() => {
        if (!cancelled) setState("scanning");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = String(err).toLowerCase();
        const isPermissionIssue =
          message.includes("permission") || message.includes("notallowed");
        setState(isPermissionIssue ? "denied" : "unavailable");
      });

    return () => {
      cancelled = true;
      safeStop(scanner).finally(() => scanner.clear());
    };
  }, [router]);

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = extractCardToken(manualValue);
    if (!token) {
      setManualError("Enter a valid card link or token.");
      return;
    }
    router.push(`/staff/cards/${token}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-black">
        <div id={SCANNER_ELEMENT_ID} className="h-full w-full" />
        {state === "loading" ? (
          <ScannerOverlay>Loading camera...</ScannerOverlay>
        ) : null}
        {state === "denied" ? (
          <ScannerOverlay>
            Camera permission denied.
            <span className="mt-1 block text-white/70">
              Allow camera access in your browser settings, or use manual
              entry below.
            </span>
          </ScannerOverlay>
        ) : null}
        {state === "unavailable" ? (
          <ScannerOverlay>
            Scanner unavailable on this device.
            <span className="mt-1 block text-white/70">
              Use manual entry below instead.
            </span>
          </ScannerOverlay>
        ) : null}
        {state === "success" ? (
          <ScannerOverlay>Scan successful — opening card...</ScannerOverlay>
        ) : null}
        {state === "invalid" ? (
          <ScannerOverlay>
            That doesn&apos;t look like a StampMate card QR.
            <span className="mt-1 block text-white/70">
              Keep scanning or use manual entry below.
            </span>
          </ScannerOverlay>
        ) : null}
      </div>

      <form
        onSubmit={handleManualSubmit}
        className="flex flex-col gap-2 border-t pt-4"
      >
        <Label htmlFor="manual-token">
          Or enter the card link/token manually
        </Label>
        <div className="flex gap-2">
          <Input
            id="manual-token"
            value={manualValue}
            onChange={(event) => {
              setManualValue(event.target.value);
              setManualError(null);
            }}
            placeholder="Paste QR link or card token"
            className="flex-1"
          />
          <Button type="submit">Go</Button>
        </div>
        {manualError ? (
          <p className="text-sm text-destructive">{manualError}</p>
        ) : null}
      </form>
    </div>
  );
}

function ScannerOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 text-center text-sm text-white">
      <p>{children}</p>
    </div>
  );
}
