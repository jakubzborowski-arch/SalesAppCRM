"use client";

import { useEffect, useRef, useState } from "react";
import { fetchInfeldSuggest, type InfeldSuggestResult } from "./infeld-client";
import { infeldSuggestKey } from "./infeld-suggest";
import type { Mission, Partner } from "./types";

const cache = new Map<string, InfeldSuggestResult>();

export function useInfeldHints(partner: Partner, mission: Mission) {
  const key = infeldSuggestKey(partner, mission);
  const payloadRef = useRef({ partner, mission });
  payloadRef.current = { partner, mission };
  const [result, setResult] = useState<InfeldSuggestResult | null>(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(!cache.has(key));

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      const { partner: nextPartner, mission: nextMission } = payloadRef.current;
      void fetchInfeldSuggest(nextPartner, nextMission).then((next) => {
        if (cancelled) return;
        cache.set(key, next);
        setResult(next);
        setLoading(false);
      });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [key]);

  return { loading, result };
}
