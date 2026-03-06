import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const PAGE_SIZE = 1000;

/**
 * Busca todos os registros de uma query paginada.
 * O Supabase REST API limita a 1000 registros por padrão; esta função faz
 * múltiplas requisições (range) até trazer tudo.
 * @param fetchPage Função que recebe (from, pageSize) e retorna a página (query construída no loop).
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, pageSize: number) => Promise<{ data: T[] | null; error?: { message: string } | null }>
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await fetchPage(from, PAGE_SIZE);
    if (error) throw error;
    const list = data ?? [];
    allData = [...allData, ...list];
    hasMore = list.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return allData;
}
