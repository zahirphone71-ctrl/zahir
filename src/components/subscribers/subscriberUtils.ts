import { HotspotUser, PPPSecret, UsermanUser, ActiveHotspotUser, PPPActive, UsermanActive } from '../../types/mikrotik';
import { formatBytes } from '../../lib/formatters';
import { SubscriberRowItem } from './types';
import { safeStorage } from '../../utils/safeStorage';

export type SubscriberStatus = 'new' | 'online' | 'idle' | 'suspended' | 'expired';

export interface DeviceInfo {
  label: string;
  category: 'apple' | 'android' | 'windows' | 'router' | 'generic_phone' | 'pc' | 'tv' | 'other';
  vendor: string;
  iconType: 'phone' | 'laptop' | 'router' | 'tablet' | 'tv' | 'server' | 'wifi';
}

/**
 * Intelligent device detection from MAC OUI, Hostname, Caller-ID, or User comments
 */
export function detectDeviceType(
  mac?: string,
  callerId?: string,
  comment?: string,
  hostName?: string
): DeviceInfo {
  const cleanMac = (mac || callerId || '').trim().toUpperCase().replace(/[:-]/g, '');
  const prefix = cleanMac.slice(0, 6);
  const textInfo = `${comment || ''} ${hostName || ''}`.toLowerCase();
  const cleanHost = (hostName || '').trim();

  // 1. Text patterns in comments or hostnames
  if (textInfo.includes('iphone') || textInfo.includes('ipad') || textInfo.includes('apple') || textInfo.includes('macbook')) {
    const isMacbook = textInfo.includes('macbook');
    const label = cleanHost
      ? (cleanHost.toLowerCase().includes('apple') || cleanHost.toLowerCase().includes('iphone') || cleanHost.toLowerCase().includes('ipad')
          ? cleanHost
          : `Apple (${cleanHost})`)
      : 'Apple (iPhone/iPad/Mac)';
    return { label, category: 'apple', vendor: 'Apple', iconType: isMacbook ? 'laptop' : 'phone' };
  }
  if (textInfo.includes('samsung') || textInfo.includes('galaxy')) {
    const label = cleanHost
      ? (cleanHost.toLowerCase().includes('samsung') || cleanHost.toLowerCase().includes('galaxy')
          ? cleanHost
          : `سامسونج (${cleanHost})`)
      : 'سامسونج Galaxy';
    return { label, category: 'android', vendor: 'Samsung', iconType: 'phone' };
  }
  if (textInfo.includes('xiaomi') || textInfo.includes('redmi') || textInfo.includes('poco')) {
    const label = cleanHost
      ? (cleanHost.toLowerCase().includes('xiaomi') || cleanHost.toLowerCase().includes('redmi') || cleanHost.toLowerCase().includes('poco')
          ? cleanHost
          : `شاومي (${cleanHost})`)
      : 'شاومي / ريدمي Xiaomi';
    return { label, category: 'android', vendor: 'Xiaomi', iconType: 'phone' };
  }
  if (textInfo.includes('huawei') || textInfo.includes('honor')) {
    const label = cleanHost
      ? (cleanHost.toLowerCase().includes('huawei') || cleanHost.toLowerCase().includes('honor')
          ? cleanHost
          : `هواوي (${cleanHost})`)
      : 'هواوي Huawei';
    return { label, category: 'android', vendor: 'Huawei', iconType: 'phone' };
  }
  if (textInfo.includes('infinix') || textInfo.includes('tecno') || textInfo.includes('itel')) {
    const label = cleanHost
      ? (cleanHost.toLowerCase().includes('infinix') || cleanHost.toLowerCase().includes('tecno') || cleanHost.toLowerCase().includes('itel')
          ? cleanHost
          : `إنفينكس/تكنو (${cleanHost})`)
      : 'إنفينكس / تكنو Transsion';
    return { label, category: 'android', vendor: 'Transsion', iconType: 'phone' };
  }
  if (textInfo.includes('oppo') || textInfo.includes('cph') || textInfo.includes('pad')) {
    const label = cleanHost ? `أوبو OPPO (${cleanHost})` : 'أوبو OPPO';
    return { label, category: 'android', vendor: 'OPPO', iconType: 'phone' };
  }
  if (textInfo.includes('realme') || textInfo.includes('rmx')) {
    const label = cleanHost ? `ريلمي Realme (${cleanHost})` : 'ريلمي Realme';
    return { label, category: 'android', vendor: 'Realme', iconType: 'phone' };
  }
  if (textInfo.includes('vivo') || textInfo.includes('v20') || textInfo.includes('v21') || textInfo.includes('v22') || textInfo.includes('y20') || textInfo.includes('y21')) {
    const label = cleanHost ? `فيفو Vivo (${cleanHost})` : 'فيفو Vivo';
    return { label, category: 'android', vendor: 'Vivo', iconType: 'phone' };
  }
  if (textInfo.includes('oneplus') || textInfo.includes('one-plus')) {
    const label = cleanHost ? `ون بلس OnePlus (${cleanHost})` : 'ون بلس OnePlus';
    return { label, category: 'android', vendor: 'OnePlus', iconType: 'phone' };
  }
  if (textInfo.includes('tplink') || textInfo.includes('tp-link') || textInfo.includes('tenda') || textInfo.includes('router') || textInfo.includes('mikrotik')) {
    const label = cleanHost ? `راوتر (${cleanHost})` : 'راوتر / أكسس بوينت';
    return { label, category: 'router', vendor: 'Router', iconType: 'router' };
  }
  if (textInfo.includes('windows') || textInfo.includes('laptop') || textInfo.includes('desktop') || textInfo.includes('pc')) {
    const label = cleanHost ? `كمبيوتر (${cleanHost})` : 'كمبيوتر / لابتوب ويندوز';
    return { label, category: 'windows', vendor: 'Windows', iconType: 'laptop' };
  }
  if (textInfo.includes('tv') || textInfo.includes('smart') || textInfo.includes('androidbox')) {
    const label = cleanHost ? `شاشة ذكية (${cleanHost})` : 'شاشة ذكية / TV Box';
    return { label, category: 'tv', vendor: 'Smart TV', iconType: 'tv' };
  }

  // 2. MAC OUI Database sample detection
  if (prefix) {
    // Apple OUIs
    if (['F09838', 'F01898', 'F4F15A', 'DC2B61', 'DC2B66', 'DC3714', 'D89695', 'D0034B', 'C869CD', 'BC9FEF', 'A483E7', '8C8590', '703EAC', '68DBCA', '64A5C3', '404D7F', '28ED6A', '20EE28', '14109F', '0017F2', '001E52', '002312', '002500', '002608', '0026BB', '041E64', '04DB56', '0C5101', '109ADD', '147DD7', '18AF61', '1C1AE0', '24F677', '286A81'].includes(prefix)) {
      const label = cleanHost ? `Apple (${cleanHost})` : 'جهاز Apple (iOS/macOS)';
      return { label, category: 'apple', vendor: 'Apple', iconType: 'phone' };
    }
    // Samsung OUIs
    if (['F409D8', 'E47C02', 'D857EF', 'C0BDD1', 'A80600', '980D2E', '88329B', '78471D', '60AF6D', '549B12', '444E1A', '3423BA', '244B81', '14B484', '044EAF', '001247', '001599', '00166C', '0017C9', '001D25', '0021D2', '0023D7', '002454', '002637', '08FC88', '10D542', '183A2D', '28940F', '30CDA7', '380146'].includes(prefix)) {
      const label = cleanHost ? `سامسونج (${cleanHost})` : 'سامسونج Galaxy';
      return { label, category: 'android', vendor: 'Samsung', iconType: 'phone' };
    }
    // Xiaomi OUIs
    if (['FC64BA', 'F460E2', 'D4970B', 'C46E7B', 'B072BF', '9C99A0', '88C397', '7C1C4E', '689A87', '584120', '441CA8', '348062', '286C07', '18F0E4', '04B167', '00EC0A', '102C6B', '203233', '38A4ED', '50642B', '640980', '7811DC', '8CBEBE', 'A086C6', 'B40EB7', 'C8F230', 'DC16B2', 'F01898'].includes(prefix)) {
      const label = cleanHost ? `شاومي (${cleanHost})` : 'شاومي / ريدمي Xiaomi';
      return { label, category: 'android', vendor: 'Xiaomi', iconType: 'phone' };
    }
    // Huawei OUIs
    if (['F84ABF', 'E8CD2D', 'D8490B', 'C8D15E', 'B44326', 'A08CF8', '8C34FD', '78F5FD', '68A03E', '548998', '404D8E', '286ED4', '18C58A', '0819A6', '001E10', '002568', '00259E', '00464B', '10C61F', '200B04', '308730', '4846FB', '5C0339', '707B53', '84DBAC', '9C28EF', 'AC4E91', 'BC7670', 'CC96A0', 'E01954', 'F4C479'].includes(prefix)) {
      const label = cleanHost ? `هواوي (${cleanHost})` : 'هواوي Huawei';
      return { label, category: 'android', vendor: 'Huawei', iconType: 'phone' };
    }
    // Transsion (Infinix / Tecno / itel)
    if (['FC0FE6', 'D41243', 'B86C8D', 'A48431', '80AD16', '601466', '485702', '3417EB', '1C872C', '083A88', '009E68', '140A7C', '2C2617', '405539', '54369B', '689C70', '7CA7B8', '907F61', 'A40166', 'B84DA7', 'CC08E0', 'E0D4E8'].includes(prefix)) {
      const label = cleanHost ? `إنفينكس/تكنو (${cleanHost})` : 'إنفينكس / تكنو Transsion';
      return { label, category: 'android', vendor: 'Transsion', iconType: 'phone' };
    }
    // OPPO / Realme OUIs
    if (['A0E6F8', '3C8375', 'B83707', '180D2C', '9C6EBE', 'FC1AA0', '74D581', '702459', 'E47F12', '7C6B7B'].includes(prefix)) {
      const label = cleanHost ? `أوبو / ريلمي (${cleanHost})` : 'جهاز OPPO / Realme';
      return { label, category: 'android', vendor: 'OPPO', iconType: 'phone' };
    }
    // Vivo OUIs
    if (['7C7D3D', '8CDF8D', 'E8997F', 'F85C74', '6C1B47', '389369', '3C22F5'].includes(prefix)) {
      const label = cleanHost ? `فيفو (${cleanHost})` : 'جهاز فيفو Vivo';
      return { label, category: 'android', vendor: 'Vivo', iconType: 'phone' };
    }
    // MikroTik OUIs
    if (['CC2DE0', 'B869F4', '6C3B6B', '488F5A', '2C6B7D', '000C42', '18FD74', '085531', '744D28', 'D4CA6D', 'E48D8C'].includes(prefix)) {
      const label = cleanHost ? `راوتر MikroTik (${cleanHost})` : 'جهاز MikroTik RouterOS';
      return { label, category: 'router', vendor: 'MikroTik', iconType: 'router' };
    }
    // TP-Link OUIs
    if (['F4EC38', 'E848B8', 'D807B6', 'C04A00', 'B04E26', '98DED0', '8416F9', '74DA38', '6032B1', '50C7BF', '3897D6', '1C3BF3', '002586', '0C8063', '14CC20', '20DC99', '30B5C2', '403F8C', '54E6FC', '647002', '788C54', '8CD564', 'A42BB0', 'B48655', 'C46E1F', 'D46E0E', 'E4C32A', 'F81A67'].includes(prefix)) {
      const label = cleanHost ? `راوتر TP-Link (${cleanHost})` : 'راوتر TP-Link';
      return { label, category: 'router', vendor: 'TP-Link', iconType: 'router' };
    }
    // Tenda OUIs
    if (['C83A35', 'B83A08', 'A408EA', '502B73', '0495E6', '00B00C', 'D83214', 'CC2D21'].includes(prefix)) {
      const label = cleanHost ? `راوتر Tenda (${cleanHost})` : 'راوتر تندا Tenda';
      return { label, category: 'router', vendor: 'Tenda', iconType: 'router' };
    }
    // Intel (Laptops / PCs)
    if (['F8633F', 'E470B8', 'D0577B', 'BC7737', 'A44C11', '8CE99B', '782B46', '605718', '4C3488', '3413E8', '24EE9A', '106530', '001302', '001B21', '0024D7', '08D40C', '2016B9', '38BAF8', '5076AF', '680571', '801934', '98AF65', 'B49691', 'C85B76', 'DC7196', 'F0D5BF'].includes(prefix)) {
      const label = cleanHost ? `كمبيوتر Intel (${cleanHost})` : 'كمبيوتر / لابتوب Intel';
      return { label, category: 'windows', vendor: 'Intel PC', iconType: 'laptop' };
    }
    // Realtek (PCs / Cards)
    if (['5404A6', '00E04C', '0014D1', '000000'].includes(prefix)) {
      const label = cleanHost ? `كمبيوتر Realtek (${cleanHost})` : 'كمبيوتر Realtek Network';
      return { label, category: 'pc', vendor: 'Realtek', iconType: 'laptop' };
    }
  }

  // 3. Explicit hostname without known OUI
  if (cleanHost.length > 0) {
    if (cleanHost.toLowerCase().startsWith('android-')) {
      return {
        label: `هاتف أندرويد (${cleanHost})`,
        category: 'android',
        vendor: 'Android',
        iconType: 'phone'
      };
    }
    return {
      label: cleanHost,
      category: 'other',
      vendor: 'جهاز محمول',
      iconType: 'phone'
    };
  }

  // 4. MAC exists but vendor unknown
  if (cleanMac.length >= 6) {
    return { label: 'هاتف ذكي / جهاز محمول', category: 'generic_phone', vendor: 'جهاز محمول', iconType: 'phone' };
  }

  return { label: 'جهاز غير محدد', category: 'other', vendor: 'غير محدد', iconType: 'wifi' };
}

