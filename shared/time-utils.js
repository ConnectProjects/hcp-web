/**
 * shared/time-utils.js
 * Reliable time handling for medical records.
 */

let clockOffset = 0; 

export const TimeService = {
  /**
   * Syncs local clock with the server header.
   */
  async sync() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(window.location.href, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      const serverDateStr = response.headers.get('date');
      if (serverDateStr) {
        const networkTime = new Date(serverDateStr).getTime();
        clockOffset = networkTime - Date.now();
        console.log(`🕒 Time synced. Offset: ${clockOffset}ms`);
      }
    } catch (e) {
      console.warn("🕒 Time sync failed, using system clock.");
    }
  },

  /**
   * Returns a Date object corrected by the network offset.
   */
  now() {
    return new Date(Date.now() + clockOffset);
  },

  /**
   * Returns a full ISO timestamp with timezone offset.
   */
  getTimestamp() {
    const d = this.now();
    const tzo = -d.getTimezoneOffset();
    const dif = tzo >= 0 ? '+' : '-';
    const pad = (num) => String(Math.floor(Math.abs(num))).padStart(2, '0');
    
    return d.getFullYear() +
      '-' + pad(d.getMonth() + 1) +
      '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) +
      ':' + pad(d.getMinutes()) +
      ':' + pad(d.getSeconds()) +
      dif + pad(tzo / 60) +
      ':' + pad(tzo % 60);
  },

  /**
   * Formats the ISO string for the UI: "Jun 11, 01:28 PM"
   */
  formatNice(isoString) {
    if (!isoString) return "—";
    try {
        const d = new Date(isoString);
        return d.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    } catch (e) {
        return isoString;
    }
  },

  getTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
};