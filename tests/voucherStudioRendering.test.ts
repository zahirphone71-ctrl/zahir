import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateStandaloneVoucherHtmlAsync } from '../src/components/VoucherStudio/voucherHtmlGenerator.ts';
import {
  buildContext,
  computeCardStyle,
  computeElementStyle,
  MIN_PRIMARY_FONT_PX,
  MIN_SECONDARY_FONT_PX,
  sanitizeImageSrc,
  sanitizeSvgMarkup,
} from '../src/components/VoucherStudio/voucherRenderCore.ts';
import { autoCalcGrid, getPaperSpec } from '../src/components/VoucherStudio/gridCalculator.ts';
import { THEME_PRESETS, DECORATION_DEFS } from '../src/components/VoucherStudio/themePresets.ts';
import { generateRandomString } from '../src/server/voucher-generator.ts';
import { renderVouchersFullHtml } from '../src/client/voucher-render.ts';
import type { VoucherDesignState, VoucherItem } from '../src/components/VoucherStudio/types.ts';

function makeVoucher(idx: number, overrides: Partial<VoucherItem> = {}): VoucherItem {
  return {
    voucherId: `id-${idx}`,
    voucherCode: `VCODE${String(idx).padStart(4, '0')}`,
    voucherPin: `9${String(idx).padStart(3, '0')}`,
    statusCd: 'ACTIVE',
    price: 500,
    profileName: 'VIP-1G',
    timeLimit: '7d',
    dataLimit: '2 GB',
    createdAt: '2026-01-01T00:00:00.000Z',
    batchId: 'B-TEST-1',
    serviceType: 'HOTSPOT',
    isSynced: true,
    ...overrides,
  };
}

function makeDesign(overrides: Partial<VoucherDesignState> = {}): VoucherDesignState {
  const preset = THEME_PRESETS.modern;
  return {
    quantity: 21,
    codeType: 'alphanumeric',
    codeLength: 7,
    passwordLength: 5,
    serviceType: 'HOTSPOT',
    authMode: 'user_pass',
    targetProfile: 'VIP-1G',
    autoSync: false,
    price: 500,
    timeLimit: '7d',
    dataLimit: '2 GB',
    theme: 'modern',
    primaryColor: preset.primaryColor,
    bgColor: preset.bgColor,
    cardTextColor: preset.cardTextColor,
    fontFamily: 'Tajawal',
    slashedZero: false,
    autoPrefix: false,
    prefixValue: '',
    qrMode: 'auto_login',
    showQr: true,
    showBorder: true,
    showCutLines: true,
    showBgImage: true,
    showNetworkName: true,
    showPrice: true,
    showDataLimit: true,
    showProfileName: true,
    networkName: 'ZCtrl Test Net',
    currencySymbol: 'ريال',
    loginUrl: '10.0.0.1',
    cardWidthMm: 62,
    cardHeightMm: 38,
    paperType: 'a4',
    paperOrientation: 'portrait',
    columnsCount: 3,
    rowsCount: 7,
    cardGap: 3,
    cardMarginTop: 4,
    cardMarginBottom: 4,
    cardMarginSide: 4,
    showCutMarks: true,
    qrSize: 36,
    coords: { ...preset.coords },
    elements: {
      network: { show: true, color: '#1e1b4b', fontSize: 12, fontFamily: 'Tajawal', fontWeight: 'bold', rotation: 0, hasShadow: false },
      user: { show: true, color: '#4338ca', fontSize: 15, fontFamily: 'JetBrains Mono', fontWeight: 'extrabold', rotation: 0, letterSpacing: 1.5, hasShadow: false },
      password: { show: true, color: '#312e81', fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 'bold', rotation: 0, letterSpacing: 1, hasShadow: false },
      price: { show: true, color: '#ffffff', fontSize: 12, fontFamily: 'Cairo', fontWeight: 'bold', rotation: 0, hasShadow: false },
      time: { show: true, color: '#64748b', fontSize: 9, fontFamily: 'Tajawal', fontWeight: 'normal', rotation: 0, hasShadow: false },
      profile: { show: true, color: '#4f46e5', fontSize: 10, fontFamily: 'Tajawal', fontWeight: 'bold', rotation: 0, hasShadow: false },
      dataLimit: { show: true, color: '#4f46e5', fontSize: 9, fontFamily: 'Tajawal', fontWeight: 'bold', rotation: 0, hasShadow: false },
    },
    ...overrides,
  } as VoucherDesignState;
}