/**
 * Parses duration strings like "01:25:30", "2h15m", "1d2h", "45m", "300s" to total seconds
 */
export function parseDurationToSeconds(durStr?: string): number {
  if (!durStr || typeof durStr !== 'string') return 0;
  const s = durStr.trim().toLowerCase();
  if (!s || s === '0' || s === '0s' || s === '00:00:00') return 0;

  // Format HH:MM:SS
  if (s.includes(':')) {
    const parts = s.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }

  // Format e.g. "1w2d3h4m5s" or "30d" or "2h"
  let totalSec = 0;
  const weeks = s.match(/(\d+)\s*w/);
  const days = s.match(/(\d+)\s*d/);
  const hours = s.match(/(\d+)\s*h/);
  const minutes = s.match(/(\d+)\s*m/);
  const seconds = s.match(/(\d+)\s*s/);

  if (weeks) totalSec += parseInt(weeks[1], 10) * 7 * 86400;
  if (days) totalSec += parseInt(days[1], 10) * 86400;
  if (hours) totalSec += parseInt(hours[1], 10) * 3600;
  if (minutes) totalSec += parseInt(minutes[1], 10) * 60;
  if (seconds) totalSec += parseInt(seconds[1], 10);

  if (totalSec > 0) return totalSec;

  const rawNum = parseInt(s, 10);
  return isNaN(rawNum) ? 0 : rawNum;
}

