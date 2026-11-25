export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatBps(bps: number): string {
  if (!bps || bps === 0) return '0 bps';
  if (bps >= 1000000000) {
    return (bps / 1000000000).toFixed(2) + ' Gbps';
  }
  if (bps >= 1000000) {
    return (bps / 1000000).toFixed(2) + ' Mbps';
  }
  if (bps >= 1000) {
    return (bps / 1000).toFixed(1) + ' Kbps';
  }
  return bps + ' bps';
}

export function formatRateLimit(rateLimit?: string): string {
  if (!rateLimit || rateLimit.trim() === '' || rateLimit === '0' || rateLimit === '0/0' || rateLimit === 'unlimited' || rateLimit === 'none') {
    return 'غير محدد (مفتوح)';
  }

  const parts = rateLimit.trim().split(/\s+/);
  const mainLimit = parts[0];

  if (mainLimit.includes('/')) {
    const [rx, tx] = mainLimit.split('/');
    const cleanRx = formatSpeedString(rx);
    const cleanTx = formatSpeedString(tx);
    return `الرفع: ${cleanRx} | التنزيل: ${cleanTx}`;
  } else {
    return `السرعة: ${formatSpeedString(mainLimit)}`;
  }
}

function formatSpeedString(val: string): string {
  if (!val || val === '0') return 'مفتوح';
  const num = parseInt(val, 10);
  if (isNaN(num)) return val;
  const lower = val.toLowerCase();
  if (lower.endsWith('m')) return `${num} Mbps`;
  if (lower.endsWith('k')) return `${num} Kbps`;
  if (lower.endsWith('g')) return `${num} Gbps`;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)} Mbps`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)} Kbps`;
  return `${num} bps`;
}

export function exportUsersToCsv(users: any[], filename = 'mikrotik_hotspot_users.csv') {
  const headers = ['اسم المستخدم (Username)', 'كلمة المرور (Password)', 'البروفايل (Profile)', 'تحديد الوقت (Uptime Limit)', 'تحديد البيانات (Quota Limit)', 'الملاحظات (Comment)', 'السعر (Price)', 'الحالة (Status)', 'تاريخ الإنشاء'];
  
  const rows = users.map(u => [
    `"${u.name || ''}"`,
    `"${u.password || ''}"`,
    `"${u.profile || ''}"`,
    `"${u.limitUptime || 'غير محدد'}"`,
    `"${u.limitBytesTotal ? formatBytes(u.limitBytesTotal) : 'غير محدد'}"`,
    `"${(u.comment || '').replace(/"/g, '""')}"`,
    `"${u.price || 0}"`,
    `"${u.disabled ? 'معطل' : 'مفعل'}"`,
    `"${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-EG') : ''}"`
  ]);

  downloadCsv(headers, rows, filename);
}

export function exportActiveSessionsToCsv(sessions: any[], filename = 'mikrotik_active_sessions.csv') {
  const headers = ['المستخدم (User)', 'عنوان IP', 'عنوان MAC', 'مدة الاتصال (Uptime)', 'التحميل (Bytes In)', 'الرفع (Bytes Out)', 'طريقة المصادقة (Login By)'];
  const rows = sessions.map(s => [
    `"${s.user || ''}"`,
    `"${s.address || ''}"`,
    `"${s.macAddress || ''}"`,
    `"${s.uptime || ''}"`,
    `"${formatBytes(s.bytesIn || 0)}"`,
    `"${formatBytes(s.bytesOut || 0)}"`,
    `"${s.loginBy || ''}"`
  ]);
  downloadCsv(headers, rows, filename);
}

export function exportIpBindingsToCsv(bindings: any[], filename = 'mikrotik_ip_bindings.csv') {
  const headers = ['نوع الاستثناء (Type)', 'عنوان MAC', 'عنوان IP', 'السيرفر', 'الملاحظات (Comment)'];
  const rows = bindings.map(b => [
    `"${b.type || ''}"`,
    `"${b.macAddress || ''}"`,
    `"${b.address || ''}"`,
    `"${b.server || 'all'}"`,
    `"${(b.comment || '').replace(/"/g, '""')}"`
  ]);
  downloadCsv(headers, rows, filename);
}

export function exportDhcpLeasesToCsv(leases: any[], filename = 'mikrotik_dhcp_leases.csv') {
  const headers = ['عنوان IP', 'عنوان MAC', 'اسم الجهاز (Host Name)', 'نوع الحجز (Status)', 'الوقت المتبقي', 'الملاحظات'];
  const rows = leases.map(l => [
    `"${l.address || ''}"`,
    `"${l.macAddress || ''}"`,
    `"${l.hostName || ''}"`,
    `"${l.isDynamic ? 'ديناميكي (Dynamic)' : 'ثابت (Static)'}"`,
    `"${l.expiresAfter || ''}"`,
    `"${(l.comment || '').replace(/"/g, '""')}"`
  ]);
  downloadCsv(headers, rows, filename);
}

