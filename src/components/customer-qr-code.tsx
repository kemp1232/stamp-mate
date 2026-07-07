import { QRCodeImage } from "@/components/qr-code-image";

export function CustomerQRCode({ url }: { url: string }) {
  return <QRCodeImage value={url} alt="Your personal QR code" size={220} />;
}
