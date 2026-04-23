import { logger } from "./logger.js";

/* Get the rules and try to apply them to this page, if matched */
export async function findMatchingRules(currentUrl) {
  const items = await chrome.storage.local.get('testofill.rules');
  checkLastError();

  var rules = items['testofill.rules'] || {};

  // Return early if no rules
  if (!rules.forms) return [];

  var matches = [];

  // Automatic Environment Detection
  let detectedContext = {};
  if (rules.environments) {
    for (const envGroup in rules.environments) {
      const envs = rules.environments[envGroup];
      for (const countryCode in envs) {
        const urlPrefix = envs[countryCode];
        // Simple prefix match. Can be enhanced to regex if needed.
        if (currentUrl.startsWith(urlPrefix)) {
          detectedContext.country = countryCode.toUpperCase(); // Normalize to 'US', 'AU'
          break;
        }
      }
      if (detectedContext.country) break;
    }
  }

  // New schema: forms is an object where keys are names and values have urlPattern
  for (var formName in rules.forms) {
    if (rules.forms.hasOwnProperty(formName)) {
      var formDef = rules.forms[formName];

      // Support old schema (array of rules for a url regex key)
      if (Array.isArray(formDef)) {
        if (currentUrl.match(new RegExp(formName))) {
          // Clone to avoid mutating storage object reference if cached
          const matchWithContext = formDef.map(rule => ({ ...rule, context: { ...detectedContext } }));
          matches = matches.concat(matchWithContext);
        }
      }
      // New schema: object with urlPattern
      else if (formDef.urlPattern) {
        if (currentUrl.match(new RegExp(formDef.urlPattern))) {
          // Clone to avoid mutating storage object reference if cached
          const match = {
            ...formDef,
            name: formName,
            context: { ...detectedContext }
          };
          matches.push(match);
        }
      }
    }
  }

  return matches;
}

export async function getFullRules() {
  const items = await chrome.storage.local.get('testofill.rules');
  checkLastError();
  return items['testofill.rules'] || {};
}

function checkLastError() {
  if (typeof chrome.runtime.lastError !== "undefined") {
    logger.error("ERROR Rules Store: Loading failed", chrome.runtime.lastError);
    throw new Error(`ERROR Rules Store: Loading failed: ${chrome.runtime.lastError}`);
  }
}


export async function saveRulesToStorage(rules) {
  await chrome.storage.local.set({ 'testofill.rules': rules });
  if (typeof chrome.runtime.lastError === "undefined") {
    return true;
  } else {
    // F.ex. due to {message: "QUOTA_BYTES_PER_ITEM quota exceeded"} // 4kB
    var error = chrome.runtime.lastError.message + " when trying to save " +
      JSON.stringify(rules).length + 'testofill.rules'.length + " B";
    logger.error("FAILED to store rules due to %s; rules: ",
      error,
      rules);
    throw new Error(error);
  }
}
