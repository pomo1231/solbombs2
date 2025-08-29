import { useEffect, useState } from 'react';

const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8081';
const HTTP_BASE = WS_URL.replace(/^ws(s?):\/\//, 'http$1://');

type PriceResult = { price: number; source: string };

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function getFromCoinGecko(): Promise<PriceResult> {
  const res = await fetchWithTimeout(`${HTTP_BASE}/price?provider=coingecko`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`coingecko HTTP ${res.status}`);
  const data = await res.json();
  const p = data?.solana?.usd;
  if (typeof p !== 'number') throw new Error('coingecko missing price');
  return { price: p, source: 'coingecko' };
}

async function getFromJupiter(): Promise<PriceResult> {
  // Jupiter price v6
  const res = await fetchWithTimeout(`${HTTP_BASE}/price?provider=jupiter`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`jupiter HTTP ${res.status}`);
  const data = await res.json();
  const p = data?.data?.SOL?.price;
  if (typeof p !== 'number') throw new Error('jupiter missing price');
  return { price: p, source: 'jupiter' };
}

async function getFromBinance(): Promise<PriceResult> {
  const res = await fetchWithTimeout(`${HTTP_BASE}/price?provider=binance`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`binance HTTP ${res.status}`);
  const data = await res.json();
  const p = Number(data?.price);
  if (!Number.isFinite(p)) throw new Error('binance missing price');
  return { price: p, source: 'binance' };
}

async function fetchAny(): Promise<PriceResult> {
  const sources = [getFromCoinGecko, getFromJupiter, getFromBinance];
  const errors: string[] = [];
  for (const s of sources) {
    try {
      return await s();
    } catch (e: any) {
      errors.push(e?.message || String(e));
    }
  }
  throw new Error(errors.join(' | '));
}

export function useSolPrice(refreshMs: number = 20000) {
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
        // Try multiple providers with fallback
        const res = await fetchAny();
        if (mounted) {
          setPrice(res.price);
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
