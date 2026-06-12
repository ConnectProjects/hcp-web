/**
 * theme.js
 * Handles brand color persistence and application.
 */

export const DEFAULT_COLOR = '#76B214'; // Connect Hearing Green

/**
 * Applies a hex color to the CSS variables in the document root.
 */
export function applyTheme(color) {
  const hex = color || DEFAULT_COLOR;
  document.documentElement.style.setProperty('--navy-mid', hex);
  document.documentElement.style.setProperty('--navy',     hex);
  
  // Update theme-color meta tag for mobile browsers
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
}

/**
 * Loads the saved theme color from localStorage.
 */
export function loadThemeColor() {
  return localStorage.getItem('hcp_theme_color') || DEFAULT_COLOR;
}

/**
 * Saves a new theme color and applies it.
 */
export function saveThemeColor(color) {
  localStorage.setItem('hcp_theme_color', color);
  applyTheme(color);
}

/**
 * Legacy support for older boot sequences.
 */
export async function loadAndApplyTheme() {
  const color = loadThemeColor();
  applyTheme(color);
}