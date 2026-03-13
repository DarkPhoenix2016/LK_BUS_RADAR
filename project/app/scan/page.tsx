"use client";

import { Suspense } from "react";
import ScanInner from "./ScanInner";

export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <ScanInner />
    </Suspense>
  );
}
