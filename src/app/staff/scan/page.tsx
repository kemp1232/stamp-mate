import { ScannerPanel } from "@/components/scanner-panel";

export default function StaffScanPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Scan customer QR</h1>
        <p className="text-sm text-muted-foreground">
          Point the camera at the customer&apos;s personal QR code.
        </p>
      </div>
      <ScannerPanel />
    </div>
  );
}