/**
 * Smart duration parser from profile names and user comments
 * Supports English (1h, 2_hours, 1d, 30d, 1w) and Arabic (ساعة, ساعتين, 3 ساعات, يوم, شهر, إلخ)
 */
export function parseDurationFromProfileName(profileName?: string): number {
  if (!profileName) return 0;
  const clean = String(profileName).trim().toLowerCase();
  if (!clean || clean === 'default' || clean === 'default-encryption') return 0;

  // Direct Arabic keyword phrases
  if (/(?:ساعة واحدة|ساعه واحده|\bساعة\b|\bساعه\b)/i.test(clean) && !/\d+\s*(?:ساعة|ساعه)/.test(clean)) {
    return 3600;
  }
  if (/(?:ساعتان|ساعتين)/i.test(clean)) {
    return 7200;
  }
  if (/(?:يوم واحد|\bيوم\b)/i.test(clean) && !/\d+\s*يوم/.test(clean)) {
    return 86400;
  }
  if (/(?:يومان|يومين)/i.test(clean)) {
    return 172800;
  }
  if (/(?:أسبوع|اسبوع)/i.test(clean) && !/\d+\s*(?:أسبوع|اسبوع)/.test(clean)) {
    return 604800;
  }
  if (/(?:أسبوعان|اسبوعين)/i.test(clean)) {
    return 1209600;
  }
  if (/(?:شهر واحد|\bشهر\b)/i.test(clean) && !/\d+\s*شهر/.test(clean)) {
    return 2592000;
  }
  if (/(?:شهران|شهرين)/i.test(clean)) {
    return 5184000;
  }

  // Days match: e.g. "30d", "1d", "7 days", "3 أيام", "15 يوم"
  const daysMatch = clean.match(/(\d+)\s*(?:days?|d|أيام|ايام|يوم|ي)\b/i);
  if (daysMatch) {
    const num = parseInt(daysMatch[1], 10);
    if (!isNaN(num) && num > 0) return num * 86400;
  }

  // Weeks match: e.g. "1w", "2 weeks", "2 اسابيع"
  const weeksMatch = clean.match(/(\d+)\s*(?:weeks?|w|اسابيع|أسبوع|اسبوع)\b/i);
  if (weeksMatch) {
    const num = parseInt(weeksMatch[1], 10);
    if (!isNaN(num) && num > 0) return num * 604800;
  }

  // Months match: e.g. "1 month", "3 اشهر", "6 شهور"
  const monthsMatch = clean.match(/(\d+)\s*(?:months?|أشهر|اشهر|شهور|شهر)\b/i);
  if (monthsMatch) {
    const num = parseInt(monthsMatch[1], 10);
    if (!isNaN(num) && num > 0) return num * 2592000;
  }

  // Hours match: e.g. "1h", "2_hours", "3hrs", "6 ساعات", "12 ساعة"
  const hoursMatch = clean.match(/(\d+)\s*(?:hours?|hrs?|h|ساعات|ساعة|ساعه|س)\b/i);
  if (hoursMatch) {
    const num = parseInt(hoursMatch[1], 10);
    if (!isNaN(num) && num > 0) return num * 3600;
  }

  // Minutes match: e.g. "30m", "45mins", "30 دقيقة"
  const minsMatch = clean.match(/(\d+)\s*(?:mins?|minutes?|دقيقة|دقائق|د)\b/i);
  if (minsMatch) {
    const num = parseInt(minsMatch[1], 10);
    if (!isNaN(num) && num > 0) return num * 60;
  }

  return 0;
}

/**
 * Smart byte quota parser from profile names and comments
 * Supports "1GB", "500MB", "2 جيجا", "10 غيغا", etc.
 */
export function parseBytesFromText(text?: string): number {
  if (!text) return 0;
  const clean = String(text).trim().toLowerCase();

  // Terabytes
  const tbMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:tb|تيرا)(?=$|\s|[^a-z0-9\u0600-\u06FF])/i);
  if (tbMatch) {
    const num = parseFloat(tbMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 1024 * 1024 * 1024 * 1024);
  }

  // Gigabytes
  const gbMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:gb|g|غيغا|جيجا|قيقا)(?=$|\s|[^a-z0-9\u0600-\u06FF])/i);
  if (gbMatch) {
    const num = parseFloat(gbMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 1024 * 1024 * 1024);
  }

  // Megabytes
  const mbMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:mb|ميجا|ميقا)(?=$|\s|[^a-z0-9\u0600-\u06FF])/i);
  if (mbMatch) {
    const num = parseFloat(mbMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 1024 * 1024);
  }

  // Kilobytes
  const kbMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kb|كيلو)(?=$|\s|[^a-z0-9\u0600-\u06FF])/i);
  if (kbMatch) {
    const num = parseFloat(kbMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 1024);
  }

  // Pure "M" if followed by bytes context e.g. "500M"
  const pureMMatch = clean.match(/(\d+(?:\.\d+)?)\s*m(?=$|\s|[^a-z0-9\u0600-\u06FF])(?!s|in|onth)/i);
  if (pureMMatch) {
    const num = parseFloat(pureMMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 1024 * 1024);
  }

  return 0;
}

/**
 * Parses voucher / limit data strings ("500 MB", "2.5 GB", "1073741824") or raw byte numbers cleanly into bytes.
 */
export function parseDataLimitToBytes(val?: string | number | null): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? Math.round(val) : 0;
  }
  const trimmed = String(val).trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const parsed = parseBytesFromText(trimmed);
  if (parsed > 0) return parsed;
  const fallbackNum = parseFloat(trimmed);
  return Number.isFinite(fallbackNum) && fallbackNum > 0 ? Math.round(fallbackNum) : 0;
}

export interface ResolvedProfileLimits {
  timeLimitStr: string;
  timeLimitSec: number;
  dataLimitStr: string;
  dataLimitBytes: number;
  hasTimeLimit: boolean;
  hasDataLimit: boolean;
  rawTimeLimit?: string;
  rawBytesLimit?: number;
  source: 'direct' | 'profile' | 'profile_name' | 'voucher' | 'unlimited';
}

/**
 * Resolves exact limits for any card by looking up User Manager / Hotspot profile settings,
 * user limits, and profile name conventions.
 */
