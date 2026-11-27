import { MikrotikAPI, type MikrotikClient } from '../mikrotik-api';
import { appLogger } from '../services/logger';
import {
  executeProfileMutation,
  getUsermanEndpoints,
  isProtectedDefaultProfileName
} from './profileSanitizer';

export interface RouterConnectionConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  timeout?: number;
}

export class RouterOSExecutor {
  private client: MikrotikClient;

  constructor(clientInstance?: MikrotikClient) {
    this.client = clientInstance || MikrotikAPI;
  }

  async connect(): Promise<void> {
    if (!this.client.isConnected()) {
      if (typeof (this.client as any).ensureConnected === 'function') {
        await (this.client as any).ensureConnected();
      } else {
        throw new Error('الراوتر غير متصل، يرجى تسجيل الدخول أولاً');
      }
    }
  }

  async disconnect(): Promise<void> {
    // Keep connection pool alive or disconnect if standalone client
  }

  // ═══ Hotspot Profile Operations ═══
  async addHotspotProfile(data: Record<string, string>): Promise<void> {
    await this.connect();
    const params: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (key === 'comment') continue; // /ip/hotspot/user/profile has no comment attribute
      if (val !== undefined && val !== null && val !== '') {
        params.push(`=${key}=${val}`);
      }
    }
    await executeProfileMutation(this.client, '/ip/hotspot/user/profile/add', params, [
      'transparent-proxy', 'insert-queue-before', 'queue-type', 'parent-queue', 'open-status-page',
      'status-autorefresh', 'mac-cookie-timeout', 'keepalive-timeout', 'idle-timeout', 'session-timeout',
      'address-pool', 'incoming-filter', 'outgoing-filter', 'address-list', 'on-logout', 'on-login'
    ]);
  }

  async updateHotspotProfile(oldName: string, data: Record<string, string>): Promise<void> {
    await this.connect();
    let found = await this.client.querySafe('/ip/hotspot/user/profile/print', [`?name=${oldName}`]);
    if (!Array.isArray(found) || !found.length) {
      const all = await this.client.querySafe('/ip/hotspot/user/profile/print');
      if (Array.isArray(all)) {
        found = all.filter((p: any) => p.name === oldName || p['.id'] === oldName || p.id === oldName);
      }
    }
    if (!Array.isArray(found) || !found.length) {
      throw new Error(`البروفايل (${oldName}) غير موجود على الراوتر`);
    }
    const id = found[0]['.id'] || found[0].id || oldName;
    const params: string[] = [`=.id=${id}`];
    for (const [key, val] of Object.entries(data)) {
      if (key === 'comment') continue;
      if (val !== undefined && val !== null) {
        params.push(`=${key}=${val}`);
      }
    }
    await executeProfileMutation(this.client, '/ip/hotspot/user/profile/set', params, [
      'transparent-proxy', 'insert-queue-before', 'queue-type', 'parent-queue', 'open-status-page',
      'status-autorefresh', 'mac-cookie-timeout', 'keepalive-timeout', 'idle-timeout', 'session-timeout',
      'address-pool', 'incoming-filter', 'outgoing-filter', 'address-list', 'on-logout', 'on-login'
    ]);
  }

  async deleteHotspotProfile(name: string): Promise<void> {
    await this.connect();
    if (isProtectedDefaultProfileName(name)) {
      throw new Error('لا يمكن حذف البروفايل الافتراضي (default)');
    }
    let found = await this.client.querySafe('/ip/hotspot/user/profile/print', [`?name=${name}`]);
    if (!Array.isArray(found) || !found.length) {
      const all = await this.client.querySafe('/ip/hotspot/user/profile/print');
      if (Array.isArray(all)) {
        found = all.filter((p: any) => p.name === name || p['.id'] === name || p.id === name);
      }
    }
    if (!Array.isArray(found) || !found.length) {
      throw new Error(`البروفايل (${name}) غير موجود على الراوتر`);
    }
    if (isProtectedDefaultProfileName(found[0].name)) {
      throw new Error('لا يمكن حذف البروفايل الافتراضي (default)');
    }
    const id = found[0]['.id'] || found[0].id;
    await this.client.query('/ip/hotspot/user/profile/remove', [`=.id=${id}`], { priority: true });
  }

  async listHotspotProfiles(): Promise<Record<string, any>[]> {
    await this.connect();
    return await this.client.querySafe('/ip/hotspot/user/profile/print');
  }

  // ═══ PPP Profile Operations ═══
  async addPppProfile(data: Record<string, string>): Promise<void> {
    await this.connect();
    const params: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && val !== null) {
        params.push(`=${key}=${val}`);
      }
    }
    await this.client.query('/ppp/profile/add', params);
  }

  async updatePppProfile(oldName: string, data: Record<string, string>): Promise<void> {
    await this.connect();
    let found = await this.client.querySafe('/ppp/profile/print', [`?name=${oldName}`]);
    if (!Array.isArray(found) || !found.length) {
      const all = await this.client.querySafe('/ppp/profile/print');
      if (Array.isArray(all)) {
        found = all.filter((p: any) => p.name === oldName || p['.id'] === oldName || p.id === oldName);
      }
    }
    if (!Array.isArray(found) || !found.length) {
      throw new Error(`البروفايل (${oldName}) غير موجود على الراوتر`);
    }
    const id = found[0]['.id'] || found[0].id || oldName;
    const params: string[] = [`=.id=${id}`];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && val !== null) {
        params.push(`=${key}=${val}`);
      }
    }
    await this.client.query('/ppp/profile/set', params);
  }

  async deletePppProfile(name: string): Promise<void> {
    await this.connect();
    if (isProtectedDefaultProfileName(name)) {
      throw new Error('لا يمكن حذف البروفايل الافتراضي (default)');
    }
    let found = await this.client.querySafe('/ppp/profile/print', [`?name=${name}`]);
    if (!Array.isArray(found) || !found.length) {
      const all = await this.client.querySafe('/ppp/profile/print');
      if (Array.isArray(all)) {
        found = all.filter((p: any) => p.name === name || p['.id'] === name || p.id === name);
      }
    }
    if (!Array.isArray(found) || !found.length) {
      throw new Error(`البروفايل (${name}) غير موجود على الراوتر`);
    }
    if (isProtectedDefaultProfileName(found[0].name)) {
      throw new Error('لا يمكن حذف البروفايل الافتراضي (default)');
    }
    const id = found[0]['.id'] || found[0].id;
    await this.client.query('/ppp/profile/remove', [`=.id=${id}`], { priority: true });
  }

  async listPppProfiles(): Promise<Record<string, any>[]> {
    await this.connect();
    return await this.client.querySafe('/ppp/profile/print');
  }

  // ═══ Userman Profile + Limitation Operations ═══
  async addUsermanProfileWithLimitation(
    profile: Record<string, string>,
    limitation: Record<string, string>,
    link: Record<string, string>
  ): Promise<void> {
    await this.connect();
    const isV6 = this.client.isV6 ? this.client.isV6() : false;
    const um = getUsermanEndpoints(isV6);

    // 1. Limitation
    const limParams: string[] = [];
    for (const [k, v] of Object.entries(limitation)) {
      if (!isV6 && k === 'owner') continue;
      if (v !== undefined && v !== null && v !== '') limParams.push(`=${k}=${v}`);
    }
    try {
      await executeProfileMutation(this.client, `${um.limitation}/add`, limParams, ['owner', 'rate-limit-min-rx', 'rate-limit-min-tx']);
    } catch {
      // If limitation already exists, continue
    }

    // 2. Profile
    const profParams: string[] = [];
    for (const [k, v] of Object.entries(profile)) {
      if (!isV6 && (k === 'owner' || k === 'comment')) continue;
      if (v !== undefined && v !== null && v !== '') profParams.push(`=${k}=${v}`);
    }
    await executeProfileMutation(this.client, `${um.profile}/add`, profParams, ['owner', 'comment', 'starts-when', 'starts-at', 'override-shared-users']);

    // 3. Link Profile & Limitation
    const linkParams: string[] = [];
    for (const [k, v] of Object.entries(link)) {
      if (v !== undefined && v !== null && v !== '') linkParams.push(`=${k}=${v}`);
    }
    try {
      await executeProfileMutation(this.client, `${um.profileLimitation}/add`, linkParams, ['weekdays', 'from-time', 'till-time']);
    } catch {
      // Ignore duplicate link errors
    }
  }

  async updateUsermanProfile(
    oldName: string,
    profile: Record<string, string>,
    limitation: Record<string, string>,
    link: Record<string, string>
  ): Promise<void> {
    await this.connect();
    const isV6 = this.client.isV6 ? this.client.isV6() : false;
    const um = getUsermanEndpoints(isV6);

    // 1. Locate existing profile
    let found = await this.client.querySafe(`${um.profile}/print`, [`?name=${oldName}`]);
    if (!Array.isArray(found) || !found.length) {
      const all = await this.client.querySafe(`${um.profile}/print`);
      if (Array.isArray(all)) {
        found = all.filter((p: any) => p.name === oldName || p['.id'] === oldName || p.id === oldName);
      }
    }
    if (!Array.isArray(found) || !found.length) {
      throw new Error(`بروفايل اليوزر مانجر (${oldName}) غير موجود على الراوتر`);
    }
    const profId = found[0]['.id'] || found[0].id || oldName;

    // 2. Update profile in-place
    const profParams: string[] = [`=.id=${profId}`];
    for (const [k, v] of Object.entries(profile)) {
      if (!isV6 && (k === 'owner' || k === 'comment' || k === 'override-shared-users')) continue;
      if (v !== undefined && v !== null && v !== '') {
        profParams.push(`=${k}=${v}`);
      }
    }
    await executeProfileMutation(this.client, `${um.profile}/set`, profParams, [
      'owner',
      'comment',
      'starts-when',
      'starts-at',
      'override-shared-users',
      'name-for-users',
      'price',
      'validity',
    ]);

    // 3. Update or Add Limitation
    const limName = limitation.name || `Lim-${profile.name || oldName}`;
    const limParams: string[] = [];
    for (const [k, v] of Object.entries(limitation)) {
      if (!isV6 && k === 'owner') continue;
      if (v !== undefined && v !== null && v !== '') {
        limParams.push(`=${k}=${v}`);
      }
    }

    const foundLim = await this.client.querySafe(`${um.limitation}/print`, [`?name=${limName}`]);
    if (Array.isArray(foundLim) && foundLim.length > 0 && (foundLim[0]['.id'] || foundLim[0].id)) {
      const limId = foundLim[0]['.id'] || foundLim[0].id;
      try {
        await executeProfileMutation(this.client, `${um.limitation}/set`, [`=.id=${limId}`, ...limParams], [
          'owner',
          'rate-limit-min-rx',
          'rate-limit-min-tx',
          'uptime-limit',
          'transfer-limit',
          'download-limit',
          'upload-limit',
        ]);
      } catch {
        // Ignore set error if field unchanged
      }
    } else {
      try {
        await executeProfileMutation(this.client, `${um.limitation}/add`, limParams, [
          'owner',
          'rate-limit-min-rx',
          'rate-limit-min-tx',
          'uptime-limit',
          'transfer-limit',
          'download-limit',
          'upload-limit',
        ]);
      } catch {
        // Continue
      }
    }

    // 4. Update or Add Profile-Limitation Link
    const newProfName = profile.name || oldName;
    const existingLinks = await this.client.querySafe(`${um.profileLimitation}/print`, [`?profile=${newProfName}`]);
    let linkFound = false;
    if (Array.isArray(existingLinks) && existingLinks.length > 0) {
      for (const el of existingLinks) {
        if (el.limitation === limName || existingLinks.length === 1) {
          linkFound = true;
          const linkId = el['.id'] || el.id;
          const updateLinkParams: string[] = [`=.id=${linkId}`];
          if (link['from-time']) updateLinkParams.push(`=from-time=${link['from-time']}`);
          if (link['till-time']) updateLinkParams.push(`=till-time=${link['till-time']}`);
          if (link['weekdays']) updateLinkParams.push(`=weekdays=${link['weekdays']}`);
          if (updateLinkParams.length > 1) {
            try {
              await executeProfileMutation(this.client, `${um.profileLimitation}/set`, updateLinkParams, [
                'weekdays',
                'from-time',
                'till-time',
              ]);
            } catch (err) {
              appLogger.warn('RouterOSExecutor', 'Failed updating userman profile-limitation link', { oldName, linkId, err: String(err) });
            }
          }
          break;
        }
      }
    }

    if (!linkFound) {
      const linkParams: string[] = [];
      const linkData = { ...link, profile: newProfName, limitation: limName };
      for (const [k, v] of Object.entries(linkData)) {
        if (v !== undefined && v !== null && v !== '') linkParams.push(`=${k}=${v}`);
      }
      try {
        await executeProfileMutation(this.client, `${um.profileLimitation}/add`, linkParams, [
          'weekdays',
          'from-time',
          'till-time',
        ]);
      } catch (err) {
        appLogger.warn('RouterOSExecutor', 'Failed adding userman profile-limitation link', { newProfName, limName, err: String(err) });
      }
    }
  }

  async deleteUsermanProfile(name: string): Promise<void> {
    await this.connect();
    const isV6 = this.client.isV6 ? this.client.isV6() : false;
    const um = getUsermanEndpoints(isV6);

    let found = await this.client.querySafe(`${um.profile}/print`, [`?name=${name}`]);
    if (!Array.isArray(found) || !found.length) {
      const all = await this.client.querySafe(`${um.profile}/print`);
      if (Array.isArray(all)) {
        found = all.filter((p: any) => p.name === name || p['.id'] === name || p.id === name);
      }
    }
    if (!Array.isArray(found) || !found.length) {
      throw new Error(`بروفايل اليوزر مانجر (${name}) غير موجود على الراوتر`);
    }

    const actualName = found[0].name || name;

    // 1. Remove profile-limitation links
    const links = await this.client.querySafe(`${um.profileLimitation}/print`, [`?profile=${actualName}`]);
    if (Array.isArray(links)) {
      for (const link of links) {
        if (link['.id']) {
          try {
            await this.client.query(`${um.profileLimitation}/remove`, [`=.id=${link['.id']}`]);
          } catch (err) {
            appLogger.warn('RouterOSExecutor', 'Failed removing userman profile-limitation link', { name: actualName, linkId: link['.id'], err: String(err) });
          }
        }
      }
    }

    // 2. Remove profile
    const id = found[0]['.id'] || found[0].id;
    await this.client.query(`${um.profile}/remove`, [`=.id=${id}`]);

    // 3. Clean associated default limitation if not used elsewhere
    try {
      const limName = `Lim-${actualName}`;
      const otherLinks = await this.client.querySafe(`${um.profileLimitation}/print`, [`?limitation=${limName}`]);
      if (!Array.isArray(otherLinks) || otherLinks.length === 0) {
        const foundLim = await this.client.querySafe(`${um.limitation}/print`, [`?name=${limName}`]);
        if (Array.isArray(foundLim) && foundLim.length > 0 && foundLim[0]['.id']) {
          await this.client.query(`${um.limitation}/remove`, [`=.id=${foundLim[0]['.id']}`]);
        }
      }
    } catch (err) {
      appLogger.warn('RouterOSExecutor', 'Failed cleaning orphaned userman limitation', { name: actualName, err: String(err) });
    }
  }

  async listUsermanProfiles(): Promise<Record<string, any>[]> {
    await this.connect();
    const isV6 = this.client.isV6 ? this.client.isV6() : false;
    const um = getUsermanEndpoints(isV6);
    return await this.client.querySafe(`${um.profile}/print`);
  }

  // ═══ Generic API Execution for ChangeEngine ═══
  async writeRaw(
    menu: string,
    action: string,
    params?: Record<string, string | number | boolean>,
    proplist?: string[]
  ): Promise<any> {
    await this.connect();
    const commandPath = `${menu.startsWith('/') ? '' : '/'}${menu}/${action}`;
    const queryArgs: string[] = [];

    if (proplist && proplist.length > 0) {
      queryArgs.push(`.proplist=${proplist.join(',')}`);
    }

    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null) {
          queryArgs.push(`=${key}=${val}`);
        }
      }
    }

    return await this.client.query(commandPath, queryArgs);
  }

  // ═══ Health Check ═══
  async getHealth(): Promise<{ cpuLoad: number; freeMemory: number; boardName?: string; version?: string }> {
    await this.connect();
    const resources = await this.client.querySafe('/system/resource/print');
    const r = (Array.isArray(resources) && resources[0]) ? resources[0] : {};
    return {
      cpuLoad: parseInt(r['cpu-load'] || '0', 10),
      freeMemory: parseInt(r['free-memory'] || '0', 10),
      boardName: r['board-name'] || r['platform'] || 'RouterBOARD',
      version: r['version'] || 'v7.x',
    };
  }
}
