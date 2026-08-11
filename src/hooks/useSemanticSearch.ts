/** useSemanticSearch + useAsk: LLM-backed search via Edge Functions. */
import { useQuery } from '@tanstack/react-query';
import { semanticSearch, askLlm, type SemanticSearchResult } from '../lib/llm';

export function useSemanticSearch(householdId: string | null, query: string, enabled = true) {
  return useQuery<SemanticSearchResult[]>({
    queryKey: ['semantic', householdId, query],
    enabled: !!householdId && query.trim().length > 1 && enabled,
    queryFn: async () => {
      if (!householdId) return [];
      return semanticSearch({ householdId, query });
    },
    staleTime: 30_000,
  });
}

export function useAsk(householdId: string | null, question: string, enabled = true) {
  return useQuery({
    queryKey: ['ask', householdId, question],
    enabled: !!householdId && question.trim().length > 1 && enabled,
    queryFn: async () => {
      if (!householdId) return { answer: '', sources: [] };
      return askLlm({ householdId, question });
    },
    staleTime: 60_000,
  });
}