export function resolveProfileLimits(
  profileName?: string,
  profileObj?: any,
  userLimits?: { limitUptime?: string; limitBytesTotal?: number },
  voucherItem?: { timeLimit?: string; dataLimit?: string | number }
): ResolvedProfileLimits {
  // 1. Time resolution
  let timeLimitSec = 0;
  let rawTime = '';
  let timeSource: ResolvedProfileLimits['source'] = 'unlimited';

  if (userLimits?.limitUptime && parseDurationToSeconds(userLimits.limitUptime) > 0) {
    timeLimitSec = parseDurationToSeconds(userLimits.limitUptime);
    rawTime = userLimits.limitUptime;
    timeSource = 'direct';
  } else if (profileObj?.uptimeLimit && parseDurationToSeconds(profileObj.uptimeLimit) > 0) {
    timeLimitSec = parseDurationToSeconds(profileObj.uptimeLimit);
    rawTime = profileObj.uptimeLimit;
    timeSource = 'profile';
  } else if (profileObj?.validity && parseDurationToSeconds(profileObj.validity) > 0) {
    timeLimitSec = parseDurationToSeconds(profileObj.validity);
    rawTime = profileObj.validity;
    timeSource = 'profile';
  } else if (voucherItem?.timeLimit && parseDurationToSeconds(voucherItem.timeLimit) > 0) {
    timeLimitSec = parseDurationToSeconds(voucherItem.timeLimit);
    rawTime = voucherItem.timeLimit;
    timeSource = 'voucher';
  } else if (profileName) {
    const parsedSec = parseDurationFromProfileName(profileName);
    if (parsedSec > 0) {
      timeLimitSec = parsedSec;
      rawTime = `${parsedSec}s`;
      timeSource = 'profile_name';
    }
  }

  // 2. Data quota resolution
  let dataLimitBytes = 0;
  if (userLimits?.limitBytesTotal && userLimits.limitBytesTotal > 0) {
    dataLimitBytes = userLimits.limitBytesTotal;
  } else if (profileObj?.transferLimit && profileObj.transferLimit > 0) {
    dataLimitBytes = profileObj.transferLimit;
  } else if (profileObj?.downloadLimit && profileObj.downloadLimit > 0) {
    dataLimitBytes = profileObj.downloadLimit;
  } else if (profileObj?.dataQuotaMb && Number(profileObj.dataQuotaMb) > 0) {
    dataLimitBytes = Math.round(Number(profileObj.dataQuotaMb) * 1024 * 1024);
  } else if (voucherItem?.dataLimit) {
    const vBytes = parseDataLimitToBytes(voucherItem.dataLimit);
    if (vBytes > 0) dataLimitBytes = vBytes;
  } else if (profileName) {
    const parsedBytes = parseBytesFromText(profileName);
    if (parsedBytes > 0) dataLimitBytes = parsedBytes;
  }

  const timeLimitStr = timeLimitSec > 0 ? formatSecondsToArabic(timeLimitSec) : 'غير محدود';
  const dataLimitStr = dataLimitBytes > 0 ? formatBytes(dataLimitBytes) : 'غير محدود';

  return {
    timeLimitStr,
    timeLimitSec,
    dataLimitStr,
    dataLimitBytes,
    hasTimeLimit: timeLimitSec > 0,
    hasDataLimit: dataLimitBytes > 0,
    rawTimeLimit: rawTime,
    rawBytesLimit: dataLimitBytes,
    source: timeSource
  };
}

/**
 * Formats seconds into human readable Arabic string (e.g. "1 ساعة و 30 دقيقة" or "45 د")
 */
export function formatSecondsToArabic(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0 ثانية';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (hours > 0) parts.push(`${hours} ساعة`);
  if (minutes > 0) parts.push(`${minutes} دقيقة`);
  if (parts.length === 0 || (days === 0 && hours === 0 && minutes < 5 && seconds > 0)) {
    parts.push(`${seconds} ثانية`);
  }
  return parts.join(' و ');
}

/**
 * Calculates remaining time considering limitUptime, consumed uptime, validity end time, and profile limits
 */
export function calculateRemainingTime(
  limitUptime?: string,
  consumedUptime?: string,
  endTime?: string,
  profileName?: string,
  resolvedLimitSec?: number
): {
  text: string;
  isExpired: boolean;
  remainingSeconds: number;
  totalLimitSeconds: number;
  percentage: number;
} {
  // Check validity end-time first
  const parsedEndTime = parseMikrotikDateTime(endTime);
  let validityRemainingSec: number | null = null;
  if (parsedEndTime) {
    const diffSec = Math.floor((parsedEndTime.getTime() - Date.now()) / 1000);
    if (diffSec <= 0) {
      return {
        text: 'منتهي الصلاحية',
        isExpired: true,
        remainingSeconds: 0,
        totalLimitSeconds: 0,
        percentage: 0
      };
    }
    validityRemainingSec = diffSec;
  }

  // Check uptime limit
  let limitSec = resolvedLimitSec || parseDurationToSeconds(limitUptime);
  if (limitSec <= 0 && profileName) {
    limitSec = parseDurationFromProfileName(profileName);
  }
  const usedSec = parseDurationToSeconds(consumedUptime);

  let uptimeRemainingSec: number | null = null;
  if (limitSec > 0) {
    uptimeRemainingSec = Math.max(0, limitSec - usedSec);
    if (uptimeRemainingSec <= 0) {
      return {
        text: 'منتهي الوقت',
        isExpired: true,
        remainingSeconds: 0,
        totalLimitSeconds: limitSec,
        percentage: 0
      };
    }
  }

  // Combine validity and uptime limits
  let effectiveSec: number;
  let totalSec: number;

  if (validityRemainingSec !== null && uptimeRemainingSec !== null) {
    effectiveSec = Math.min(validityRemainingSec, uptimeRemainingSec);
    totalSec = limitSec;
  } else if (validityRemainingSec !== null) {
    effectiveSec = validityRemainingSec;
    totalSec = Math.max(validityRemainingSec, 86400);
  } else if (uptimeRemainingSec !== null) {
    effectiveSec = uptimeRemainingSec;
    totalSec = limitSec;
  } else {
    return {
      text: 'مفتوح (غير محدود)',
      isExpired: false,
      remainingSeconds: Infinity,
      totalLimitSeconds: 0,
      percentage: 100
    };
  }

  if (effectiveSec <= 0) {
    return {
      text: 'منتهي الصلاحية',
      isExpired: true,
      remainingSeconds: 0,
      totalLimitSeconds: totalSec,
      percentage: 0
    };
  }

  const percentage = Math.max(1, Math.min(100, Math.round((effectiveSec / Math.max(totalSec, effectiveSec)) * 100)));
  const text = `متبقي ${formatSecondsToArabic(effectiveSec)}`;

  return {
    text,
    isExpired: false,
    remainingSeconds: effectiveSec,
    totalLimitSeconds: totalSec,
    percentage
  };
}

/**
 * Calculates remaining data quota from limitBytesTotal and consumed bytes
 */
