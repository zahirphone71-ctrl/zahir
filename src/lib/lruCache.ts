export class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }

  set(k: K, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.maxSize) {
      const f = this.map.keys().next().value;
      if (f !== undefined) this.map.delete(f);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
