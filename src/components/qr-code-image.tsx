import QRCode from "qrcode";

export async function QRCodeImage({
  value,
  alt,
  size = 240,
}: {
  value: string;
  alt: string;
  size?: number;
}) {
  const dataUrl = await QRCode.toDataURL(value, { margin: 1, width: size });

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static data: URI, not an optimizable remote image
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      className="rounded-lg border bg-white p-2"
    />
  );
}
