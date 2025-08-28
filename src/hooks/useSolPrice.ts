import { useEffect, useState } from 'react';

export function useSolPrice(refreshMs: number = 30000) {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;

    const fetchPrice = async () => {
      try {
        setLoading(true);
        setError(null);
        // Public Coingecko endpoint; no API key required
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
          { cache: 'no-cache' }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const p = data?.solana?.usd;
        if (mounted && typeof p === 'number') {
          setPrice(p);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to fetch price');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchPrice();
    timer = window.setInterval(fetchPrice, refreshMs);

    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, [refreshMs]);

  return { price, loading, error };
}
