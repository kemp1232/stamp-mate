import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function toDataUri(file: string, mime: string) {
  const data = await readFile(join(process.cwd(), "public", file));
  return `data:${mime};base64,${data.toString("base64")}`;
}

export default async function Image() {
  const [logoSrc, firstMateLogoSrc] = await Promise.all([
    toDataUri("logo.png", "image/png"),
    toDataUri("firstmate-logo.png", "image/png"),
  ]);

  const pills = [
    { label: "Join", color: "#8A6D4E" },
    { label: "Stamp", color: "#B5842A" },
    { label: "Redeem", color: "#3B7A57" },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F6EFE1",
          padding: "64px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            height: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <img src={logoSrc} width={300} height={90} alt="StampMate" />

            <div
              style={{
                marginTop: 28,
                fontSize: 30,
                color: "#8A6D4E",
                maxWidth: 640,
              }}
            >
              QR-based loyalty cards for small businesses
            </div>

            <div
              style={{
                marginTop: 18,
                width: 96,
                height: 6,
                borderRadius: 999,
                background: "#B5842A",
              }}
            />

            <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
              {pills.map((pill) => (
                <div
                  key={pill.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    borderRadius: 999,
                    background: "#EFE3C8",
                    fontSize: 22,
                    color: "#3B2A1E",
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      background: pill.color,
                    }}
                  />
                  {pill.label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 22, color: "#8A6D4E" }}>Built by</span>
            <img src={firstMateLogoSrc} width={132} height={27} alt="First Mate Technologies" />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 340,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 320,
              borderRadius: 24,
              background: "#FFFFFF",
              border: "1px solid #E7D9BC",
              padding: 32,
              gap: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 999,
                background: "#EFE3C8",
                fontSize: 18,
                color: "#3B2A1E",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#B5842A",
                }}
              />
              Stamp card
            </div>

            <div style={{ fontSize: 20, color: "#8A6D4E" }}>Stamps collected</div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontSize: 56,
                fontWeight: 700,
                color: "#3B2A1E",
              }}
            >
              7<span style={{ fontSize: 28, color: "#8A6D4E" }}>/10</span>
            </div>

            <div
              style={{
                display: "flex",
                width: "100%",
                height: 12,
                borderRadius: 999,
                background: "#EFE3C8",
              }}
            >
              <div
                style={{
                  width: "70%",
                  height: "100%",
                  borderRadius: 999,
                  background: "#B5842A",
                }}
              />
            </div>

            <div style={{ fontSize: 18, color: "#8A6D4E" }}>
              Reward: 1 free classic milk tea
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
