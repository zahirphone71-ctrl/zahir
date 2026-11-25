import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeApiLength,
  encodeApiSentence,
  decodeApiSentences,
  normalizeTlsFingerprint,
  verifyTlsFingerprint,
  MikroTikRequestThrottler
} from '../src/server/mikrotik-api.ts';

describe('MikroTik Binary API Protocol & TLS Pinning Helpers', () => {
  it('encodes and decodes RouterOS binary API sentences across multi-byte lengths', () => {
    const words = [
      '/ip/hotspot/user/add',
      '=name=77889900',
      '=password=77889900',
      '=profile=default',
      '=comment=ZCtrl Direct Card',
      '.tag=cmd_42'
    ];
    const encoded = encodeApiSentence(words);
    const { sentences, remainder } = decodeApiSentences(encoded);

    assert.equal(remainder.length, 0);
    assert.equal(sentences.length, 1);
    assert.deepEqual(sentences[0], words);

    // Test 2-byte length encoding (>= 128 bytes)
    const longWord = '=comment=' + 'A'.repeat(200);
    const encodedLong = encodeApiSentence(['/system/note/set', longWord]);
    const decodedLong = decodeApiSentences(encodedLong);
    assert.equal(decodedLong.sentences.length, 1);
    assert.equal(decodedLong.sentences[0][1], longWord);
    assert.equal(encodeApiLength(200).length, 2);
  });

  it('normalizes and verifies SHA-256 TLS certificate fingerprints in constant time', () => {
    const fpColon = 'ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89';
    const fpRaw = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

    assert.equal(normalizeTlsFingerprint(fpColon), fpRaw);
    assert.equal(verifyTlsFingerprint(fpColon, fpRaw), true);
    assert.equal(verifyTlsFingerprint(fpColon, fpRaw.replace('A', 'B')), false);
  });

  it('throttles concurrent RouterOS commands and adapts to high CPU load', async () => {
    const throttler = new MikroTikRequestThrottler(3);
    throttler.updateCpuLoad(80); // High CPU reduces effective concurrency to 1
    assert.equal(throttler.getStats().maxConcurrent, 1);

    const order: number[] = [];
    await Promise.all([
      throttler.execute(async () => {
        order.push(1);
        return 1;
      }),
      throttler.execute(async () => {
        order.push(2);
        return 2;
      })
    ]);

    assert.deepEqual(order, [1, 2]);
    assert.equal(throttler.getStats().totalExecuted, 2);
  });
});
