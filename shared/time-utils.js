/**
 * shared/time-utils.js
 * Reliable time handling for medical records.
 */

let clockOffset = 0; // Difference in milliseconds

export const TimeService = {
  // ... existing sync, now, and getTimestamp functions ...

  /**
   * Turns 2026-06-11T09:49:57-07:00 into "Jun 11, 09:49 AM"
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
        return isoString; // Fallback to raw if it fails
    }
  },

  getTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
};