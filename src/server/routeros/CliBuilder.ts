import { cleanDnsOrIpList, normalizeRateLimitString, parseRateToBpsString } from './profileSanitizer';

export class CliBuilder {
  // ═══ Hotspot Profile Payload ═══
  static buildHotspotProfilePayload(form: any): Record<string, string> {
    const p: Record<string, string> = { name: String(form.name || '').trim() };

    if (form.addressPool !== undefined) {
      if (form.addressPool === 'none' || form.addressPool === '' || (form.changeAddressPool && !form.addressPool)) {
        p['address-pool'] = 'none';
      } else if (form.addressPool !== 'unchanged') {
        p['address-pool'] = form.addressPool;
      }
    }

    if (form.rateLimit !== undefined) p['rate-limit'] = form.rateLimit;
    if (form.sharedUsers !== undefined) p['shared-users'] = String(form.sharedUsers);
    if (form.idleTimeout !== undefined) p['idle-timeout'] = form.idleTimeout === 'none' ? 'none' : (form.idleTimeout || 'none');
    if (form.keepaliveTimeout !== undefined) p['keepalive-timeout'] = form.keepaliveTimeout === 'none' ? 'none' : (form.keepaliveTimeout || 'none');
    if (form.sessionTimeout !== undefined) p['session-timeout'] = form.sessionTimeout === 'none' ? 'none' : (form.sessionTimeout || 'none');
    if (form.macCookieTimeout !== undefined) p['mac-cookie-timeout'] = form.macCookieTimeout === 'none' ? 'none' : (form.macCookieTimeout || 'none');
    if (form.statusAutorefresh !== undefined) p['status-autorefresh'] = form.statusAutorefresh || '00:01:00';
    if (form.openStatusPage !== undefined) p['open-status-page'] = form.openStatusPage;
    if (form.transparentProxy !== undefined) p['transparent-proxy'] = form.transparentProxy ? 'yes' : 'no';

    if (form.parentQueue !== undefined) {
      p['parent-queue'] = (form.parentQueue && form.parentQueue !== 'none' && form.parentQueue !== 'default') ? form.parentQueue : 'none';
    }
    if (form.queueType !== undefined) {
      p['queue-type'] = (form.queueType && form.queueType !== 'none' && form.queueType !== 'default') ? form.queueType : 'default';
    }
    if (form.insertQueueBefore && form.insertQueueBefore !== 'none' && form.insertQueueBefore !== 'default' && form.insertQueueBefore !== 'first') {
      p['insert-queue-before'] = form.insertQueueBefore;
    }

    if (form.incomingFilter && form.incomingFilter !== 'none') {
      p['incoming-filter'] = form.incomingFilter;
    }
    if (form.outgoingFilter && form.outgoingFilter !== 'none') {
      p['outgoing-filter'] = form.outgoingFilter;
    }
    if (form.addressList && form.addressList !== 'none') {
      p['address-list'] = form.addressList;
    }
    if (form.incomingPacketMark) p['incoming-packet-mark'] = form.incomingPacketMark;
    if (form.outgoingPacketMark) p['outgoing-packet-mark'] = form.outgoingPacketMark;
    if (form.server && form.server !== 'all') p['server'] = form.server;

    if (form.advertise) {
      p['advertise'] = 'yes';
      if (form.advertiseUrl) p['advertise-url'] = form.advertiseUrl;
      if (form.advertiseInterval) p['advertise-interval'] = form.advertiseInterval;
      if (form.advertiseTimeout) p['advertise-timeout'] = form.advertiseTimeout;
    }

    let userScript = form.onLoginScript || "";
    userScript = userScript
      .replace(/^# ZCtrl\|Price:[^\n]*\n?/gm, '')
      .replace(/:local userVal "\$user";\s*:local validityVal "[^"]+";[^\n]*/g, '')
      .trim();

    const priceVal = form.price !== undefined ? (Number(form.price) || 0) : 0;
    const quotaVal = form.dataQuotaMb !== undefined ? (Number(form.dataQuotaMb) || 0) : 0;
    const validityStr = (form.validity || (form.validityDays ? `${form.validityDays}d` : '')).trim();
    const effStartsAt = form.startsAt === 'at-creation' ? 'at-creation' : 'first-login';
    const effectiveSu = form.sharedUsers !== undefined ? (Number(form.sharedUsers) || 1) : 1;

    const metaHeader = `# ZCtrl|Price:${priceVal}|Validity:${validityStr || 'unlimited'}|DataQuotaMb:${quotaVal}|StartsAt:${effStartsAt}|SharedUsers:${effectiveSu}`;
    // NOTE: /ip/hotspot/user/profile does NOT support 'comment' on RouterOS v6/v7 — metadata lives in 'on-login'.
    p['on-login'] = userScript ? `${metaHeader}\n${userScript}`.trim() : metaHeader;
    if (form.onLogoutScript) p['on-logout'] = form.onLogoutScript;

    return p;
  }

  // ═══ PPP Profile Payload ═══
  static buildPppProfilePayload(form: any): Record<string, string> {
    const p: Record<string, string> = { name: String(form.name || '').trim() };

    if (form.localAddress !== undefined) {
      p['local-address'] = (form.localAddress && form.localAddress !== 'none') ? form.localAddress : '';
    }
    if (form.remoteAddress !== undefined && form.remoteAddress !== 'unchanged') {
      p['remote-address'] = (form.remoteAddress && form.remoteAddress !== 'none') ? form.remoteAddress : '';
    }
    if (form.remoteIpv6PrefixPool !== undefined) {
      p['remote-ipv6-prefix-pool'] = (form.remoteIpv6PrefixPool && form.remoteIpv6PrefixPool !== 'none') ? form.remoteIpv6PrefixPool : 'none';
    }
    if (form.dhcpv6PdPool !== undefined) {
      p['dhcpv6-pd-pool'] = (form.dhcpv6PdPool && form.dhcpv6PdPool !== 'none') ? form.dhcpv6PdPool : 'none';
    }
    if (form.bridge !== undefined) {
      p['bridge'] = (form.bridge && form.bridge !== 'none' && form.bridge !== 'default') ? form.bridge : 'none';
    }
    if (form.bridgeHorizon !== undefined) {
      p['bridge-horizon'] = form.bridgeHorizon ? String(form.bridgeHorizon) : '';
    }
    if (form.rateLimit !== undefined) p['rate-limit'] = normalizeRateLimitString(form.rateLimit);

    const effectiveOnlyOne = form.onlyOne === 'default' ? 'no' : (form.onlyOne || (form.sharedUsers > 1 ? 'no' : 'yes'));
    p['only-one'] = effectiveOnlyOne;

    if (form.useIpv6 && form.useIpv6 !== 'default') p['use-ipv6'] = form.useIpv6;
    if (form.useMpls && form.useMpls !== 'default') p['use-mpls'] = form.useMpls;
    if (form.useCompression && form.useCompression !== 'default') p['use-compression'] = form.useCompression;
    if (form.useEncryption && form.useEncryption !== 'default') p['use-encryption'] = form.useEncryption;
    if (form.sessionTimeout && form.sessionTimeout !== 'none' && form.sessionTimeout !== '00:00:00' && form.sessionTimeout !== '0s') {
      p['session-timeout'] = form.sessionTimeout;
    }
    if (form.idleTimeout && form.idleTimeout !== 'none' && form.idleTimeout !== '00:00:00' && form.idleTimeout !== '0s') {
      p['idle-timeout'] = form.idleTimeout;
    }

    if (form.parentQueue !== undefined) {
      p['parent-queue'] = (form.parentQueue && form.parentQueue !== 'none' && form.parentQueue !== 'default') ? form.parentQueue : 'none';
    }
    if (form.queueType !== undefined) {
      p['queue-type'] = (form.queueType && form.queueType !== 'none' && form.queueType !== 'default') ? form.queueType : 'default';
    }
    if (form.insertQueueBefore && form.insertQueueBefore !== 'none' && form.insertQueueBefore !== 'default' && form.insertQueueBefore !== 'first') {
      p['insert-queue-before'] = form.insertQueueBefore;
    }
    if (form.dnsServer !== undefined) {
      const cleanedDns = cleanDnsOrIpList(form.dnsServer);
      if (cleanedDns) p['dns-server'] = cleanedDns;
    }
    if (form.winsServer !== undefined) {
      const cleanedWins = cleanDnsOrIpList(form.winsServer);
      if (cleanedWins) p['wins-server'] = cleanedWins;
    }
    if (form.addressList !== undefined) {
      p['address-list'] = (form.addressList && form.addressList !== 'none') ? form.addressList : '';
    }

    let userScript = form.onUpScript || "";
    userScript = userScript.replace(/^# ZCtrl\|Price:[^\n]*\n?/gm, '').trim();

    const priceVal = form.price !== undefined ? Number(form.price) : 0;
    const quotaVal = form.dataQuotaMb !== undefined ? Number(form.dataQuotaMb) : 0;
    const validityStr = (form.validity || (form.validityDays ? `${form.validityDays}d` : '')).trim();
    const effStartsAt = form.startsAt === 'at-creation' ? 'at-creation' : 'first-login';
    const effectiveSu = form.sharedUsers !== undefined ? Number(form.sharedUsers) : (effectiveOnlyOne === 'no' ? 2 : 1);

    const metaHeader = `# ZCtrl|Price:${priceVal}|Validity:${validityStr || 'unlimited'}|DataQuotaMb:${quotaVal}|StartsAt:${effStartsAt}|SharedUsers:${effectiveSu}`;
    p['comment'] = metaHeader;
    p['on-up'] = userScript ? `${metaHeader}\n${userScript}`.trim() : metaHeader;
    if (form.onDownScript !== undefined) p['on-down'] = form.onDownScript || '';

    return p;
  }

  // ═══ Userman Profile + Limitation Payload ═══
  static buildUsermanPayloads(form: any, isV6: boolean = false): {
    profile: Record<string, string>;
    limitation: Record<string, string>;
    link: Record<string, string>;
  } {
    const profName = String(form.name || '').trim();
    const limName = form.limitationName || `Lim-${profName}`;

    const limitation: Record<string, string> = {
      name: limName
    };
    if (isV6) {
      limitation['owner'] = form.owner || 'admin';
    }

    if (form.rateLimit) {
      const baseRate = String(form.rateLimit).trim().split(/\s+/)[0] || '';
      const parts = baseRate.split('/');
      const rawRx = parts[0] || '';
      const rawTx = parts[1] || parts[0] || '';
      if (isV6) {
        if (rawRx) limitation['rate-limit-rx'] = rawRx;
        if (rawTx) limitation['rate-limit-tx'] = rawTx;
      } else {
        const bpsRx = parseRateToBpsString(rawRx);
        const bpsTx = parseRateToBpsString(rawTx);
        if (bpsRx && bpsRx !== '0') limitation['rate-limit-rx'] = bpsRx;
        if (bpsTx && bpsTx !== '0') limitation['rate-limit-tx'] = bpsTx;
      }
    }
    if (form.rateLimitMin) {
      const baseMinRate = String(form.rateLimitMin).trim().split(/\s+/)[0] || '';
      const parts = baseMinRate.split('/');
      const rawMinRx = parts[0] || '';
      const rawMinTx = parts[1] || parts[0] || '';
      if (isV6) {
        if (rawMinRx) limitation['rate-limit-min-rx'] = rawMinRx;
        if (rawMinTx) limitation['rate-limit-min-tx'] = rawMinTx;
      } else {
        const bpsMinRx = parseRateToBpsString(rawMinRx);
        const bpsMinTx = parseRateToBpsString(rawMinTx);
        if (bpsMinRx && bpsMinRx !== '0') limitation['rate-limit-min-rx'] = bpsMinRx;
        if (bpsMinTx && bpsMinTx !== '0') limitation['rate-limit-min-tx'] = bpsMinTx;
      }
    }

    // 0 = unlimited (do not send field)
    const transferMb = Number(form.transferLimitMb || form.transferLimit) || 0;
    if (transferMb > 0) limitation['transfer-limit'] = String(transferMb * 1024 * 1024);

    const downloadMb = Number(form.downloadLimitMb || form.downloadLimit) || 0;
    if (downloadMb > 0) limitation['download-limit'] = String(downloadMb * 1024 * 1024);

    const uploadMb = Number(form.uploadLimitMb || form.uploadLimit) || 0;
    if (uploadMb > 0) limitation['upload-limit'] = String(uploadMb * 1024 * 1024);

    if (form.uptimeLimit && form.uptimeLimit !== '0s') limitation['uptime-limit'] = form.uptimeLimit;
    if (form.resetCounters && form.resetCounters !== 'none') limitation['reset-counters-interval'] = form.resetCounters;
    if (form.rateLimitBurstRx) limitation['rate-limit-burst-rx'] = form.rateLimitBurstRx;
    if (form.rateLimitBurstTx) limitation['rate-limit-burst-tx'] = form.rateLimitBurstTx;

    const profile: Record<string, string> = {
      name: profName,
      'name-for-users': form.nameForUsers || profName,
      price: String(Number(form.price) || 0)
    };

    if (isV6) {
      profile['owner'] = form.owner || 'admin';
      profile['starts-at'] = (form.startsAt === 'now' || form.startsAt === 'at-creation') ? 'create-and-activate' : 'logon';
      profile['override-shared-users'] = String(Number(form.overrideSharedUsers || form.sharedUsers) || 1);
    } else {
      profile['starts-when'] = (form.startsAt === 'now' || form.startsAt === 'at-creation') ? 'assigned' : 'first-auth';
      profile['override-shared-users'] = String(Number(form.overrideSharedUsers || form.sharedUsers) || 1);
    }

    if (form.validity && form.validity !== '0s' && form.validity !== 'none') {
      profile['validity'] = form.validity;
    } else {
      profile['validity'] = 'unlimited';
    }

    const WEEKDAY_ORDER = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const weekdaysArr = Array.isArray(form.weekdays) ? form.weekdays : (typeof form.weekdays === 'string' ? form.weekdays.split(',') : []);
    const orderedWeekdays = WEEKDAY_ORDER.filter(d => weekdaysArr.includes(d));

    const link: Record<string, string> = {
      profile: profName,
      limitation: limName
    };

    if (form.fromTime) link['from-time'] = form.fromTime;
    if (form.tillTime) link['till-time'] = form.tillTime;
    if (orderedWeekdays.length > 0) link['weekdays'] = orderedWeekdays.join(',');
    if (form.dateStart) link['date-start'] = form.dateStart;
    if (form.dateEnd) link['date-end'] = form.dateEnd;

    return { profile, limitation, link };
  }
}
