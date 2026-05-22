import { prisma } from "@/lib/prisma";
import { FREE_SEARCH_LIMIT, getEffectiveIsPro } from "@/lib/pro-user";

type SearchLimitUser = {
  id: string;
  email?: string | null;
  isPro?: boolean | null;
  freeSearchesUsed?: number | null;
};

export type SearchLimitResult =
  | {
      allowed: true;
      hasPro: boolean;
      searchesUsed: number;
      searchLimit: number;
    }
  | {
      allowed: false;
      hasPro: false;
      searchesUsed: number;
      searchLimit: number;
      error: string;
    };

export function shapeSearchLimitState(user: SearchLimitUser) {
  const hasPro = getEffectiveIsPro(user);
  return {
    hasPro,
    searchesUsed: user.freeSearchesUsed ?? 0,
    searchLimit: FREE_SEARCH_LIMIT,
  };
}

export async function consumeSearchForUser(
  user: SearchLimitUser,
): Promise<SearchLimitResult> {
  const state = shapeSearchLimitState(user);

  if (state.hasPro) {
    return { allowed: true, ...state };
  }

  if (state.searchesUsed >= FREE_SEARCH_LIMIT) {
    return {
      allowed: false,
      ...state,
      hasPro: false,
      error: "You have used your 5 free searches. Upgrade to Pro to keep searching.",
    };
  }

  const updated = await prisma.user.updateMany({
    where: {
      id: user.id,
      freeSearchesUsed: { lt: FREE_SEARCH_LIMIT },
    },
    data: {
      freeSearchesUsed: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    return {
      allowed: false,
      hasPro: false,
      searchesUsed: FREE_SEARCH_LIMIT,
      searchLimit: FREE_SEARCH_LIMIT,
      error: "You have used your 5 free searches. Upgrade to Pro to keep searching.",
    };
  }

  return {
    allowed: true,
    hasPro: false,
    searchesUsed: state.searchesUsed + 1,
    searchLimit: FREE_SEARCH_LIMIT,
  };
}
