// ============================================================
// قاعدة بيانات OUI شاملة لتحديد ماركات ومصنعي نقاط الوصول
// OUI Database - Comprehensive Vendor & Handler mapping
// ============================================================

export interface OuiEntry {
  prefix: string;
  vendor: string;
  handler: 'ubiquiti' | 'tplink' | 'ruijie' | 'generic';
}

export const OUI_DB: OuiEntry[] = [
  // === Ubiquiti Networks (UniFi, airMAX, EdgeMAX) ===
  { prefix: '00156D', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '002722', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '0418D6', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '18E829', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '24A43C', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '44D9E7', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '60E327', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '687251', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '70A741', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '7483C2', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '788A20', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '802AA8', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: '94F665', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'A4C84E', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'AC8B03', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'B4FBE4', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'DC9FDB', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'E063DA', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'F09FC2', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'F492BF', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },
  { prefix: 'FCECDA', vendor: 'Ubiquiti Networks', handler: 'ubiquiti' },

  // === TP-Link (Omada, Pharos, Archer, Deco) ===
  { prefix: '000A3A', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '14CC20', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '18D6C7', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '1C3BF3', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '20DC2E', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '30DE4B', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '3C46D8', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '446E2E', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '503EAA', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '50D4F7', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '54AF97', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '54E6FC', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '60A44C', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '60E327', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '6C5AB0', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '704F57', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '7405A5', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '74EA3A', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '8416F9', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '84D81B', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '90F652', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '984827', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: '98DA42', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'A0F3C1', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'AC84C6', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'B0487A', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'B09575', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'B0BE76', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'C025E9', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'C46E1F', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'C83A35', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'D46E0E', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'D807B6', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'D84732', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'E4C32A', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'EC086B', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'F4EC38', vendor: 'TP-Link', handler: 'tplink' },
  { prefix: 'F4F26D', vendor: 'TP-Link', handler: 'tplink' },

  // === Ruijie / Reyee Networks ===
  { prefix: '00D0F8', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '047502', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '14144B', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '18828C', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '286ED4', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '300D43', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '407A80', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '44783E', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '58696C', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '605B85', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '7408F6', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '78D38D', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '84248D', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '883FC1', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '942C97', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: '9C52F8', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: 'B48C9D', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: 'C81FE7', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: 'D4619D', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: 'DC0856', vendor: 'Ruijie Networks', handler: 'ruijie' },
  { prefix: 'F01898', vendor: 'Ruijie Networks', handler: 'ruijie' },

  // === MikroTik (RouterBOARD, cAP, wAP, LHG, SXT) ===
  { prefix: '000C42', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '001175', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '2CC81B', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '48A98A', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '4C5E0C', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '4C60DE', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '64D154', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '744D28', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '788F67', vendor: 'MikroTik', handler: 'generic' },
  { prefix: '7C7356', vendor: 'MikroTik', handler: 'generic' },
  { prefix: 'B869F4', vendor: 'MikroTik', handler: 'generic' },
  { prefix: 'CC2DE0', vendor: 'MikroTik', handler: 'generic' },
  { prefix: 'D4CA6D', vendor: 'MikroTik', handler: 'generic' },
  { prefix: 'E0F847', vendor: 'MikroTik', handler: 'generic' },
  { prefix: 'E48D8C', vendor: 'MikroTik', handler: 'generic' },
  { prefix: 'F0E114', vendor: 'MikroTik', handler: 'generic' },

  // === Cambium Networks (ePMP, cnPilot) ===
  { prefix: '000456', vendor: 'Cambium Networks', handler: 'generic' },
  { prefix: '58C17A', vendor: 'Cambium Networks', handler: 'generic' },
  { prefix: '0015E8', vendor: 'Cambium Networks', handler: 'generic' },
  { prefix: '002167', vendor: 'Cambium Networks', handler: 'generic' },
  { prefix: '18536C', vendor: 'Cambium Networks', handler: 'generic' },
  { prefix: 'BC14EF', vendor: 'Cambium Networks', handler: 'generic' },
  { prefix: 'DC7E65', vendor: 'Cambium Networks', handler: 'generic' },

  // === Cisco Systems & Cisco Meraki ===
  { prefix: '00000C', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000142', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000143', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000163', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000164', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000196', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000197', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000216', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000217', vendor: 'Cisco', handler: 'generic' },
  { prefix: '00024A', vendor: 'Cisco', handler: 'generic' },
  { prefix: '00024B', vendor: 'Cisco', handler: 'generic' },
  { prefix: '00027D', vendor: 'Cisco', handler: 'generic' },
  { prefix: '00027E', vendor: 'Cisco', handler: 'generic' },
  { prefix: '0002B9', vendor: 'Cisco', handler: 'generic' },
  { prefix: '0002BA', vendor: 'Cisco', handler: 'generic' },
  { prefix: '0002FC', vendor: 'Cisco', handler: 'generic' },
  { prefix: '0002FD', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000331', vendor: 'Cisco', handler: 'generic' },
  { prefix: '000332', vendor: 'Cisco', handler: 'generic' },
  { prefix: '00036B', vendor: 'Cisco', handler: 'generic' },
  { prefix: '00036C', vendor: 'Cisco', handler: 'generic' },
  { prefix: '00180A', vendor: 'Cisco Meraki', handler: 'generic' },
  { prefix: 'E0553D', vendor: 'Cisco Meraki', handler: 'generic' },
  { prefix: 'AC1702', vendor: 'Cisco Meraki', handler: 'generic' },

  // === Aruba Networks / HPE ===
  { prefix: '000B86', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '001A1E', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '20A6CD', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '24DE85', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '40E3D6', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '6C9C4E', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '706979', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '84D47E', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: '94F4F6', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: 'ACF2C5', vendor: 'Aruba Networks', handler: 'generic' },
  { prefix: 'D8C7C8', vendor: 'Aruba Networks', handler: 'generic' },

  // === Huawei Technologies ===
  { prefix: '001882', vendor: 'Huawei', handler: 'generic' },
  { prefix: '001E10', vendor: 'Huawei', handler: 'generic' },
  { prefix: '00259E', vendor: 'Huawei', handler: 'generic' },
  { prefix: '0425C5', vendor: 'Huawei', handler: 'generic' },
  { prefix: '0819A6', vendor: 'Huawei', handler: 'generic' },
  { prefix: '104780', vendor: 'Huawei', handler: 'generic' },
  { prefix: '202BC1', vendor: 'Huawei', handler: 'generic' },
  { prefix: '286EDB', vendor: 'Huawei', handler: 'generic' },
  { prefix: '308730', vendor: 'Huawei', handler: 'generic' },
  { prefix: '407D0F', vendor: 'Huawei', handler: 'generic' },
  { prefix: '4846FB', vendor: 'Huawei', handler: 'generic' },
  { prefix: '548998', vendor: 'Huawei', handler: 'generic' },
  { prefix: '5C7D5E', vendor: 'Huawei', handler: 'generic' },
  { prefix: '707B96', vendor: 'Huawei', handler: 'generic' },
  { prefix: '781DBA', vendor: 'Huawei', handler: 'generic' },
  { prefix: '80B686', vendor: 'Huawei', handler: 'generic' },
  { prefix: '888603', vendor: 'Huawei', handler: 'generic' },
  { prefix: 'AC853D', vendor: 'Huawei', handler: 'generic' },
  { prefix: 'D05BCE', vendor: 'Huawei', handler: 'generic' },
  { prefix: 'E0247F', vendor: 'Huawei', handler: 'generic' },
  { prefix: 'E468A3', vendor: 'Huawei', handler: 'generic' },

  // === ZTE ===
  { prefix: '107B44', vendor: 'ZTE', handler: 'generic' },
  { prefix: '18706E', vendor: 'ZTE', handler: 'generic' },
  { prefix: '20687B', vendor: 'ZTE', handler: 'generic' },
  { prefix: '382C4A', vendor: 'ZTE', handler: 'generic' },
  { prefix: '4C11BF', vendor: 'ZTE', handler: 'generic' },
  { prefix: '5CAAFD', vendor: 'ZTE', handler: 'generic' },
  { prefix: '64821E', vendor: 'ZTE', handler: 'generic' },
  { prefix: '7469A5', vendor: 'ZTE', handler: 'generic' },
  { prefix: '8C1597', vendor: 'ZTE', handler: 'generic' },
  { prefix: 'A8BA28', vendor: 'ZTE', handler: 'generic' },
  { prefix: 'B0A5D7', vendor: 'ZTE', handler: 'generic' },
  { prefix: 'C8032F', vendor: 'ZTE', handler: 'generic' },
  { prefix: 'D871D9', vendor: 'ZTE', handler: 'generic' },
  { prefix: 'E8E71B', vendor: 'ZTE', handler: 'generic' },

  // === D-Link ===
  { prefix: '1CAFA2', vendor: 'D-Link', handler: 'generic' },
  { prefix: '2405F5', vendor: 'D-Link', handler: 'generic' },
  { prefix: '34E2FD', vendor: 'D-Link', handler: 'generic' },
  { prefix: '5C7D5E', vendor: 'D-Link', handler: 'generic' },
  { prefix: '6477A0', vendor: 'D-Link', handler: 'generic' },
  { prefix: '7854E0', vendor: 'D-Link', handler: 'generic' },
  { prefix: '8C3BAD', vendor: 'D-Link', handler: 'generic' },
  { prefix: 'A0F3C1', vendor: 'D-Link', handler: 'generic' },
  { prefix: 'B0C54D', vendor: 'D-Link', handler: 'generic' },
  { prefix: 'C0A0FB', vendor: 'D-Link', handler: 'generic' },
  { prefix: 'E0CB4E', vendor: 'D-Link', handler: 'generic' },
  { prefix: 'F8E4E3', vendor: 'D-Link', handler: 'generic' },

  // === Netgear ===
  { prefix: '008EF2', vendor: 'Netgear', handler: 'generic' },
  { prefix: '10804F', vendor: 'Netgear', handler: 'generic' },
  { prefix: '24B2DE', vendor: 'Netgear', handler: 'generic' },
  { prefix: '3C808F', vendor: 'Netgear', handler: 'generic' },
  { prefix: '6038E0', vendor: 'Netgear', handler: 'generic' },
  { prefix: '7CD1C3', vendor: 'Netgear', handler: 'generic' },
  { prefix: '9072CF', vendor: 'Netgear', handler: 'generic' },
  { prefix: 'A42B8C', vendor: 'Netgear', handler: 'generic' },
  { prefix: 'C43DC7', vendor: 'Netgear', handler: 'generic' },
  { prefix: 'E091F5', vendor: 'Netgear', handler: 'generic' },
  { prefix: 'F8C8A4', vendor: 'Netgear', handler: 'generic' },

  // === Tenda ===
  { prefix: '00B00C', vendor: 'Tenda', handler: 'generic' },
  { prefix: '502B73', vendor: 'Tenda', handler: 'generic' },
  { prefix: 'C83A35', vendor: 'Tenda', handler: 'generic' },
  { prefix: 'CC3429', vendor: 'Tenda', handler: 'generic' },

  // === ASUS ===
  { prefix: '0015F2', vendor: 'ASUS', handler: 'generic' },
  { prefix: '08606E', vendor: 'ASUS', handler: 'generic' },
  { prefix: '107B44', vendor: 'ASUS', handler: 'generic' },
  { prefix: '1C872C', vendor: 'ASUS', handler: 'generic' },
  { prefix: '2C4D54', vendor: 'ASUS', handler: 'generic' },
  { prefix: '382C4A', vendor: 'ASUS', handler: 'generic' },
  { prefix: '6045CB', vendor: 'ASUS', handler: 'generic' }
];

// بناء فهرس سريع عند الاستيراد
const ouiMap = new Map<string, OuiEntry>();
for (const entry of OUI_DB) {
  ouiMap.set(entry.prefix, entry);
}

export interface OuiLookupResult {
  vendor: string;
  handler: 'ubiquiti' | 'tplink' | 'ruijie' | 'generic';
}

/** استنتاج الماركة والـ Handler المناسب من عنوان MAC */
export function lookupOui(mac: string): OuiLookupResult {
  if (!mac || typeof mac !== 'string') {
    return { vendor: 'Unknown', handler: 'generic' };
  }
  const prefix = mac.replace(/[:\-\.]/g, '').substring(0, 6).toUpperCase();
  const entry = ouiMap.get(prefix);
  if (entry) return { vendor: entry.vendor, handler: entry.handler };
  return { vendor: 'Unknown', handler: 'generic' };
}

/** هل هذا الـ MAC يخص MikroTik؟ */
export function isMikroTikMac(mac: string): boolean {
  if (!mac || typeof mac !== 'string') return false;
  const prefix = mac.replace(/[:\-\.]/g, '').substring(0, 6).toUpperCase();
  const mtPrefixes = [
    '000C42',
    '001175',
    '2CC81B',
    '48A98A',
    '4C5E0C',
    '4C60DE',
    '64D154',
    '744D28',
    '788F67',
    '7C7356',
    'B869F4',
    'CC2DE0',
    'D4CA6D',
    'E0F847',
    'E48D8C',
    'F0E114'
  ];
  return mtPrefixes.includes(prefix);
}