export function calculateRemainingData(
  limitBytesTotal?: number,
  consumedBytes?: number,
  profileName?: string,
  profileLimitFallbackBytes?: number
): {
  text: string;
  isExpired: boolean;
  remainingBytes: number;
  percentage: number;
} {
  let limit = limitBytesTotal || profileLimitFallbackBytes || 0;
  const used = consumedBytes || 0;

  if (limit <= 0 && profileName) {
    const limits = resolveProfileLimits(profileName);
    if (limits.hasDataLimit && limits.dataLimitBytes > 0) {
      limit = limits.dataLimitBytes;
    }
  }

  if (limit <= 0) {
    return {
      text: 'مفتوح (غير محدود)',
      isExpired: false,
      remainingBytes: Infinity,
      percentage: 100
    };
  }

  const remaining = Math.max(0, limit - used);
  const isExpired = remaining <= 0;
  const percentage = Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));

  return {
    text: isExpired ? 'منتهية البيانات' : `متبقي ${formatBytes(remaining)}`,
    isExpired,
    remainingBytes: remaining,
    percentage
  };
}

/**
 * Status determination for Hotspot user
 * Only manually disabled cards (disabled === true) are marked as 'suspended' (معلق)
 */
export function getHotspotUserStatus(
  u: HotspotUser,
  activeList: ActiveHotspotUser[] | Set<string>,
  profileObj?: any,
  voucherItem?: any
): SubscriberStatus {
  if (!u) return 'new';

  if (u.disabled || (u as any).raw?.disabled) return 'suspended';

  const commentStr = String(u.comment || '').toLowerCase();
  const isCommentExpired =
    commentStr.includes('expired') ||
    commentStr.includes('منتهي') ||
    commentStr.includes('منتهية') ||
    commentStr.includes('مفصول لعدم السداد') ||
    commentStr.includes('مفصول') ||
    commentStr.includes('خالص');

  const resolvedLimits = resolveProfileLimits(
    u.profile,
    profileObj,
    { limitUptime: u.limitUptime, limitBytesTotal: u.limitBytesTotal },
    voucherItem
  );

  const endTimeRaw = (u as any).raw?.endTime || (u as any).raw?.['end-time'] || (u as any).raw?.['till-time'];
  const remainingTime = calculateRemainingTime(
    u.limitUptime,
    u.uptime,
    endTimeRaw,
    u.profile,
    resolvedLimits.timeLimitSec
  );
  const remainingData = calculateRemainingData(
    u.limitBytesTotal,
    (Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0),
    u.profile,
    resolvedLimits.dataLimitBytes
  );

  if (isCommentExpired || remainingTime.isExpired || remainingData.isExpired) {
    return 'expired';
  }

  const uName = String(u.name || '').toLowerCase().trim();
  let isOnline = false;
  if (activeList instanceof Set) {
    isOnline = activeList.has(uName);
  } else if (Array.isArray(activeList)) {
    isOnline = activeList.some((a) => {
      const aUser = String(a?.user || (a as any)?.name || '').toLowerCase().trim();
      return Boolean(aUser && uName && aUser === uName);
    });
  }

  if (isOnline) return 'online';

  const usedSec = parseDurationToSeconds(u.uptime);
  const usedBytes = (Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0);
  const hasConnectedPreviously = Boolean(
    usedSec > 0 ||
    usedBytes > 0 ||
    u.lastLoggedOut ||
    (u as any).raw?.lastLoggedOut ||
    (u as any).raw?.['last-logged-out'] ||
    (u as any).callerId
  );

  if (hasConnectedPreviously) return 'idle';

  return 'new';
}

/**
 * Status determination for PPPoE Secret
 * Only manually disabled secrets (disabled === true) are marked as 'suspended' (معلق)
 */
export function getPPPSecretStatus(
  s: PPPSecret,
  activeList: PPPActive[] | Set<string>,
  profileObj?: any,
  voucherItem?: any
): SubscriberStatus {
  if (!s) return 'new';

  if (s.disabled || (s as any).raw?.disabled) return 'suspended';

  const commentStr = String(s.comment || '').toLowerCase();
  const isCommentExpired =
    commentStr.includes('expired') ||
    commentStr.includes('منتهي') ||
    commentStr.includes('منتهية') ||
    commentStr.includes('مفصول لعدم السداد') ||
    commentStr.includes('مفصول');

  const resolvedLimits = resolveProfileLimits(
    s.profile,
    profileObj,
    { limitUptime: s.limitUptime, limitBytesTotal: s.limitBytesTotal },
    voucherItem
  );

  const remainingTime = calculateRemainingTime(
    s.limitUptime,
    (s as any).uptime || (s as any).raw?.uptime || '0s',
    (s as any).raw?.endTime || (s as any).raw?.['end-time'] || (s as any).raw?.['till-time'],
    s.profile,
    resolvedLimits.timeLimitSec
  );
  const remainingData = calculateRemainingData(
    s.limitBytesTotal,
    (Number((s as any).bytesIn) || 0) + (Number((s as any).bytesOut) || 0),
    s.profile,
    resolvedLimits.dataLimitBytes
  );

  if (isCommentExpired || remainingTime.isExpired || remainingData.isExpired) {
    return 'expired';
  }

  const sName = String(s.name || '').toLowerCase().trim();
  let isOnline = false;
  if (activeList instanceof Set) {
    isOnline = activeList.has(sName);
  } else if (Array.isArray(activeList)) {
    isOnline = activeList.some((a) => {
      const aName = String(a?.name || (a as any)?.user || '').toLowerCase().trim();
      return Boolean(aName && sName && aName === sName);
    });
  }

  if (isOnline) return 'online';

  const hasEverConnected = Boolean(
    (s as any)['last-logged-out'] ||
    (s as any).lastLoggedOut ||
    (s as any).raw?.['last-logged-out'] ||
    (s as any).callerId ||
    (s as any).lastCallerId
  );

  if (hasEverConnected) return 'idle';

  return 'new';
}

/**
 * Resolves the precise status of a Usermanager user
 * - Suspended: User state is disabled explicitly
 * - Expired: End-time passed, uptime reached, quota reached, state expired
 * - Online: Active session currently ongoing
 * - Idle: Has connected previously, currently offline, validity still active
 * - New: Never connected yet
 */
