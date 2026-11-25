export async function yieldToMain(): Promise<void> {
  if ('scheduler' in globalThis && 'yield' in (globalThis as any).scheduler) {
    await (globalThis as any).scheduler.yield();
    return;
  }
  if (typeof MessageChannel !== 'undefined') {
    await new Promise<void>((r) => {
      const c = new MessageChannel();
      c.port1.onmessage = () => {
        c.port1.close();
        r();
      };
      c.port2.postMessage(null);
    });
    return;
  }
  await new Promise((r) => setTimeout(r, 0));
}

export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T, i: number) => R | Promise<R>,
  opts: {
    budgetMs?: number;
    onProgress?: (d: number, t: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<R[]> {
  const { budgetMs = 12, onProgress, signal } = opts;
  const results: R[] = [];
  let start = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    results.push(await processor(items[i], i));
    if (performance.now() - start > budgetMs) {
      onProgress?.(i + 1, items.length);
      await yieldToMain();
      start = performance.now();
    }
  }
  onProgress?.(items.length, items.length);
  return results;
}
