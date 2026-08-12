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
  // Quiet zone (the blank border around the modules) is how a scanner's
  // finder-pattern search locks onto the code at all. The QR spec calls for
  // at least 4 modules of it on every side, which is also this library's own
  // default when `margin` is omitted — it was being overridden down to 1
  // here, which is a well-documented cause of "the camera won't pick this
  // up," especially scanning a code off a phone screen rather than print.
  const dataUrl = await QRCode.toDataURL(value, { margin: 4, width: size });

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