export function getUsermanUserStatus(
  u: UsermanUser,
  activeList: UsermanActive[] | Set<string>,
  profileObj?: any,
  voucherItem?: any
): SubscriberStatus {
  if (!u) return 'new';

  const isDisabled =
    u.state === 'disabled' ||
    Boolean((u as any).disabled) ||
    String((u as any).raw?.disabled).toLowerCase() === 'true' ||
    String(u.comment || '').includes('[SUSPENDED]');
  if (isDisabled) return 'suspended';

  const usedSec = parseDurationToSeconds(u.uptime || (u as any).raw?.['uptime-used'] || "0s");
  const dlUsed = parseInt((u as any).raw?.['download-used'] || (u as any).raw?.['bytes-out'] || "0", 10) || 0;
  const ulUsed = parseInt((u as any).raw?.['upload-used'] || (u as any).raw?.['bytes-in'] || "0", 10) || 0;
  const trUsed = (Number((u as any).bytesIn) || 0) + (Number((u as any).bytesOut) || 0) || (dlUsed + ulUsed);
  
  const stateLower = String(u.state || (u as any).raw?.state || '').toLowerCase();
  const isStateExpired = stateLower === 'expired' || stateLower === 'used_up' || stateLower === 'depleted' || stateLower === 'finished';
  
  const commentStr = String(u.comment || '').toLowerCase();
  const isCommentExpired =
    commentStr.includes('[expired]') ||
    commentStr.includes('expired') ||
    commentStr.includes('منتهي') ||
    commentStr.includes('منتهية') ||
    commentStr.includes('انتهت الصلاحية') ||
    commentStr.includes('مفصول لعدم السداد') ||
    commentStr.includes('مفصول');

  const endTimeRaw = (u as any).endTime || (u as any).raw?.endTime || (u as any).raw?.['end-time'] || (u as any).raw?.['till-time'];
  const rawUptimeLimit = u.limitUptime || (u as any).raw?.['limit-uptime'] || (u as any).raw?.['uptime-limit'] || profileObj?.uptimeLimit || "";
  const trLimit = u.limitBytesTotal || parseInt(profileObj?.['transfer-limit'] || profileObj?.transferLimit || (u as any).raw?.['limit-bytes-total'] || (u as any).raw?.['transfer-limit'] || "0", 10) || 0;

  const resolvedLimits = resolveProfileLimits(
    u.profile,
    profileObj,
    { limitUptime: rawUptimeLimit || undefined, limitBytesTotal: trLimit || undefined },
    voucherItem
  );

  const remainingTime = calculateRemainingTime(
    rawUptimeLimit,
    u.uptime || (u as any).raw?.['uptime-used'] || "0s",
    endTimeRaw,
    u.profile,
    resolvedLimits.timeLimitSec
  );

  const remainingData = calculateRemainingData(
    trLimit > 0 ? trLimit : undefined,
    trUsed,
    u.profile,
    resolvedLimits.dataLimitBytes
  );

  if (isStateExpired || isCommentExpired || remainingTime.isExpired || remainingData.isExpired) {
    return 'expired';
  }

  const uName = String(u.name || '').toLowerCase().trim();
  let isOnline = false;
  if (activeList instanceof Set) {
    isOnline = activeList.has(uName);
  } else if (Array.isArray(activeList)) {
    isOnline = activeList.some((a) => {
      const aUser = String(a?.user || (a as any)?.name || (a as any)?.['user-id'] || '').toLowerCase().trim();
      return Boolean(aUser && uName && aUser === uName);
    });
  }

  if (isOnline) return 'online';

  const lastSeen = (u as any).lastSeen || (u as any).raw?.['last-seen'] || (u as any).raw?.lastLoggedOut || (u as any).lastLoggedOut;
  if (usedSec > 0 || trUsed > 0 || (lastSeen && lastSeen !== 'never')) {
    return 'idle';
  }

  return 'new';
}

export function formatDateTime(isoOrDateString?: string): string {
  if (!isoOrDateString) return '—';
  try {
    const parsed = parseMikrotikDateTime(isoOrDateString);
    if (!parsed) return isoOrDateString;
    return parsed.toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoOrDateString;
  }
}

/**
 * Parses creation/generation date of cards from comments
 */
