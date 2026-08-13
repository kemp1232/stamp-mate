import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Coffee, CupSoda } from "lucide-react";
import { loadFont as loadPlayfairDisplay } from "@remotion/google-fonts/PlayfairDisplay";

// Mirrors the real app's card design (src/components/stamp-card.tsx) — same
// palette (the site's actual --card/--primary/etc tokens), same layout, same
// icons. Keep the two in sync by hand; the canvas color matches --card
// exactly so the video blends into the "See it in action" section (which is
// also bg-card) with no visible seam. Rendered twice (light/dark, see
// Root.tsx) since a baked video can't follow prefers-color-scheme itself —
// LoyaltyDemoVideo picks whichever one matches the viewer's OS/browser.
//
// IMPORTANT: always render with `--color-space=bt709` (see `npm run render`).
// Without it, ffmpeg leaves the H.264 color range/matrix untagged, so
// browsers guess during playback and every color comes out visibly darker
// than what's written here (e.g. #2E241D was measured rendering as #241810).
// Tagging bt709 explicitly makes the encode/decode round-trip lossless.
const { fontFamily: titleFont } = loadPlayfairDisplay();

type Props = {
  dark?: boolean;
};

function getColors(dark: boolean) {
  return dark
    ? {
        card: "#2E241D", // --card (dark)
        secondary: "#3F3329", // --secondary (dark)
        primary: "#E7B369", // --primary (unchanged across themes)
        primaryForeground: "#1D140D", // --primary-foreground (dark)
        foreground: "#F5EEE0", // --foreground (dark)
        mutedForeground: "#A89D8E", // --muted-foreground (dark)
        border: "#473E38", // --border (dark, translucent white flattened over --card) — used for the bean decorations
        cardBorder: "#5A4C41", // darkened a bit further for the card's own edge, for clearer definition
        shadow: "rgba(0, 0, 0, 0.5)",
      }
    : {
        card: "#FFFDF7", // --card
        secondary: "#F4E6CE", // --secondary
        primary: "#E7B369", // --primary
        primaryForeground: "#3A2312", // --primary-foreground
        foreground: "#3A2312", // --foreground
        mutedForeground: "#786555", // --muted-foreground
        border: "#E7DDCC", // --border — used for the bean decorations
        cardBorder: "#C9A97C", // darkened for the card's own edge, for clearer definition
        shadow: "rgba(58, 35, 18, 0.3)",
      };
}

const STORE_NAME = "Brew Haven";
const PROGRAM_NAME = "Buy 10 Get 1 Free";
const CUSTOMER_NAME = "Alex";
const REWARD_TEXT = "1 free classic milk tea";

const TOTAL_STAMPS = 10;
const STAMPS_START = 20;
const STAMP_CADENCE = 13;
const STAMPS_END = STAMPS_START + (TOTAL_STAMPS - 2) * STAMP_CADENCE; // the last slot is the FREE reward slot, not an animated stamp
const HOLD_FULL_START = STAMPS_END + 15;
const REVEAL_START = HOLD_FULL_START + 10;
const REVEAL_DURATION = 10;
const REWARD_HOLD_END = REVEAL_START + 35;
const FADE_OUT_START = REWARD_HOLD_END;
const FADE_OUT_END = FADE_OUT_START + 13;

export const STAMP_LOOP_DURATION = FADE_OUT_END + 5; // loops cleanly

