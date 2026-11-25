export interface AuditEntry {
  userId?: string;
  action: 'CREATE_PROFILE' | 'UPDATE_PROFILE' | 'DELETE_PROFILE' | string;
  serviceType: 'hotspot' | 'pppoe' | 'userman' | string;
  profileName: string;
  timestamp: Date | string;
  details?: Record<string, any>;
}

const localAuditLogs: AuditEntry[] = [];

export const auditLog = {
  async insert(entry: AuditEntry): Promise<void> {
    const formatted: AuditEntry = {
      userId: entry.userId || 'admin',
      action: entry.action,
      serviceType: entry.serviceType,
      profileName: entry.profileName,
      timestamp: new Date().toISOString(),
      details: entry.details || {}
    };

    localAuditLogs.unshift(formatted);
    if (localAuditLogs.length > 500) {
      localAuditLogs.pop();
    }
  },

  getRecentLogs(limit = 50): AuditEntry[] {
    return localAuditLogs.slice(0, limit);
  }
};
