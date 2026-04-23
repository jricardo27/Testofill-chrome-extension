/**
 * Shared logger utility for the Testofill extension.
 * Respects the 'debugMode' setting in the extension configuration.
 */

let isDebug = false;

// Function to update internal isDebug state from rules object
function updateDebugState(rules) {
  isDebug = !!(rules && rules.options && rules.options.debugMode);
}

// Initial state load
chrome.storage.local.get('testofill.rules', (items) => {
  updateDebugState(items['testofill.rules']);
});

// Watch for configuration changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes['testofill.rules']) {
    updateDebugState(changes['testofill.rules'].newValue);
  }
});

/**
 * Logger object providing methods for different log levels.
 * Only prints if debugMode is enabled (except for errors).
 */
export const logger = {
  log: (...args) => isDebug && console.log(...args),
  warn: (...args) => isDebug && console.warn(...args),
  debug: (...args) => isDebug && console.debug(...args),
  info: (...args) => isDebug && console.info(...args),
  error: (...args) => console.error(...args), // Errors always log
};
