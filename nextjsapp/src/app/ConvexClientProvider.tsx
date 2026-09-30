"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL || "https://quiet-barracuda-406.eu-west-1.convex.cloud";
    return new ConvexReactClient(url);
  }, []);

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
