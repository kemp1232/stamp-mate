import { QRCodeImage } from "@/components/qr-code-image";

export function StoreJoinQRCode({ url }: { url: string }) {
  return <QRCodeImage value={url} alt="QR code customers scan to join" />;
}