export function parseCreationDateFromComment(comment?: string): string | undefined {
  if (!comment) return undefined;
  // Match YYYY-MM-DD HH:mm:ss or YYYY-MM-DD
  const matchYMD = comment.match(/(\d{4})[-/](\d{2})[-/](\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (matchYMD) {
    const [_, year, month, day, hour = '00', minute = '00', second = '00'] = matchYMD;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }
  // Match DD-MM-YYYY HH:mm:ss or DD-MM-YYYY
  const matchDMY = comment.match(/(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (matchDMY) {
    const [_, day, month, year, hour = '00', minute = '00', second = '00'] = matchDMY;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }
  return undefined;
}

/**
 * Parses any date format returned by MikroTik RouterOS (e.g. "sep/05/2026 14:32:05", "jan/01/2023", ISO, timestamps)
 */
export function parseMikrotikDateTime(dateVal: any): Date | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return dateVal;

  // If numeric timestamp
  if (typeof dateVal === 'number' && !isNaN(dateVal) && dateVal > 0) {
    // Check if seconds or milliseconds
    const ms = dateVal < 10000000000 ? dateVal * 1000 : dateVal;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const str = String(dateVal).trim();
  if (!str || str === '—' || str === 'none' || str === 'never' || str === '0') return null;

  try {
    // Match MikroTik RouterOS format: mmm/dd/yyyy hh:mm:ss or mmm/dd/yyyy
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const matchWithYear = str.match(/([a-z]{3})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/i);
    if (matchWithYear) {
      const [_, monthName, day, year, hour = '00', min = '00', sec = '00'] = matchWithYear;
      const monthNum = months[monthName.toLowerCase()];
      if (monthNum) {
        const d = new Date(`${year}-${monthNum}-${day.padStart(2, '0')}T${hour}:${min}:${sec}`);
        if (!isNaN(d.getTime())) return d;
      }
    }

    // Match MikroTik format without year (assumes current year): mmm/dd hh:mm:ss
    const matchWithoutYear = str.match(/([a-z]{3})\/(\d{1,2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/i);
    if (matchWithoutYear) {
      const [_, monthName, day, hour = '00', min = '00', sec = '00'] = matchWithoutYear;
      const monthNum = months[monthName.toLowerCase()];
      const currentYear = new Date().getFullYear();
      if (monthNum) {
        const d = new Date(`${currentYear}-${monthNum}-${day.padStart(2, '0')}T${hour}:${min}:${sec}`);
        if (!isNaN(d.getTime())) return d;
      }
    }

    // Try standard ISO or standard date parsing
    const standardDate = new Date(str);
    if (!isNaN(standardDate.getTime())) {
      return standardDate;
    }
  } catch {
    // Return null on error
  }

  return null;
}

/**
 * Formats duration in seconds to descriptive, elegant Arabic text
 */
export function formatElapsedArabic(totalSec: number): string {
  if (totalSec <= 0) return 'الآن';
  if (totalSec < 60) return `${totalSec} ثانية`;

  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    if (hours > 0) return `${days} يوم و ${hours} س`;
    return `${days} يوم`;
  }

  if (hours > 0) {
    if (minutes > 0) return `${hours} س و ${minutes} د`;
    return `${hours} ساعة`;
  }

  if (minutes < 5 && seconds > 0) {
    return `${minutes} د و ${seconds} ث`;
  }

  return `${minutes} دقيقة`;
}

// ==========================================
// CLIENT-SIDE DISCONNECT TIME PERSISTENCE
// Captures and preserves actual disconnect events
// when sessions close or are kicked by the admin.
// ==========================================
const DISCONNECT_STORAGE_KEY = 'mikrotik_subscribers_disconnect_map_v1';

export function getStoredDisconnectMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = safeStorage.getItem(DISCONNECT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function recordDisconnectTime(username: string, isoTimestamp?: string): void {
  if (typeof window === 'undefined' || !username) return;
  try {
    const key = String(username).toLowerCase().trim();
    if (!key) return;
    const map = getStoredDisconnectMap();
    map[key] = isoTimestamp || new Date().toISOString();
    // Maintain maximum 3000 entries to prevent memory bloat
    const keys = Object.keys(map);
    if (keys.length > 3000) {
      delete map[keys[0]];
    }
    safeStorage.setItem(DISCONNECT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredDisconnectTime(username: string): void {
  if (typeof window === 'undefined' || !username) return;
  try {
    const key = String(username).toLowerCase().trim();
    if (!key) return;
    const map = getStoredDisconnectMap();
    if (map[key]) {
      delete map[key];
      safeStorage.setItem(DISCONNECT_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore
  }
}

export function getStoredDisconnectTime(username: string): string | undefined {
  if (typeof window === 'undefined' || !username) return undefined;
  const map = getStoredDisconnectMap();
  return map[String(username).toLowerCase().trim()];
}

export interface SubscriberIdleInfo {
  idleSeconds: number;
  text: string;
  badgeType: 'active' | 'light_idle' | 'moderate_idle' | 'high_idle' | 'offline_recent' | 'offline_long' | 'never' | 'suspended' | 'expired';
  detail: string;
  isOnline: boolean;
  rawDuration: string;
}

/**
 * Calculates exact Idle Time (فترة الخمول) according to RouterOS specifications:
 * - When online: RouterOS reports the actual idle-time (inactivity without traffic).
 * - When offline: Measures the elapsed duration since the card was disconnected / last logged out.
 * - When never used: Reports "لم يُستخدم بعد".
 */
export function calculateSubscriberIdleInfo(
  itemOrRaw: any,
  statusOverride?: SubscriberStatus
): SubscriberIdleInfo {
  if (!itemOrRaw) {
    return {
      idleSeconds: 0,
      text: '—',
      badgeType: 'never',
      detail: 'لا توجد بيانات',
      isOnline: false,
      rawDuration: '0s'
    };
  }

  const raw = itemOrRaw.raw || itemOrRaw;
  const status: SubscriberStatus = statusOverride || itemOrRaw.status || (itemOrRaw.isOnline ? 'online' : 'idle');
  const isOnline = status === 'online';
  const isDisabled = Boolean(itemOrRaw.disabled || raw.disabled);

  // 1. If currently ONLINE: MikroTik RouterOS measures idle-time (duration without packet exchange)
  if (isOnline) {
    const rawIdleStr = String(raw['idle-time'] || raw.idleTime || itemOrRaw.idleTime || '0s');
    const idleSeconds = parseDurationToSeconds(rawIdleStr);

    if (idleSeconds <= 10) {
      return {
        idleSeconds,
        text: `${idleSeconds}ث (نشط)`,
        badgeType: 'active',
        detail: 'تبادل حزم بيانات مستمر ونشط حالياً',
        isOnline: true,
        rawDuration: rawIdleStr
      };
    }

    if (idleSeconds < 180) {
      return {
        idleSeconds,
        text: `${formatElapsedArabic(idleSeconds)} (خامل)`,
        badgeType: 'light_idle',
        detail: 'متصل ولكن لا يوجد نشاط تصفح نشط مؤخراً',
        isOnline: true,
        rawDuration: rawIdleStr
      };
    }

    return {
      idleSeconds,
      text: `${formatElapsedArabic(idleSeconds)} (خمول مرتفع)`,
      badgeType: 'high_idle',
      detail: 'الجلسة متصلة مع توقف طويل في حركة البيانات',
      isOnline: true,
      rawDuration: rawIdleStr
    };
  }

  // 2. If Suspended
  if (status === 'suspended' || isDisabled) {
    return {
      idleSeconds: 999999990,
      text: 'معلق',
      badgeType: 'suspended',
      detail: 'الحساب معطل يدوياً من قِبل إدارة الشبكة',
      isOnline: false,
      rawDuration: 'suspended'
    };
  }

  // 3. If Expired
  if (status === 'expired') {
    return {
      idleSeconds: 999999991,
      text: 'منتهي',
      badgeType: 'expired',
      detail: 'الحساب استنفد الحصة أو مدة الصلاحية المحددة',
      isOnline: false,
      rawDuration: 'expired'
    };
  }

  // 4. If Offline / Idle: compute elapsed time since disconnection while validity is intact
  const username = itemOrRaw.name || raw.name || raw.user || raw.username || '';
  const routerDisconnectStr =
    raw['last-logged-out'] ||
    raw.lastLoggedOut ||
    raw['last-seen'] ||
    raw.lastSeen ||
    raw.latestSession?.['to-time'] ||
    raw.latestSession?.toTime ||
    itemOrRaw.lastLoggedOut ||
    itemOrRaw.lastSeen;
  const storedDisconnectStr = getStoredDisconnectTime(username);
  let effectiveDisconnect = routerDisconnectStr || storedDisconnectStr;

  // Calculate remaining quota and time to verify validity has not expired
  const limitSec = parseDurationToSeconds(itemOrRaw.limitUptime || raw['limit-uptime']);
  const usedSec = parseDurationToSeconds(itemOrRaw.uptime || raw.uptime || '0s');
  const remainingSec = limitSec > 0 ? Math.max(0, limitSec - usedSec) : -1;

  const limitBytes = Number(itemOrRaw.limitBytesTotal || raw['limit-bytes-total'] || 0);
  const usedBytes = Number(itemOrRaw.bytesIn || raw['bytes-in'] || 0) + Number(itemOrRaw.bytesOut || raw['bytes-out'] || 0);
  const remainingBytes = limitBytes > 0 ? Math.max(0, limitBytes - usedBytes) : -1;

  // Check if brand new (never connected, uptime = 0, bytes = 0)
  if (status === 'new' || (usedSec === 0 && usedBytes === 0 && !routerDisconnectStr && !storedDisconnectStr)) {
    return {
      idleSeconds: 0,
      text: 'جديد (لم يتصل)',
      badgeType: 'never',
      detail: 'كرت غير مستخدم بعد، الصلاحية سارية بالكامل',
      isOnline: false,
      rawDuration: '0s'
    };
  }

  // If no disconnect time is recorded yet for a disconnected card that has traffic,
  // record one so the idle duration starts tracking accurately from this point
  if (!effectiveDisconnect && username) {
    effectiveDisconnect = new Date().toISOString();
    recordDisconnectTime(username, effectiveDisconnect);
  }

  const parsedDisconnectDate = parseMikrotikDateTime(effectiveDisconnect);

  let elapsedSec = 60;
  if (parsedDisconnectDate) {
    const diffMs = Date.now() - parsedDisconnectDate.getTime();
    if (diffMs > 0) {
      elapsedSec = Math.floor(diffMs / 1000);
    }
  }

  const isRecent = elapsedSec < 3600;
  const validityDetails = [];
  if (remainingSec > 0) validityDetails.push(`متبقي ${formatElapsedArabic(remainingSec)}`);
  else if (limitSec === 0) validityDetails.push('الوقت غير محدود');

  if (remainingBytes > 0) validityDetails.push(`متبقي ${formatBytes(remainingBytes)}`);
  else if (limitBytes === 0) validityDetails.push('البيانات غير محدودة');

  const validitySummary = validityDetails.length > 0 ? ` (الصلاحية: ${validityDetails.join(' | ')})` : '';

  return {
    idleSeconds: elapsedSec,
    text: `خامل منذ ${formatElapsedArabic(elapsedSec)}`,
    badgeType: isRecent ? 'offline_recent' : 'offline_long',
    detail: `انقطع الاتصال ولم تنتهِ الصلاحية${validitySummary}`,
    isOnline: false,
    rawDuration: `${elapsedSec}s`
  };
}

export interface SubscriberDisconnectInfo {
  isOnline: boolean;
  isNew: boolean;
  hasDisconnect: boolean;
  date: Date | null;
  timestamp: number;
  displayText: string;
  subText: string;
  tooltip: string;
  badgeClass: string;
}

/**
 * Calculates exact Disconnect Time (وقت قطع الاتصال):
 * - If online: Indicates active session ("متصل حالياً 🟢").
 * - If disconnected: Displays exact date, time, and relative duration.
 * - If new card: Displays "لم يتصل بعد".
 */
export function calculateSubscriberDisconnectInfo(
  itemOrRaw: any,
  statusOverride?: SubscriberStatus
): SubscriberDisconnectInfo {
  if (!itemOrRaw) {
    return {
      isOnline: false,
      isNew: false,
      hasDisconnect: false,
      date: null,
      timestamp: 0,
      displayText: '—',
      subText: '',
      tooltip: 'لا توجد بيانات',
      badgeClass: 'bg-slate-800/40 text-slate-400 border-slate-700/30'
    };
  }

  const raw = itemOrRaw.raw || itemOrRaw;
  const status: SubscriberStatus = statusOverride || itemOrRaw.status || (itemOrRaw.isOnline ? 'online' : 'idle');
  const isOnline = status === 'online';

  // 1. If Online
  if (isOnline) {
    return {
      isOnline: true,
      isNew: false,
      hasDisconnect: false,
      date: null,
      timestamp: Number.MAX_SAFE_INTEGER,
      displayText: 'متصل حالياً 🟢',
      subText: 'جلسة جارية',
      tooltip: 'المشترك متصل حالياً ولديه جلسة نشطة، لا يوجد وقت قطع اتصال',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 2. Lookup disconnect timestamp from MikroTik or local disconnect store
  const username = itemOrRaw.name || raw.name || raw.user || raw.username || '';
  const routerDisconnect =
    raw['last-logged-out'] ||
    raw.lastLoggedOut ||
    raw['last-seen'] ||
    raw.lastSeen ||
    raw.latestSession?.['to-time'] ||
    raw.latestSession?.toTime ||
    itemOrRaw.lastLoggedOut ||
    itemOrRaw.lastSeen;
  const storedDisconnect = getStoredDisconnectTime(username);
  let effectiveDisconnect = routerDisconnect || storedDisconnect;

  const parsedDate = parseMikrotikDateTime(effectiveDisconnect);

  if (parsedDate) {
    const diffSec = Math.max(0, Math.floor((Date.now() - parsedDate.getTime()) / 1000));
    return {
      isOnline: false,
      isNew: false,
      hasDisconnect: true,
      date: parsedDate,
      timestamp: parsedDate.getTime(),
      displayText: formatDateTime(parsedDate.toISOString()),
      subText: `منذ ${formatElapsedArabic(diffSec)}`,
      tooltip: `تاريخ وتوقيت آخر قطع اتصال: ${parsedDate.toLocaleString('ar-EG')}`,
      badgeClass: 'bg-slate-800/80 text-slate-200 border-slate-700/70'
    };
  }

  // 3. If new card (never used)
  const usedSec = parseDurationToSeconds(itemOrRaw.uptime || raw.uptime || '0s');
  const usedBytes = (Number(itemOrRaw.bytesIn || raw['bytes-in'] || 0) + Number(itemOrRaw.bytesOut || raw['bytes-out'] || 0));

  if (usedSec === 0 && usedBytes === 0) {
    return {
      isOnline: false,
      isNew: true,
      hasDisconnect: false,
      date: null,
      timestamp: 0,
      displayText: 'لم يتصل بعد',
      subText: 'كرت جديد',
      tooltip: 'المشترك جديد ولم يتم تسجيل دخوله أو قطع اتصاله حتى الآن',
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    };
  }

  // 4. Has history but router log was cleared
  return {
    isOnline: false,
    isNew: false,
    hasDisconnect: false,
    date: null,
    timestamp: 1,
    displayText: 'غير مسجل',
    subText: 'سجل قديم',
    tooltip: 'لا يتوفر توقيت قطع اتصال مسجل في سجلات الراوتر',
    badgeClass: 'bg-slate-800/40 text-slate-400 border-slate-700/30'
  };
}

/**
 * Backward-compatible helper for calculating idle duration
 */
export function calculateIdleDuration(raw: any, status?: SubscriberStatus): string {
  const info = calculateSubscriberIdleInfo(raw, status);
  return info.text;
}

/**
 * Formats speed / rate-limit string (e.g. "2M/8M" or "10M") to clear Arabic representation
 */
export function formatSpeedToArabic(speedStr?: string): string {
  if (!speedStr) return 'غير محدودة';
  const clean = String(speedStr).trim();
  if (!clean || clean === '0' || clean === '0/0' || clean.toLowerCase() === 'unlimited') {
    return 'غير محدودة';
  }
  if (clean.includes('/')) {
    const parts = clean.split('/');
    const up = parts[0].trim();
    const down = parts[1].trim();
    return `↑ ${up} | ↓ ${down}`;
  }
  return clean;
}

/**
 * Extracts profile name embedded inside router comments (e.g. "profile: 5M" or "باقة: 10 ميجا")
 */
export function parseProfileFromComment(comment?: string): string | undefined {
  if (!comment) return undefined;
  const match = String(comment).match(/(?:profile|بروفايل|باقة|خطة|البروفايل)\s*[:=]\s*([^|,\]]+)/i);
  if (match && match[1]) {
    const p = match[1].trim();
    if (p && p.toLowerCase() !== 'default') return p;
  }
  return undefined;
}


/**
 * Map Hotspot user data from RouterOS to SubscriberRowItem
 */
export function mapHotspotUserToRow(user: any, activeNames: Set<string>, profiles: any[]): SubscriberRowItem {
  const active = activeNames.has(String(user.name || '').toLowerCase());
  const profileObj = Array.isArray(profiles) ? profiles.find((p) => p.name === user.profile) : undefined;
  const status = getHotspotUserStatus(user, activeNames, profileObj);
  return {
    id: user['.id'] || user.id || user.name || `hs-${Math.random()}`,
    name: user.name || '',
    password: user.password || '',
    profile: user.profile || 'default',
    rateLimit: user['rate-limit'] || user.rateLimit,
    ipAddress: user.address,
    uptime: user.uptime || '0s',
    bytesIn: parseInt(user['bytes-in'] || user.bytesIn || '0', 10),
    bytesOut: parseInt(user['bytes-out'] || user.bytesOut || '0', 10),
    limitUptime: user['limit-uptime'] || user.limitUptime,
    limitBytesTotal: parseInt(user['limit-bytes-total'] || user.limitBytesTotal || '0', 10) || undefined,
    comment: user.comment,
    disabled: user.disabled === 'true' || user.disabled === true,
    macAddress: user['mac-address'] || user.macAddress,
    callerId: user['caller-id'] || user.callerId,
    hostName: user['host-name'] || user.hostName,
    createdAt: user['creation-time'] || user.createdAt || user['last-logged-in'],
    status,
    lastLoggedOut: user['last-logged-out'] || user.lastLoggedOut,
    raw: user,
  };
}
