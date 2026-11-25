import { safeStorage } from '../utils/safeStorage';

export const discoveryService = {
  /**
   * Updates the API URL for remote or local connection.
   */
  async updateServerUrl(url: string): Promise<void> {
    try {
      safeStorage.setItem('zahir_api_url', url);
    } catch (error) {
      console.error('Failed to update server URL', error);
    }
  },

  /**
   * Discovers the cached or stored server URL.
   */
  async discoverServerUrl(): Promise<string | null> {
    try {
      const url = safeStorage.getItem('zahir_api_url');
      if (url && url.trim()) {
        return url.trim();
      }
    } catch (error) {
      console.error('Failed to discover server URL', error);
    }
    return null;
  }
};

