import type { Request, Response, NextFunction } from "express";
import { errorBody } from "./errors.js";

/**
 * Simple in-memory sliding-window limiter. Single-instance limitation is accepted
 * and documented; paid endpoints additionally rely on payment + concurrency caps.
 */

export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${opts.name}:${req.ip ?? "unknown"}`;
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => t > now - opts.windowMs);
    if (arr.length >= opts.max) {
      res.status(429).json(errorBody("RATE_LIMITED", "too many requests; slow down", true));
      return;
    }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 10_000) hits.clear();
    next();
  };
}

/** hard cap on simultaneous expensive analyses */
export function concurrencyGate(max: number) {
  let active = 0;
  return {
    enter(): boolean {
      if (active >= max) return false;
      active++;
      return true;
    },
    leave(): void {
      active = Math.max(0, active - 1);
    },
  };
}
