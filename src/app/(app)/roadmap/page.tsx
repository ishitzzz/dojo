"use client";

import { Suspense } from "react";
import DojoView from "@/components/learn/DojoView";

export default function RoadmapPage() {
  return (
    <Suspense
      fallback={
        <div
          className="h-screen flex items-center justify-center"
          style={{ background: "transparent" }}
        >
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
        </div>
      }
    >
      <DojoView />
    </Suspense>
  );
}