export function exportQueuesToCsv(queues: any[], filename = 'mikrotik_simple_queues.csv') {
  const headers = ['الاسم (Name)', 'الهدف (Target IP)', 'أقصى سرعة (Max Limit)', 'السرعة المضمونة (Limit At)', 'الأولوية (Priority)', 'الحالة (Disabled)'];
  const rows = queues.map(q => [
    `"${q.name || ''}"`,
    `"${q.target || ''}"`,
    `"${q.maxLimit || ''}"`,
    `"${q.limitAt || ''}"`,
    `"${q.priority || ''}"`,
    `"${q.disabled ? 'معطل' : 'مفعل'}"`
  ]);
  downloadCsv(headers, rows, filename);
}

export function exportLogsToCsv(logs: any[], filename = 'mikrotik_system_logs.csv') {
  const headers = ['الوقت (Time)', 'التصنيف (Topics)', 'الخطورة (Severity)', 'الرسالة (Message)'];
  const rows = logs.map(l => [
    `"${l.time || ''}"`,
    `"${l.topics || ''}"`,
    `"${l.severity || ''}"`,
    `"${(l.message || '').replace(/"/g, '""')}"`
  ]);
  downloadCsv(headers, rows, filename);
}

export function exportScheduledTasksToCsv(tasks: any[], filename = 'mikrotik_scheduled_tasks.csv') {
  const headers = ['اسم المهمة (Name)', 'وقت البدء (Start Time)', 'تاريخ البدء (Start Date)', 'التكرار (Interval)', 'الحالة (Status)', 'الأمر المنفذ (On Event)', 'مرات التشغيل (Run Count)', 'الملاحظات (Comment)'];
  const rows = tasks.map(t => [
    `"${(t.name || '').replace(/"/g, '""')}"`,
    `"${t.startTime || ''}"`,
    `"${t.startDate || ''}"`,
    `"${t.interval || ''}"`,
    `"${t.disabled ? 'معطل' : 'نشط'}"`,
    `"${(t.onEvent || '').replace(/"/g, '""')}"`,
    `"${t.runCount ?? 0}"`,
    `"${(t.comment || '').replace(/"/g, '""')}"`
  ]);
  downloadCsv(headers, rows, filename);
}

function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}


export interface ParsedDuration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isUnlimited: boolean;
  raw: string;
}

/**
 * Parse any MikroTik duration string or numeric days into structured units
 */
export function parseMikrotikDuration(duration: string | number | undefined | null): ParsedDuration {
  if (duration === undefined || duration === null || duration === '') {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isUnlimited: true, raw: '' };
  }

  // If number passed directly (e.g. legacy validityDays = 30)
  if (typeof duration === 'number') {
    if (duration <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isUnlimited: true, raw: '0s' };
    }
    return {
      days: duration,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: duration * 86400,
      isUnlimited: false,
      raw: `${duration}d`
    };
  }

  const raw = String(duration).trim();
  const lower = raw.toLowerCase();

  if (
    lower === '0' ||
    lower === '0s' ||
    lower === '00:00:00' ||
    lower === 'none' ||
    lower === 'unlimited' ||
    lower === 'مفتوح' ||
    lower === 'غير محدد'
  ) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isUnlimited: true, raw };
  }

  let days = 0;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  // 1. Check for compound week format (e.g. 1w, 2w3d)
  const weekMatch = lower.match(/(\d+)\s*w/);
  if (weekMatch) {
    days += parseInt(weekMatch[1], 10) * 7;
  }

  // 2. Check for days format (e.g. 30d, 1d)
  const dayMatch = lower.match(/(\d+)\s*d/);
  if (dayMatch) {
    days += parseInt(dayMatch[1], 10);
  }

  // 3. Check for hours format with letter (e.g. 12h)
  const hourMatch = lower.match(/(\d+)\s*h/);
  if (hourMatch) {
    hours += parseInt(hourMatch[1], 10);
  }

  // 4. Check for minutes format with letter (e.g. 30m)
  const minMatch = lower.match(/(\d+)\s*m(?!s)/);
  if (minMatch) {
    minutes += parseInt(minMatch[1], 10);
  }

  // 5. Check for seconds format with letter (e.g. 45s)
  const secMatch = lower.match(/(\d+)\s*s/);
  if (secMatch) {
    seconds += parseInt(secMatch[1], 10);
  }

  // 6. Check for standard clock format HH:MM:SS or HH:MM (e.g. "02:30:00" or "1d 02:30:00")
  const clockMatch = lower.match(/(?:(?:(\d+)d\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?)/);
  if (clockMatch) {
    if (clockMatch[1] && !dayMatch) {
      days = parseInt(clockMatch[1], 10);
    }
    if (!hourMatch) hours = parseInt(clockMatch[2], 10);
    if (!minMatch) minutes = parseInt(clockMatch[3], 10);
    if (clockMatch[4] && !secMatch) seconds = parseInt(clockMatch[4], 10);
  }

  // 7. Check if pure integer string without units (e.g. "30") -> interpret as days
  if (!weekMatch && !dayMatch && !hourMatch && !minMatch && !secMatch && !clockMatch) {
    const pureNum = parseInt(raw, 10);
    if (!isNaN(pureNum) && pureNum > 0) {
      days = pureNum;
    }
  }

  const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  const isUnlimited = totalSeconds <= 0;

  return {
    days,
    hours,
    minutes,
    seconds,
    totalSeconds,
    isUnlimited,
    raw
  };
}