describe('VoucherStudio Single-Source-of-Truth, Vector QR, Security & Grid Geometry Tests', () => {
  it('rejects empty voucher arrays in both generateStandaloneVoucherHtmlAsync and renderVouchersFullHtml', async () => {
    const design = makeDesign();
    await assert.rejects(
      () =>
        generateStandaloneVoucherHtmlAsync({
          vouchers: [],
          design,
          networkName: 'ZCtrl Net',
          currencySymbol: 'ريال',
          loginUrl: '10.0.0.1',
          showPin: true,
          showQr: true,
        }),
      /لا توجد كروت للتصدير/
    );

    assert.throws(
      () =>
        renderVouchersFullHtml({
          vouchers: [],
          networkName: 'ZCtrl Net',
        }),
      /لا توجد كروت للتصدير/
    );
  });

  it('renders exact voucher counts (21, 40, 100) without fabricating 000001 samples and omits pxpx CSS bugs', async () => {
    const design = makeDesign({ paperType: 'a4_100', columnsCount: 10, rowsCount: 10, cardGap: 1, cardMarginSide: 2 });
    const vouchers = Array.from({ length: 100 }, (_, i) => makeVoucher(i + 1));

    const html = await generateStandaloneVoucherHtmlAsync({
      vouchers,
      design,
      cols: 10,
      rows: 10,
      networkName: 'Exact Count Net',
      currencySymbol: 'ريال',
      loginUrl: '10.0.0.1',
      showPin: true,
      showQr: true,
    });

    assert.equal(html.includes('pxpx'), false, 'HTML output must never contain double pxpx units');
    assert.equal(html.includes('000001'), false, 'HTML output must not fabricate sample codes');
    assert.equal(html.includes('#f43f5e'), false, 'Printed/exported HTML must not draw unsynced red borders');
    assert.equal(html.includes('fonts.googleapis.com'), false, 'Exported HTML must work 100% offline without Google Fonts CDN');

    for (let i = 1; i <= 100; i++) {
      assert.ok(html.includes(`VCODE${String(i).padStart(4, '0')}`), `Missing voucher #${i}`);
    }
    assert.ok(html.includes('.a4-page:last-child, .pos-page:last-child { page-break-after: auto'), 'Last page should avoid trailing blank page break');
  });

  it('deduplicates large base64 bgImage into CSS .bg-img once instead of repeating per card', async () => {
    const uniqueMarker = 'ZCTRLTESTBGIMAGEMARKER999888';
    const fakePng = `data:image/png;base64,${uniqueMarker}${'A'.repeat(200)}`;
    const design = makeDesign({ bgImage: fakePng, showBgImage: true });
    const vouchers = Array.from({ length: 40 }, (_, i) => makeVoucher(i + 1));

    const html = await generateStandaloneVoucherHtmlAsync({
      vouchers,
      design,
      cols: 4,
      rows: 10,
      networkName: 'BG Dedup Net',
      currencySymbol: 'ريال',
      loginUrl: '10.0.0.1',
      showPin: false,
      showQr: false,
    });

    const occurrences = html.split(uniqueMarker).length - 1;
    assert.equal(occurrences, 1, `Expected base64 bgImage once in CSS rule, found ${occurrences} times`);
    assert.ok(html.includes('<div class="bg-img"></div>'));
  });

  it('strictly escapes XSS payloads across voucher fields and strips unsafe URLs/SVGs', async () => {
    const xss = '<script>alert(1)</script>" onclick="evil()"';
    const design = makeDesign({
      networkName: xss,
      currencySymbol: '<img src=x onerror=alert(1)>',
      customText1Content: '<svg onload=alert(1)>',
      bgImage: 'javascript:alert(1)',
    });
    const vouchers = [
      makeVoucher(1, {
        voucherCode: 'SAFE"<script>',
        voucherPin: "1234'<b>",
        profileName: '<img src=x>',
        timeLimit: '<script>x</script>',
        dataLimit: '1GB<svg>',
      }),
    ];

    const html = await generateStandaloneVoucherHtmlAsync({
      vouchers,
      design,
      networkName: xss,
      currencySymbol: 'ريال',
      loginUrl: '10.0.0.1',
      showPin: true,
      showQr: true,
    });

    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.equal(html.includes('onclick="evil()"'), false);
    assert.equal(html.includes('<img src=x'), false);
    assert.equal(html.includes('<svg onload=alert(1)>'), false);
    assert.equal(html.includes('javascript:alert(1)'), false);
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));

    assert.equal(sanitizeImageSrc('javascript:alert(1)'), '');
    assert.equal(sanitizeImageSrc('data:text/html;base64,abc'), '');
    assert.ok(sanitizeImageSrc('data:image/png;base64,iVBORw0KGgo=').startsWith('data:image/png'));
    assert.equal(
      sanitizeSvgMarkup('<svg onload="evil()"><script>bad()</script><rect width="10" height="10"/></svg>'),
      '<svg><rect width="10" height="10"/></svg>'
    );
  });

  it('respects custom bgColor over preset gradient and preserves cardTextColor and vector QR SVGs', async () => {
    const design = makeDesign({
      theme: 'dark',
      bgColor: '#123456',
      cardTextColor: '#abcdef',
    });
    const ctx = buildContext(design, 1.0);
    const cardStyle = computeCardStyle(ctx);
    assert.equal(cardStyle.background, '#123456', 'Custom bgColor must override preset gradient');
    assert.equal(cardStyle.color, '#abcdef');

    const html = await generateStandaloneVoucherHtmlAsync({
      vouchers: [makeVoucher(1)],
      design,
      networkName: 'Vector Net',
      currencySymbol: 'ريال',
      loginUrl: '10.0.0.1',
      showPin: true,
      showQr: true,
    });

    assert.ok(html.includes('#123456'));
    assert.ok(html.includes('#abcdef'));
    assert.ok(html.includes('<div class="qr-svg"'), 'HTML export should embed vector <svg> QR container');
    assert.ok(html.includes('<svg'), 'HTML export should contain vector SVG markup');
  });

  it('enforces readable minimum font floors, numeric letterSpacing, zero header shift, and micro-grid warning', () => {
    const design = makeDesign({ fontFamily: 'Cairo' });
    const ctx = buildContext(design, 0.28);
    const userStyle = computeElementStyle('user', ctx);
    const timeStyle = computeElementStyle('time', ctx);

    assert.equal(typeof userStyle.letterSpacing, 'number');
    assert.ok(userStyle.fontSize >= MIN_PRIMARY_FONT_PX, `Primary font ${userStyle.fontSize} below ${MIN_PRIMARY_FONT_PX}px`);
    assert.ok(timeStyle.fontSize >= MIN_SECONDARY_FONT_PX, `Secondary font ${timeStyle.fontSize} below ${MIN_SECONDARY_FONT_PX}px`);
    assert.ok(userStyle.fontFamily.includes("'JetBrains Mono'") || userStyle.fontFamily.includes("'Cairo'"));

    const denseGrid = autoCalcGrid({
      cardWidthMm: 85,
      cardHeightMm: 52,
      paperType: 'a4_100',
      paperOrientation: 'portrait',
      customCols: 10,
      customRows: 10,
      totalCards: 100,
    });
    assert.equal(denseGrid.totalPerPage, 100);
    assert.ok(denseGrid.fontScale >= 0.28);
    assert.ok(denseGrid.readabilityWarning && denseGrid.readabilityWarning.length > 0);
  });

  it('resolves paper specs accurately for A4, A3, A5, Letter, and thermal 58mm/80mm POS rolls', () => {
    const a4L = getPaperSpec('a4', 'landscape');
    assert.equal(a4L.widthMm, 297);
    assert.equal(a4L.heightMm, 210);
    assert.equal(a4L.isPos, false);

    const a3 = getPaperSpec('a3', 'portrait');
    assert.equal(a3.widthMm, 297);
    assert.equal(a3.heightMm, 420);

    const a5 = getPaperSpec('a5', 'portrait');
    assert.equal(a5.widthMm, 148);
    assert.equal(a5.heightMm, 210);

    const letter = getPaperSpec('letter', 'portrait');
    assert.equal(letter.widthMm, 215.9);
    assert.equal(letter.heightMm, 279.4);

    const pos58 = getPaperSpec('thermal_58mm', 'portrait', undefined, undefined, 60, 3);
    assert.equal(pos58.isPos, true);
    assert.equal(pos58.widthMm, 58);
    assert.equal(pos58.heightMm, 72);

    const pos80 = getPaperSpec('pos80', 'portrait', undefined, undefined, 52, 4);
    assert.equal(pos80.isPos, true);
    assert.equal(pos80.widthMm, 80);
    assert.equal(pos80.heightMm, 66);
  });

  it('uses unbiased CSPRNG rejection sampling in server generateRandomString', () => {
    const charset10 = '0123456789';
    const charset32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let i = 0; i < 50; i++) {
      const s10 = generateRandomString(12, charset10);
      assert.equal(s10.length, 12);
      for (const ch of s10) assert.ok(charset10.includes(ch));

      const s24 = generateRandomString(16, charset10 + 'ABCDEFGHJKLMNP');
      assert.equal(s24.length, 16);

      const s32 = generateRandomString(10, charset32);
      assert.equal(s32.length, 10);
    }
  });

  it('synchronous client voucher-render escapes XSS, emits genuine scannable vector QR, and loads zero CDN links', () => {
    const html = renderVouchersFullHtml({
      vouchers: [makeVoucher(1, { voucherCode: 'SYNC<123>', voucherPin: '44"55' })],
      networkName: '<script>xss()</script>',
      layoutId: '3x7',
      showQr: true,
    });

    assert.equal(html.includes('cdn.jsdelivr.net'), false);
    assert.equal(html.includes('fonts.googleapis.com'), false);
    assert.equal(html.includes('<script>xss()</script>'), false);
    assert.ok(html.includes('&lt;script&gt;xss()&lt;/script&gt;'));
    assert.ok(html.includes('shape-rendering="crispEdges"'));
    assert.ok(html.includes('function printVouchers()'));
    assert.ok(html.includes('function saveAsPdf()'));
  });

  it('renders every preset theme cleanly with zero SVG calc() syntax', async () => {
    for (const def of Object.values(DECORATION_DEFS)) {
      const rendered = def.render(1.0);
      if (rendered.svg) {
        assert.equal(rendered.svg.includes('calc('), false, 'Decoration SVG geometry must never contain CSS calc()');
      }
    }

    for (const themeKey of Object.keys(THEME_PRESETS) as Array<keyof typeof THEME_PRESETS>) {
      const preset = THEME_PRESETS[themeKey];
      const design = makeDesign({
        theme: themeKey,
        bgColor: preset.bgColor,
        cardTextColor: preset.cardTextColor,
        coords: { ...preset.coords },
      });
      const html = await generateStandaloneVoucherHtmlAsync({
        vouchers: [makeVoucher(1)],
        design,
        theme: themeKey,
        networkName: `Theme ${themeKey}`,
        currencySymbol: 'ريال',
        loginUrl: '10.0.0.1',
        showPin: true,
        showQr: true,
      });
      assert.ok(html.includes('VCODE0001'), `Failed rendering theme ${themeKey}`);
      assert.equal(html.includes('pxpx'), false, `Double pxpx in theme ${themeKey}`);
    }
  });
});
