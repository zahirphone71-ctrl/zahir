// ============================================================
//  ZCtrl RouterOS v6 & v7 Profile Sanitizer & Resilient Executor
//  Ensures Hotspot, PPPoE & User Manager profile Add / Edit / Delete
//  execute cleanly directly on any RouterOS v6 or v7 hardware.
// ============================================================

export interface ProfileQueryClient {
  isConnected(): boolean;
  isV6?: () => boolean;
  query(
    endpoint: string,
    params?: string[],
    options?: { timeoutSeconds?: number; rapid?: boolean; priority?: boolean }
  ): Promise<any[]>;
  querySafe(
    endpoint: string,
    params?: string[],
    options?: { timeoutSeconds?: number; rapid?: boolean }
  ): Promise<any[]>;
}

/**
 * Checks whether a profile NAME (never raw .id like *1) is a protected RouterOS built-in default.
 */
export function isProtectedDefaultProfileName(name: string | undefined | null): boolean {
  const lower = String(name || "").trim().toLowerCase();
  return lower === "default" || lower === "default-encryption";
}

/**
 * Cleans comma-separated IP/DNS server lists (removes spaces around commas).
 */
export function cleanDnsOrIpList(raw: any): string {
  if (!raw) return "";
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== "none")
    .join(",");
}

/**
 * Converts a single speed value (e.g. "2M", "512k", "10m", "2000000") into
 * a pure numeric bits-per-second string required by RouterOS v7 User Manager API.
 * Returns "" if empty or invalid.
 */
export function parseRateToBpsString(raw: any): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  if (!s || s === "0") return "0";
  const match = s.match(/^(\d+(?:\.\d+)?)\s*([kmgKMG])?$/);
  if (!match) return "";
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num < 0) return "";
  const unit = (match[2] || "").toLowerCase();
  let multiplier = 1;
  if (unit === "k") multiplier = 1000;
  else if (unit === "m") multiplier = 1000 * 1000;
  else if (unit === "g") multiplier = 1000 * 1000 * 1000;
  return String(Math.round(num * multiplier));
}

/**
 * Normalizes RouterOS Hotspot/PPP rate-limit string (strips stray spaces around "/").
 */
export function normalizeRateLimitString(raw: any): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toLowerCase() === "none" || trimmed.toLowerCase() === "unlimited") {
    return "";
  }
  return trimmed
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns exact User Manager API paths for RouterOS v6 vs RouterOS v7.
 */
export function getUsermanEndpoints(isV6: boolean) {
  if (isV6) {
    return {
      prefix: "/tool/user-manager",
      profile: "/tool/user-manager/profile",
      limitation: "/tool/user-manager/profile/limitation",
      profileLimitation: "/tool/user-manager/profile/profile-limitation",
      session: "/tool/user-manager/session"
    };
  }
  return {
    prefix: "/user-manager",
    profile: "/user-manager/profile",
    limitation: "/user-manager/limitation",
    profileLimitation: "/user-manager/profile-limitation",
    session: "/user-manager/session"
  };
}

/**
 * Detects whether a RouterOS !trap error is caused by an unsupported/invalid parameter
 * (e.g., RouterOS v6 vs v7 schema differences, disabled ipv6/mpls package, or missing optional queue-type).
 */
function isParameterCompatibilityTrap(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return (
    lower.includes("unknown parameter") ||
    lower.includes("no such argument") ||
    lower.includes("input does not match any value of") ||
    lower.includes("invalid value for argument") ||
    lower.includes("expected end of command") ||
    lower.includes("not supported") ||
    lower.includes("no such command")
  );
}

/**
 * Extracts a specific rejected RouterOS argument name from common trap messages, e.g.:
 * - "input does not match any value of queue-type" -> "queue-type"
 * - "invalid value for argument mac-cookie-timeout" -> "mac-cookie-timeout"
 * - "no such argument (comment)" -> "comment"
 */
function extractRejectedParamKey(errMsg: string): string | null {
  const patterns = [
    /input does not match any value of\s+([a-z0-9_-]+)/i,
    /invalid value for argument\s+([a-z0-9_-]+)/i,
    /no such argument\s*\(?([a-z0-9_-]+)\)?/i,
    /unknown parameter\s*\(?([a-z0-9_-]+)\)?/i
  ];
  for (const rx of patterns) {
    const m = errMsg.match(rx);
    if (m && m[1]) {
      return m[1].trim().toLowerCase();
    }
  }
  return null;
}

function getParamKey(word: string): string {
  const s = String(word || "");
  if (!s.startsWith("=")) return "";
  const eqIdx = s.indexOf("=", 1);
  if (eqIdx <= 1) return "";
  return s.slice(1, eqIdx).trim().toLowerCase();
}

/**
 * Executes a RouterOS profile /add or /set command directly on MikroTik with
 * intelligent auto-compatibility fallback if an optional parameter is rejected
 * by the target RouterOS version or disabled package (e.g., ipv6/mpls/comment/queue-type).
 *
 * Core fields (name, .id, rate-limit, shared-users, only-one, profile, limitation)
 * are NEVER silently dropped.
 */
export async function executeProfileMutation(
  client: ProfileQueryClient,
  endpoint: string,
  params: string[],
  optionalFallbackOrder: string[] = []
): Promise<{ result: any[]; strippedParams: string[] }> {
  let currentParams = [...params];
  const strippedParams: string[] = [];
  const optionalSet = new Set(optionalFallbackOrder.map((k) => k.toLowerCase()));
  const protectedCore = new Set([".id", "name", "profile", "limitation"]);

  const maxAttempts = Math.min(10, optionalFallbackOrder.length + 2);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await client.query(endpoint, currentParams, {
        priority: true,
        timeoutSeconds: 12
      });
      return { result, strippedParams };
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (!isParameterCompatibilityTrap(msg)) {
        throw err;
      }

      // 1. If RouterOS explicitly named the offending argument, strip it (unless core)
      const rejectedKey = extractRejectedParamKey(msg);
      if (rejectedKey && !protectedCore.has(rejectedKey)) {
        const beforeLen = currentParams.length;
        currentParams = currentParams.filter((w) => getParamKey(w) !== rejectedKey);
        if (currentParams.length < beforeLen) {
          strippedParams.push(rejectedKey);
          continue;
        }
      }

      // 2. Otherwise strip the next present optional parameter in fallback order
      const nextOptional = optionalFallbackOrder.find((optKey) => {
        const lk = optKey.toLowerCase();
        return !protectedCore.has(lk) && currentParams.some((w) => getParamKey(w) === lk);
      });

      if (nextOptional) {
        const lk = nextOptional.toLowerCase();
        currentParams = currentParams.filter((w) => getParamKey(w) !== lk);
        strippedParams.push(lk);
        continue;
      }

      // 3. Final attempt: if generic "unknown parameter" still persists, strip any remaining optionalSet keys at once
      const remainingOptional = currentParams.filter((w) => optionalSet.has(getParamKey(w)));
      if (remainingOptional.length > 0) {
        for (const w of remainingOptional) {
          strippedParams.push(getParamKey(w));
        }
        currentParams = currentParams.filter((w) => !optionalSet.has(getParamKey(w)));
        continue;
      }

      throw err;
    }
  }

  // Should never reach here without returning or throwing
  const finalResult = await client.query(endpoint, currentParams, { priority: true, timeoutSeconds: 12 });
  return { result: finalResult, strippedParams };
}