/**
 * Build a canonical MikroTik duration string from components
 */
export function buildMikrotikDuration(parts: {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}): string {
  const d = Math.max(0, Math.floor(parts.days || 0));
  const h = Math.max(0, Math.floor(parts.hours || 0));
  const m = Math.max(0, Math.floor(parts.minutes || 0));
  const s = Math.max(0, Math.floor(parts.seconds || 0));

  if (d === 0 && h === 0 && m === 0 && s === 0) {
    return '0s';
  }

  // Single unit clean forms
  if (d > 0 && h === 0 && m === 0 && s === 0) {
    return `${d}d`;
  }
  if (d === 0 && h > 0 && m === 0 && s === 0) {
    return `${h}h`;
  }
  if (d === 0 && h === 0 && m > 0 && s === 0) {
    return `${m}m`;
  }
  if (d === 0 && h === 0 && m === 0 && s > 0) {
    return `${s}s`;
  }

  // Composite format
  const segments: string[] = [];
  if (d > 0) segments.push(`${d}d`);
  if (h > 0 || d > 0) {
    const padH = d > 0 ? String(h).padStart(2, '0') : `${h}h`;
    const padM = String(m).padStart(2, '0');
    const padS = String(s).padStart(2, '0');

    if (d > 0) {
      segments.push(`${padH}:${padM}:${padS}`);
    } else {
      if (s > 0) {
        segments.push(`${padH}:${padM}:${padS}`);
      } else if (m > 0) {
        segments.push(`${h}h ${m}m`);
      } else {
        segments.push(`${h}h`);
      }
    }
  } else if (m > 0) {
    if (s > 0) {
      segments.push(`${m}m ${s}s`);
    } else {
      segments.push(`${m}m`);
    }
  } else if (s > 0) {
    segments.push(`${s}s`);
  }

  return segments.join(' ').trim();
}

/**
 * Format any MikroTik duration into natural, human-readable Arabic
 */
export function formatDurationArabic(duration: string | number | undefined | null): string {
  const parsed = parseMikrotikDuration(duration);
  if (parsed.isUnlimited) {
    return 'غير محدد (مفتوح)';
  }

  const { days, hours, minutes, seconds } = parsed;
  const parts: string[] = [];

  if (days > 0) {
    if (days === 1) parts.push('1 يوم');
    else if (days === 2) parts.push('يومان');
    else if (days >= 3 && days <= 10) parts.push(`${days} أيام`);
    else parts.push(`${days} يوماً`);
  }

  if (hours > 0) {
    if (hours === 1) parts.push('ساعة واحدة');
    else if (hours === 2) parts.push('ساعتان');
    else if (hours >= 3 && hours <= 10) parts.push(`${hours} ساعات`);
    else parts.push(`${hours} ساعة`);
  }

  if (minutes > 0) {
    if (minutes === 1) parts.push('دقيقة واحدة');
    else if (minutes === 2) parts.push('دقيقتان');
    else if (minutes >= 3 && minutes <= 10) parts.push(`${minutes} دقائق`);
    else parts.push(`${minutes} دقيقة`);
  }

  if (seconds > 0) {
    if (seconds === 1) parts.push('ثانية واحدة');
    else if (seconds === 2) parts.push('ثانيتان');
    else if (seconds >= 3 && seconds <= 10) parts.push(`${seconds} ثوانٍ`);
    else parts.push(`${seconds} ثانية`);
  }

  if (parts.length === 0) return 'غير محدد (مفتوح)';
  return parts.join(' و ');
}

