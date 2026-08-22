"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────
// MANUAL DESIGN CONTROLS (IN CODE)
// Adjust these values to perfectly position & style your content
// ─────────────────────────────────────────────────────────────
const POSITION = {
  container: { x: 0, y: "clamp(-140px, -12vh, -40px)" }, // responsive: less offset on short viewports
};

const TYPOGRAPHY = {
  heading: {
    fontSize: "clamp(2rem, 5.5vw, 4.5rem)",
    letterSpacing: "-0.04em",
    lineHeight: 0.95,
    marginBottom: "36px",
  },
  subheading: {
    fontSize: "clamp(1rem, 2vw, 1.25rem)",
    letterSpacing: "-0.01em",
    lineHeight: 1.5,
    marginBottom: "48px",
  }
};
export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isDay, setIsDay] = useState(true);

  useEffect(() => {
    setMounted(true);
    // Automatically detect day/night based on local browser time
    const hour = new Date().getHours();
    setIsDay(hour >= 6 && hour < 18);
  }, []);

  if (!mounted) return null; // Prevent hydration mismatch

  // Dynamic Styles based on Day/Night
  // The background image will gracefully switch or remain if background2.png is copied
  const bgImage = isDay ? "url('/background1.png')" : "url('/background2.png'), url('/background1.png')";

  // Theme text & colors purely based on day/night 
  const textColor = isDay ? "#000000" : "#FFFFFF";
  
  // Create an ethereal white glow only in night mode (matches image inspiration)
  const headingShadow = isDay ? "none" : "0 0 10px rgba(255,255,255,0.6), 0 0 20px rgba(255,255,255,0.3)";
  const subheadingShadow = isDay ? "none" : "0 0 8px rgba(255,255,255,0.5), 0 0 16px rgba(255,255,255,0.2)";
  const buttonBg = isDay ? "rgba(245,245,245,0.9)" : "rgba(255,255,255,0.15)";
  const buttonHoverBg = isDay ? "rgba(230,230,230,1)" : "rgba(255,255,255,0.25)";
  const buttonText = isDay ? "#000000" : "#FFFFFF";
  const buttonBorder = isDay ? "1px solid rgba(0,0,0,0.15)" : "1px solid rgba(255,255,255,0.3)";

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: "#000", // Fallback if image fails
      }}
    >
      {/* ── BACKGROUND IMAGE (No Filters) ──────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: bgImage,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          zIndex: 0,
          transition: "background-image 0.5s ease-in-out",
        }}
      />

      {/* ── HERO CONTENT ───────────────────────────────── */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "0 24px",
          width: "100%",
          maxWidth: "1000px", // Increased width so two-line text doesn't wrap naturally
          transform: `translate(${POSITION.container.x}px, ${POSITION.container.y})`,
        }}
      >
        {/* H1 - Typography matched closer to Canopy Inspiration */}
        <h1
          style={{
            ...TYPOGRAPHY.heading,
            fontWeight: 500, // Balanced weight 
            fontFamily: "var(--font-heading), serif",
            color: textColor,
            textShadow: headingShadow, // Dynamic glow
            // Text wraps naturally on small screens; clamp() font-size handles scaling
          }}
        >
          The internet, filtered.
          <br />
          For the relentlessly ambitious.
        </h1>

        {/* SUBTITLE */}
        <p
          style={{
            ...TYPOGRAPHY.subheading,
            color: textColor,
            textShadow: subheadingShadow, // Dynamic glow
            fontFamily: "var(--font-inter), sans-serif",
            maxWidth: "680px", // Controls paragraph width directly
            opacity: 0.95,
          }}
        >
          The internet is built to keep you scrolling. We built a space to help you stay. A workspace for the self-taught, designed to filter out the noise so you can follow your own path—wherever it leads.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          {/* PRIMARY BUTTON - Styled minimally, no blue */}
          <button
            onClick={() => router.push("/onboarding")}
            className="dynamic-hover-btn"
            style={{
              '--btn-bg': buttonBg,
              '--btn-bg-hover': buttonHoverBg,
              padding: "16px 48px",
              borderRadius: "999px", // Pill shape
              color: buttonText,
              fontWeight: 500,
              fontSize: "17px",
              fontFamily: "var(--font-inter), sans-serif",
              border: buttonBorder,
              cursor: "pointer",
              backdropFilter: "blur(4px)",
            } as React.CSSProperties}
          >
            Start Learning
          </button>
        </div>
      </div>
    </main>
  );
}
