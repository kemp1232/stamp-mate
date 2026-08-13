"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const ASSETS = {
  light: { video: "/stamp-loop.mp4", poster: "/stamp-loop-poster.jpg" },
  dark: { video: "/stamp-loop-dark.mp4", poster: "/stamp-loop-dark-poster.jpg" },
};
const POSTER_ALT =
  "Digital stamp card filling up from 0 to 10 stamps and unlocking a free reward";

/**
 * Looping motion graphic of a stamp card filling up and unlocking a reward.
 * Rendered twice (light/dark, see motion/src/StampCard.tsx) so its colors
 * always match the real app's card in either theme — a baked video can't
 * follow the site's prefers-color-scheme-driven CSS variables on its own.
 * Renders the light <video> by default (matches the server-rendered markup,
 * so there is no hydration mismatch), then swaps to the dark variant and/or
 * a static poster once the OS/browser preferences are known.
 */
export function LoyaltyDemoVideo() {
  const [dark, setDark] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateDark = () => setDark(darkQuery.matches);
    const updateMotion = () => setReduceMotion(motionQuery.matches);
    updateDark();
    updateMotion();
    darkQuery.addEventListener("change", updateDark);
    motionQuery.addEventListener("change", updateMotion);
    return () => {
      darkQuery.removeEventListener("change", updateDark);
      motionQuery.removeEventListener("change", updateMotion);
    };
  }, []);

  const { video, poster } = dark ? ASSETS.dark : ASSETS.light;

  if (reduceMotion) {
    return (
      <Image
        src={poster}
        alt={POSTER_ALT}
        fill
        sizes="(min-width: 1024px) 960px, 100vw"
        className="object-cover"
      />
    );
  }

  return (
    <video
      // Remounts when the asset pair changes so the new <source> is picked up.
      key={video}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      aria-label={POSTER_ALT}
      className="h-full w-full object-cover"
    >
      <source src={video} type="video/mp4" />
    </video>
  );
}
