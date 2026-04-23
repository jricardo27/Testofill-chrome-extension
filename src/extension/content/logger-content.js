/**
 * Shared logger utility for the Testofill extension (Content Script version).
 * Respects the 'debugMode' setting in the extension configuration.
 */

(function() {
  let isDebug = false;

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

  window.testofillLogger = {
    log: (...args) => isDebug && console.log(...args),
    warn: (...args) => isDebug && console.warn(...args),
    debug: (...args) => isDebug && console.debug(...args),
    info: (...args) => isDebug && console.info(...args),
    error: (...args) => console.error(...args),
  };
})();
