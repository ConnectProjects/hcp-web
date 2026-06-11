/**
 * shared/time-utils.js
 * Reliable time handling for medical records.
 */

let clockOffset = 0; // Difference in milliseconds

export const TimeService = {
  /**
   * Syncs local clock with a network time server.
   * Call this on app boot.
   */
  async sync() {
    try {
      // Fetch from a reliable public time API
      const response = await fetch('https://worldtimeapi.org/api/ip');
      const data = await response.json();
      const networkTime = new Date(data.datetime).getTime();
      const localTime = Date.now();
      
      clockOffset = networkTime - localTime;
      console.log(`🕒 Time synced. Offset: ${clockOffset}ms`);
    } catch (e) {
      console.warn("🕒 Could not sync time with network. Using system clock.");
    }
  },

  /**
   * Returns a Date object corrected by the network offset.
   */
  now() {
    return new Date(Date.now() + clockOffset);
  },

  /**
   * Returns a full timestamp with timezone offset: 2026-06-11T10:48:00-07:00
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
   * Returns the timezone name (e.g. "America/Vancouver")
   */
  getTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
};