function CoffeeBean({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 60" fill="none" style={style} aria-hidden="true">
      <path
        d="M20 2C31 2 38 15 38 30C38 45 31 58 20 58C9 58 2 45 2 30C2 15 9 2 20 2Z"
        stroke="currentColor"
        strokeWidth={2}
      />
      <path d="M21 5C14 17 14 43 21 55" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

export const StampCardLoop: React.FC<Props> = ({ dark = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const COLORS = getColors(dark);

  const introProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 18,
  });

  // Only 9 slots actually animate — the 10th is the fixed "Free" reward slot.
  const stampsFilled =
    frame < STAMPS_START
      ? 0
      : Math.min(
          TOTAL_STAMPS - 1,
          Math.floor((frame - STAMPS_START) / STAMP_CADENCE) + 1,
        );

  const isComplete = stampsFilled >= TOTAL_STAMPS - 1;

  const reveal = interpolate(
    frame,
    [REVEAL_START, REVEAL_START + REVEAL_DURATION],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const fadeOut = interpolate(frame, [FADE_OUT_START, FADE_OUT_END], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cardOpacity = Math.min(introProgress, fadeOut);
  const cardScale = interpolate(introProgress, [0, 1], [0.94, 1]);

  const remaining = TOTAL_STAMPS - 1 - stampsFilled;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.card }}>
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", opacity: cardOpacity }}
      >
        <div
          style={{
            width: 600,
            borderRadius: 28,
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            boxShadow: `0 30px 60px -20px ${COLORS.shadow}`,
            padding: "36px 44px",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            color: COLORS.foreground,
            transform: `scale(${cardScale})`,
            fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
          }}
        >
          <CoffeeBean
            style={{ position: "absolute", top: -12, left: -12, width: 64, height: 64, transform: "rotate(18deg)", color: COLORS.border }}
          />
          <CoffeeBean
            style={{ position: "absolute", top: -20, right: 24, width: 40, height: 40, transform: "rotate(-12deg)", color: `${COLORS.border}B3` }}
          />
          <CoffeeBean
            style={{ position: "absolute", bottom: 40, right: -16, width: 56, height: 56, transform: "rotate(45deg)", color: `${COLORS.border}B3` }}
          />

          <div style={{ position: "relative", textAlign: "center" }}>
            <div style={{ fontFamily: titleFont, fontWeight: 700, fontSize: 34 }}>
              {STORE_NAME}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: COLORS.mutedForeground,
              }}
            >
              Loyalty card
            </div>
          </div>

          <div style={{ position: "relative", height: 300 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: 1 - reveal,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div style={{ textAlign: "center", fontSize: 15, color: COLORS.mutedForeground }}>
                Hi {CUSTOMER_NAME}! You&apos;re {remaining} stamp{remaining === 1 ? "" : "s"} away
                from your reward.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {Array.from({ length: TOTAL_STAMPS }).map((_, i) => {
                  const isRewardSlot = i === TOTAL_STAMPS - 1;

                  if (isRewardSlot) {
                    return (
                      <div
                        key={i}
                        style={{
                          aspectRatio: "1 / 1",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: `2px dashed ${COLORS.primary}`,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          color: COLORS.primary,
                        }}
                      >
                        Free
                      </div>
                    );
                  }

                  const stampFrame = STAMPS_START + i * STAMP_CADENCE;
                  const pop = spring({
                    frame: frame - stampFrame,
                    fps,
                    config: { damping: 10, stiffness: 160, mass: 0.6 },
                    durationInFrames: 14,
                  });
                  const filled = frame >= stampFrame;
                  const scale = filled ? interpolate(pop, [0, 1], [0.4, 1]) : 1;

                  return (
                    <div
                      key={i}
                      style={{
                        aspectRatio: "1 / 1",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: filled ? COLORS.primary : COLORS.secondary,
                        transform: `scale(${scale})`,
                      }}
                    >
                      <Coffee
                        size={17}
                        color={filled ? COLORS.primaryForeground : `${COLORS.mutedForeground}66`}
                        strokeWidth={2}
                      />
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: -8, textAlign: "center", fontSize: 15, color: COLORS.mutedForeground }}>
                {stampsFilled} / {TOTAL_STAMPS} stamps
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: reveal,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              🎉 Ready for your reward!
            </div>
          </div>

          <div
            style={{
              borderRadius: 16,
              border: `1.5px dashed ${COLORS.primary}66`,
              background: `${COLORS.secondary}66`,
              padding: "12px 16px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: COLORS.mutedForeground,
              }}
            >
              Reward
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{REWARD_TEXT}</div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <CupSoda
              size={38}
              color={`${COLORS.primary}B3`}
              strokeWidth={1.5}
            />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <div style={{ fontSize: 13, color: COLORS.mutedForeground }}>{PROGRAM_NAME}</div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: `${COLORS.mutedForeground}B3`,
                }}
              >
                Made with StampMate
              </div>
            </div>
          </div>

          {isComplete &&
            Array.from({ length: 16 }).map((_, i) => {
              const seed = `confetti-${i}`;
              const startX = interpolate(random(seed), [0, 1], [-150, 150]);
              const delay = REVEAL_START + random(seed + "d") * 18;
              const t = Math.max(0, frame - delay);
              const rise = interpolate(t, [0, 55], [0, -170], {
                extrapolateRight: "clamp",
              });
              const fade = interpolate(t, [0, 10, 45, 55], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const rot = interpolate(t, [0, 55], [0, random(seed + "r") * 360], {
                extrapolateRight: "clamp",
              });
              const size = interpolate(random(seed + "s"), [0, 1], [5, 10]);
              const color = i % 2 === 0 ? COLORS.primary : COLORS.mutedForeground;

              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `calc(50% + ${startX}px)`,
                    bottom: 130,
                    width: size,
                    height: size,
                    borderRadius: i % 3 === 0 ? "50%" : 3,
                    background: color,
                    opacity: fade,
                    transform: `translateY(${rise}px) rotate(${rot}deg)`,
                  }}
                />
              );
            })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
