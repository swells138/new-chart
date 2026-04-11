import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const globalRateLimitStore = globalThis as typeof globalThis & {
  __meshyRateLimitStore?: Map<string, RateLimitBucket>;
  __meshyUpstashRedis?: Redis;
  __meshyUpstashLimiters?: Map<string, Ratelimit>;
};

const store = globalRateLimitStore.__meshyRateLimitStore ?? new Map<string, RateLimitBucket>();
const limiterCache = globalRateLimitStore.__meshyUpstashLimiters ?? new Map<string, Ratelimit>();

if (!globalRateLimitStore.__meshyRateLimitStore) {
  globalRateLimitStore.__meshyRateLimitStore = store;
}

if (!globalRateLimitStore.__meshyUpstashLimiters) {
  globalRateLimitStore.__meshyUpstashLimiters = limiterCache;
}

export function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  return "unknown";
}

function getUpstashLimiter(options: RateLimitOptions): Ratelimit | null {
  const hasUpstashCredentials =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (!hasUpstashCredentials) {
    return null;
  }

  const cacheKey = `${options.maxRequests}:${options.windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const redis =
    globalRateLimitStore.__meshyUpstashRedis ??
    Redis.fromEnv();

  if (!globalRateLimitStore.__meshyUpstashRedis) {
    globalRateLimitStore.__meshyUpstashRedis = redis;
  }

  const windowInSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      options.maxRequests,
      `${windowInSeconds} s` as `${number} s`
    ),
    analytics: false,
    prefix: "meshy:rl",
  });

  limiterCache.set(cacheKey, limiter);
  return limiter;
}

function checkLocalRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });

    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, options.maxRequests - existing.count),
    retryAfterSeconds: 0,
  };
}

export async function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const upstashLimiter = getUpstashLimiter(options);

  if (!upstashLimiter) {
    return checkLocalRateLimit(key, options);
  }

  try {
    const result = await upstashLimiter.limit(key);
    const resetAt = typeof result.reset === "number" ? result.reset : Date.now();

    return {
      allowed: result.success,
      remaining: Math.max(0, result.remaining),
      retryAfterSeconds: result.success ? 0 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
  } catch (error) {
    console.error("Distributed rate limit failed, falling back to local store", error);
    return checkLocalRateLimit(key, options);
  }
}