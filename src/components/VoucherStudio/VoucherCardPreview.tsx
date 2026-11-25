import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { VoucherDesignState } from './types';
import { buildAutoLoginQrUrl } from './qrUtils';
import {
  buildContext,
  computeCoords,
  computeElementStyle,
  computeBoxStyle,
  computeCardStyle,
  computeQrSize,
  computePriceStyle,
  renderDecorations,
  renderLogos,
  computeElementZIndex,
  resolveFontStack,
} from './voucherRenderCore';

interface VoucherCardPreviewProps {
  code: string;
  pin?: string;
  price?: number;
  networkName?: string;
  currency?: string;
  timeLimit?: string;
  dataLimit?: string;
  profileName?: string;
  isDense?: boolean;
  credentialType?: 'username_password' | 'username_only';
  cardBgColor?: string;
  cardTextColor?: string;
  fontFamily?: string;
  fontSize?: string;
  borderRadius?: number;
  showQr?: boolean;
  loginUrl?: string;
  theme?: string;
  design?: VoucherDesignState;
  _forceDensityCols?: number;
  fontScale?: number;
  qrSize?: number;
}

export const VoucherCardPreview = React.memo<VoucherCardPreviewProps>(
  ({
    code,
    pin,
    price,
    networkName,
    currency,
    timeLimit,
    dataLimit,
    profileName,
    isDense = false,
    credentialType = 'username_password',
    showQr,
    loginUrl,
    theme,
    design,
    _forceDensityCols,
    fontScale,
    qrSize: customQrSize,
  }) => {
    const scale =
      fontScale ??
      (_forceDensityCols
        ? _forceDensityCols >= 15
          ? 0.32
          : _forceDensityCols >= 8
          ? 0.5
          : _forceDensityCols >= 5
          ? 0.7
          : _forceDensityCols >= 4
          ? 0.82
          : 1.0
        : isDense
        ? 0.7
        : 1.0);

    const activeDesign: VoucherDesignState = design || ({
      theme: (theme as any) || 'modern',
      networkName: networkName || 'شبكة زاهر',
      price: price ?? 500,
      showQr: showQr ?? true,
      authMode: credentialType === 'username_only' ? 'user_only' : 'user_pass',
      loginUrl: loginUrl || '10.0.0.1',
      coords: {} as any,
      elements: {} as any,
    } as VoucherDesignState);

    const ctx = buildContext(activeDesign, scale, customQrSize);
    const coords = computeCoords(activeDesign, ctx.preset);
    const cardStyle = computeCardStyle(ctx);
    const qrPx = computeQrSize(ctx);
    const priceStyle = computePriceStyle(ctx.preset, scale);

    const elNetwork = computeElementStyle('network', ctx);
    const elUser = computeElementStyle('user', ctx);
    const elPass = computeElementStyle('password', ctx);
    const elPrice = computeElementStyle('price', ctx);
    const elTime = computeElementStyle('time', ctx);
    const elProfile = computeElementStyle('profile', ctx);
    const elData = computeElementStyle('dataLimit', ctx);

    const decorations = renderDecorations(ctx.preset, scale);
    const logos = renderLogos(activeDesign, scale);

    const effectiveNetwork = activeDesign.networkName || networkName || 'شبكة زاهر للإنترنت';
    const effectivePrice = price ?? activeDesign.price ?? 500;
    const effectiveCurrency = currency || activeDesign.currencySymbol || 'ريال';
    const effectiveTime = timeLimit || activeDesign.timeLimit || '30 يوم';
    const effectiveData = dataLimit || activeDesign.dataLimit || 'غير محدود';
    const effectiveProfile = profileName || activeDesign.targetProfile || 'باقة إنترنت';
    const effectiveAuthMode = activeDesign.authMode || 'user_only';

    const qrValue = buildAutoLoginQrUrl(
      activeDesign.loginUrl || loginUrl || '10.0.0.1',
      code || '',
      pin || code || '',
      effectiveAuthMode
    );

    const widthMm = activeDesign.cardWidthMm || 85;
    const heightMm = activeDesign.cardHeightMm || 52;
    const aspectRatio = `${widthMm} / ${heightMm}`;

    return (
      <div
        className="relative w-full h-full select-none overflow-hidden block"
        style={{
          ...cardStyle,
          aspectRatio,
          boxSizing: 'border-box',
        }}
      >
        {activeDesign.bgImage && (
          <img
            src={activeDesign.bgImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none z-0"
          />
        )}

        {decorations.map((d, i) => (
          <div key={i} style={d.style} dangerouslySetInnerHTML={d.svg ? { __html: d.svg } : undefined} />
        ))}

        {logos.map((l) => (
          <img key={l.id} src={l.src} alt="" style={l.style} />
        ))}

        {/* 1. Network */}
        {elNetwork.show && activeDesign.showNetworkName !== false && (
          <div
            className="absolute whitespace-nowrap"
            style={{
              left: `${coords.network.x}%`,
              top: `${coords.network.y}%`,
              transform: `translate(-50%, -50%) rotate(${elNetwork.rotation}deg)`,
              color: elNetwork.color,
              fontSize: `${elNetwork.fontSize}px`,
              fontWeight: elNetwork.fontWeight,
              fontFamily: elNetwork.fontFamily,
              letterSpacing: `${elNetwork.letterSpacing}px`,
              textShadow: elNetwork.textShadow,
              zIndex: computeElementZIndex('network', activeDesign),
            }}
          >
            {effectiveNetwork}
          </div>
        )}

        {/* 2. Price */}
        {elPrice.show && (
          <div
            className="absolute whitespace-nowrap"
            style={{
              left: `${coords.price.x}%`,
              top: `${coords.price.y}%`,
              transform: `translate(-50%, -50%) rotate(${elPrice.rotation}deg)`,
              color: elPrice.color,
              fontSize: `${elPrice.fontSize}px`,
              fontWeight: elPrice.fontWeight,
              fontFamily: elPrice.fontFamily,
              letterSpacing: `${elPrice.letterSpacing}px`,
              textShadow: elPrice.textShadow,
              zIndex: computeElementZIndex('price', activeDesign),
              ...priceStyle,
            }}
          >
            {effectivePrice} {effectiveCurrency}
          </div>
        )}

        {/* 3. Profile */}
        {elProfile.show && coords.profile && (
          <div
            className="absolute whitespace-nowrap opacity-90"
            style={{
              left: `${coords.profile.x}%`,
              top: `${coords.profile.y}%`,
              transform: `translate(-50%, -50%) rotate(${elProfile.rotation}deg)`,
              color: elProfile.color,
              fontSize: `${elProfile.fontSize}px`,
              fontWeight: elProfile.fontWeight,
              fontFamily: elProfile.fontFamily,
              letterSpacing: `${elProfile.letterSpacing}px`,
              textShadow: elProfile.textShadow,
              zIndex: computeElementZIndex('profile', activeDesign),
            }}
          >
            🏷️ {effectiveProfile}
          </div>
        )}

        {/* 4. User */}
        {elUser.show && (
          <div
            className="absolute whitespace-nowrap font-mono"
            style={{
              left: `${coords.user.x}%`,
              top: `${coords.user.y}%`,
              transform: `translate(-50%, -50%) rotate(${elUser.rotation}deg)`,
              color: elUser.color,
              fontSize: `${elUser.fontSize}px`,
              fontWeight: elUser.fontWeight,
              fontFamily: elUser.fontFamily,
              letterSpacing: `${elUser.letterSpacing}px`,
              textShadow: elUser.textShadow,
              zIndex: computeElementZIndex('user', activeDesign),
              ...computeBoxStyle(ctx.preset.userBoxStyle, ctx.preset.userBoxBg, ctx.preset.userBoxBorder, scale),
            }}
          >
            <span className="text-[70%] opacity-80 ml-1 font-sans font-normal">كود:</span>
            <span>{code || '••••••'}</span>
          </div>
        )}

        {/* 5. Password */}
        {(effectiveAuthMode === 'user_pass' || effectiveAuthMode === 'user_equals_pass') &&
          elPass.show && (
            <div
              className="absolute whitespace-nowrap font-mono"
              style={{
                left: `${coords.password.x}%`,
                top: `${coords.password.y}%`,
                transform: `translate(-50%, -50%) rotate(${elPass.rotation}deg)`,
                color: elPass.color,
                fontSize: `${elPass.fontSize}px`,
                fontWeight: elPass.fontWeight,
                fontFamily: elPass.fontFamily,
                letterSpacing: `${elPass.letterSpacing}px`,
                textShadow: elPass.textShadow,
                zIndex: computeElementZIndex('password', activeDesign),
                ...computeBoxStyle(
                  ctx.preset.passBoxStyle,
                  ctx.preset.passBoxBg,
                  ctx.preset.passBoxBorder,
                  scale
                ),
              }}
            >
              <span className="text-[70%] opacity-80 ml-1 font-sans font-normal">باسورد:</span>
              <span>{pin || code || '••••'}</span>
            </div>
          )}

        {/* 6. QR Code */}
        {activeDesign.showQr !== false && (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2 p-1 flex items-center justify-center"
            style={{
              left: `${coords.qr.x}%`,
              top: `${coords.qr.y}%`,
              background: ctx.preset.qrBg || '#ffffff',
              borderRadius: `${Math.max(1, Math.round((ctx.preset.qrBorderRadius || 4) * scale))}px`,
              boxShadow: ctx.preset.qrShadow || '0 2px 6px rgba(0,0,0,0.25)',
              zIndex: computeElementZIndex('qr', activeDesign),
            }}
          >
            <QRCodeSVG value={qrValue} size={qrPx} />
          </div>
        )}

        {/* 7. Time */}
        {elTime.show && (
          <div
            className="absolute whitespace-nowrap opacity-90"
            style={{
              left: `${coords.time.x}%`,
              top: `${coords.time.y}%`,
              transform: `translate(-50%, -50%) rotate(${elTime.rotation}deg)`,
              color: elTime.color,
              fontSize: `${elTime.fontSize}px`,
              fontWeight: elTime.fontWeight,
              fontFamily: elTime.fontFamily,
              letterSpacing: `${elTime.letterSpacing}px`,
              textShadow: elTime.textShadow,
              zIndex: computeElementZIndex('time', activeDesign),
            }}
          >
            ⏱️ {effectiveTime}
          </div>
        )}

        {/* 8. Data Limit */}
        {elData.show && coords.dataLimit && (
          <div
            className="absolute whitespace-nowrap opacity-90"
            style={{
              left: `${coords.dataLimit.x}%`,
              top: `${coords.dataLimit.y}%`,
              transform: `translate(-50%, -50%) rotate(${elData.rotation}deg)`,
              color: elData.color,
              fontSize: `${elData.fontSize}px`,
              fontWeight: elData.fontWeight,
              fontFamily: elData.fontFamily,
              letterSpacing: `${elData.letterSpacing}px`,
              textShadow: elData.textShadow,
              zIndex: computeElementZIndex('dataLimit', activeDesign),
            }}
          >
            📊 {effectiveData}
          </div>
        )}

        {/* Custom Text 1 */}
        {activeDesign.customText1Content && (
          <div
            className="absolute whitespace-nowrap font-bold opacity-85"
            style={{
              left: `${coords.customText1?.x ?? 50}%`,
              top: `${coords.customText1?.y ?? 91}%`,
              transform: `translate(-50%, -50%)`,
              color: activeDesign.cardTextColor || ctx.preset.cardTextColor,
              fontSize: `${Math.max(4, Math.round(9 * scale))}px`,
              fontFamily: resolveFontStack(activeDesign.fontFamily),
              zIndex: 10,
            }}
          >
            {activeDesign.customText1Content}
          </div>
        )}

        {/* Custom Text 2 */}
        {activeDesign.customText2Content && (
          <div
            className="absolute whitespace-nowrap font-bold opacity-75"
            style={{
              left: `${coords.customText2?.x ?? 50}%`,
              top: `${coords.customText2?.y ?? 96}%`,
              transform: `translate(-50%, -50%)`,
              color: activeDesign.cardTextColor || ctx.preset.cardTextColor,
              fontSize: `${Math.max(4, Math.round(8 * scale))}px`,
              fontFamily: resolveFontStack(activeDesign.fontFamily),
              zIndex: 10,
            }}
          >
            {activeDesign.customText2Content}
          </div>
        )}
      </div>
    );
  },
  (p, n) =>
    p.code === n.code &&
    p.pin === n.pin &&
    p.price === n.price &&
    p.design === n.design &&
    p.fontScale === n.fontScale &&
    p.qrSize === n.qrSize
);
