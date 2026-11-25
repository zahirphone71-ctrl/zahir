import crypto from 'crypto';

/**
 * Calculates RFC 8785 canonical JSON hash for deterministic state comparison.
 */
export class StateHashCalculator {
  static canonicalStringify(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const keyPairs = keys.map((key) => {
      const val = (obj as Record<string, unknown>)[key];
      return JSON.stringify(key) + ':' + this.canonicalStringify(val);
    });
    return '{' + keyPairs.join(',') + '}';
  }

  static calculateHash(data: unknown): string {
    const canonicalJson = this.canonicalStringify(data);
    return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  }

  static compareHashes(hashA: string, hashB: string): boolean {
    if (hashA.length !== hashB.length) return false;
    return crypto.timingSafeEqual(Buffer.from(hashA, 'hex'), Buffer.from(hashB, 'hex'));
  }
}
