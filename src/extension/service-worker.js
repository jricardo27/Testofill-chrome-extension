/** 
 * An environment that lives independent of any other window or tab,
 * which can observe and act in response to events. In particular, it
 * handles browsing and extension events and invoke the content script
 * (testofill-run.js).
 * BEWARE: It is transient, the browser can kill and re-create it at any time.
 */

import * as rs from "./shared/rules-store.js";
import * as integr from "./shared/integration.js";
import { addPermissionToggle } from './lib/bundled-npm-deps.js';
import { logger } from "./shared/logger.js";

// Add 'Enable Testofill... on this domain' to the extension's ctx menu
addPermissionToggle();

//---------------------------------------------------------------- workflow state
let activeWorkflow = null; // { name: string, steps: string[], currentStepIndex: number, tabId: number }

//---------------------------------------------------------------- reusable: ruleSets, content, storage
/* Get the rules and try to apply them to this page, if matched */
async function findMatchingRules(currentUrl, ruleSetsCallback, _callIfNone) {
  rs.findMatchingRules(currentUrl).then(ruleSetsCallback);
}

// Helper to get full rules (for workflows)
async function getFullRules() {
  return rs.getFullRules();
}

let postponedMsg = null;

function sendMessageToContentScript(tab, messageId, payload, responseCallback) {
  integr.sendMessageToContentScript(tab, messageId, payload)
    .then(x => { if (responseCallback) responseCallback(x); })
    // Most likely failed b/c the content script is not listening b/c we
    // lack permissions for this domain, and have asked the user to grant them.
    // If granted then the content script gets loaded and notifies us => retry.
    .catch(err => postponedMsg = { tab, messageId, payload, responseCallback });
}

/**
 * @param rules {object} the full rules JSON object to save
 * @param rules {fn} function to all; params: error {optional} - error message upon failure
 */
function saveRulesToStorage(rules, responseCallback) {
  rs.saveRulesToStorage(rules).then(() => responseCallback()).catch(responseCallback);
}
//---------------------------------------------------------------- listeners

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ listeners:menu

async function ctxMenuHandler(info, tab) {
  if (!await integr.ensureDomainPermission(tab)) {
    logger.error("Aborting, permissions to access the current domain not granted");
    return;
  }
  if (info.menuItemId === "fill_form") {
    ctxMenuFillFormHandler(tab);
  } else if (info.menuItemId === "save_form") {
    ctxMenuSaveFormHandler(tab);
  } else if (info.menuItemId === "toggle_floating_ui") {
    chrome.storage.local.get(['testofill.floatingIconEnabled'], (res) => {
      chrome.storage.local.set({ 'testofill.floatingIconEnabled': res['testofill.floatingIconEnabled'] === false });
    });
  }
}

function ctxMenuFillFormHandler(tab) {
  // TODO use frame url if defined
  findMatchingRules(tab.url, function (ruleSets) {
    if (ruleSets.length === 0) {
      // this handler currently not called if no rulesets
      chrome.windows.create({ url: 'no-rulesets.html?url=' + encodeURI(tab.url), type: 'popup', width: 400, height: 250 });
    } else if (ruleSets.length == 1) {
      // Apply directly
      sendMessageToContentScript(tab, "fill_form", ruleSets[0]);
    } else {
      // Show popup
      chrome.windows.create({ url: 'popup.html#' + tab.id, type: 'popup', width: 350, height: 200 });
    }
  }, true);
}

function ctxMenuSaveFormHandler(tab) {
  sendMessageToContentScript(tab, "save_form", { tabUrl: tab.url }); // No callback, expecting save_form_captured message
}

// Mutex to prevent race conditions when multiple frames save forms simultaneously
let saveMutex = Promise.resolve();
function withSaveMutex(action) {
  const result = saveMutex.then(action);
  saveMutex = result.catch(() => { });
  return result;
}

/** Merge the given map with the options.forms map. Safe for concurrency. */
function mergeIntoOptions(tab, forms) {
  withSaveMutex(() => new Promise((resolve, reject) => {
    mergeIntoOptionsInternal(tab, forms, resolve);
  }));
}

function mergeIntoOptionsInternal(tab, forms, doneCallback) {
  const url = tab.url;
  if (!forms) {
    sendMessageToContentScript(tab, 'extracted_forms_save_failed',
      { url: url, count: 0, error: 'No forms data provided?!' });
    return;
  }

  chrome.storage.local.get('testofill.rules', function (items) {
    if (typeof chrome.runtime.lastError !== "undefined") {
      logger.error("Error loading rules from storage: " + chrome.runtime.lastError.message);
      return; // TODO report the error to the user via the popup?
    }

    const rules = items['testofill.rules'];

    // data sanitization
    if (typeof rules === "undefined") {
      rules = { "forms": {} };
    } else if (typeof (rules.forms) === "undefined") {
      rules.forms = {};
    }
    if (typeof (rules.forms[url]) === "undefined") {
      rules.forms[url] = [];
    }

    // data merging
    const existingUrlForms = rules.forms[url];
    rules.forms[url] = existingUrlForms.concat(forms);



    saveRulesToStorage(rules, function (error) {
      if (doneCallback) doneCallback(); // Release mutex logic
      if (typeof error === 'undefined') {
        sendMessageToContentScript(tab, 'extracted_forms_saved', { url: url, count: forms.length });
      } else {
        sendMessageToContentScript(tab, 'extracted_forms_save_failed', { url: url, count: forms.length, error: error });
      }
    });

  });
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ listeners:other

/* Set # ruleSets on icon when tab/url changes, set popup */
function setBadgeAndIconAction(tabId, ruleSets) {
  // When 1+ sets => show in the badge; tabId => shows only when this tab active
  chrome.action.setBadgeText({ tabId: tabId, text: ruleSets.length.toString() });
  chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#04B4AE' });

  // If 2+ rule sets => set popup (replaces the default action.onCliked action set below)
  if (ruleSets.length > 1) {
    chrome.action.setPopup({ tabId: tabId, popup: 'popup.html' });
  } else {
    chrome.action.setPopup({ tabId: tabId, popup: '' }); // remove the popup, if any (needed????)
  }
}

async function triggerAutofillingIfEnabled(tab, ruleSets) {
  const access = await integr.hasDomainPermission(tab);
  if (access) {
    sendMessageToContentScript(tab, "trigger_autorun", {});
  }
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ listeners:installationOf
/*
 * When new URL loaded: Set # ruleSets on icon when tab/url changes, set popup, trigger auto-fill.
 *
 * BEWARE: Seems not to be triggered for cached pages.
 */
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status !== "complete") return;
  if (tab.url.startsWith("chrome://")) return;
  if (tab.url.startsWith("chrome-extension://")) return;

  const url = tab.url;
  // Default badge/popup if no matching rulesets
  chrome.action.setBadgeText({ tabId: tabId, text: 'N/A' });
  chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#808080' });
  chrome.action.setPopup({ tabId: tabId, popup: 'no-rulesets.html?url=' + encodeURI(url) });

  // WORKFLOW HANDLING
  if (activeWorkflow && activeWorkflow.tabId === tabId) {
    processWorkflowStep(tabId, url);
  }

  findMatchingRules(url, function (ruleSets) {
    setBadgeAndIconAction(tabId, ruleSets);
    triggerAutofillingIfEnabled(tab, ruleSets);
  });
  // Note: changeInfo.status loading/complete/undefined; url only while 'loading'
  // - Not triggered when another tab activated (i.e. switching tabs)
  // - Also triggered for new tab, url=chrome://newtab/
  // - Also triggered when navigating to an anchor on the same page or back
});

//---------------------------------------------------------------- workflow logic

async function startWorkflow(tab, workflowName) {
  const rules = await getFullRules();
  const workflowDef = rules.workflows ? rules.workflows[workflowName] : null;

  if (!workflowDef) {
    logger.error(`Workflow ${workflowName} not found`);
    return;
  }

  activeWorkflow = {
    name: workflowName,
    steps: workflowDef.steps, // Array of form names
    currentStepIndex: 0,
    tabId: tab.id,
    delayBetweenSteps: workflowDef.delayBetweenSteps || 1000,
    autoSubmit: workflowDef.autoSubmit || false
  };

  logger.log(`Starting workflow: ${workflowName} for tab ${tab.id}`);
  processWorkflowStep(tab.id, tab.url);
}

async function processWorkflowStep(tabId, currentUrl) {
  if (!activeWorkflow) return;

  const currentStepFormName = activeWorkflow.steps[activeWorkflow.currentStepIndex];

  // We need to find the rule definition AND the context (auto-detected country)
  // `findMatchingRules` does the heavy lifting of regex matching and context injection.
  // We can use it to find the *specific* form we are looking for.
  rs.findMatchingRules(currentUrl).then(matches => {
    const match = matches.find(m => m.name === currentStepFormName);

    if (match) {
      logger.log(`Workflow match! Step ${activeWorkflow.currentStepIndex}: ${currentStepFormName}`);

      // Inject workflow context (autoSubmit)
      const ruleSet = {
        ...match,
        autoSubmit: activeWorkflow.autoSubmit
      };

      // Wait for the configured delay before acting
      setTimeout(() => {
        // Send message to fill form
        chrome.tabs.sendMessage(tabId, { id: "fill_form", payload: ruleSet })
          .catch(err => {
            logger.log("Error sending workflow fill_form", err);
          });

        // Advance step
        activeWorkflow.currentStepIndex++;
        if (activeWorkflow.currentStepIndex >= activeWorkflow.steps.length) {
          logger.log("Workflow complete");
          activeWorkflow = null;
        }
      }, activeWorkflow.delayBetweenSteps);

    } else {
      // Form name mismatch or URL mismatch
      // If the URL matches the PATTERN but the name is different, that's fine, we just wait.
      // But we actually need to know if we are 'waiting' or 'failed'.
      // For now, simplicity: if findMatchingRules returns nothing for this form name, we assume we haven't reached the page yet.
      logger.log(`Workflow waiting: Form ${currentStepFormName} not found on ${currentUrl}`);
    }
  });
}

/* Only triggered if there is 0-1 ruleSets (i.e. of there is no popup win). */
chrome.action.onClicked.addListener(async (tab) => {

  const access = await integr.ensureDomainPermission(tab);
  if (access) {
    return rs.findMatchingRules(tab.url)
      .then((ruleSets) => sendMessageToContentScript(tab, "fill_form", ruleSets[0]));
  } else {
    logger.error("Aborting, permissions to access the current domain not granted");
    throw Error("Aborting, permissions to access the current domain not granted");
  }
});

chrome.contextMenus.onClicked.addListener(ctxMenuHandler);

function updateContextMenuTitle(isEnabled) {
  const title = isEnabled ? "Hide Floating UI" : "Show Floating UI";
  chrome.contextMenus.update("toggle_floating_ui", { title: title }, () => {
    if (chrome.runtime.lastError) {
      // It might not exist yet if called too early, ignore
    }
  });
}

// Set up context menu tree at install time.
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    "title": "Testofill this!",
    "contexts": ["page", "frame", "editable"],
    "id": "fill_form"
  });
  chrome.contextMenus.create({
    "title": "Save form(s)",
    "contexts": ["page", "frame", "editable"],
    "id": "save_form"
  });
  chrome.contextMenus.create({
    "title": "Hide Floating UI", // Default to enabled title
    "contexts": ["page", "frame", "action"],
    "id": "toggle_floating_ui"
  }, () => {
    // Sync title immediately after creation
    chrome.storage.local.get(['testofill.floatingIconEnabled'], (res) => {
      const isEnabled = res['testofill.floatingIconEnabled'] !== false;
      updateContextMenuTitle(isEnabled);
    });
  });
});

/**
 * Notify of data stored into the storage
 * @param changes {map} key -> {oldValue> .., newValue: ..}
 * @param namespace {string} e.g. 'sync'
 */
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace !== 'local') return;

  if (changes['testofill.rules']) {
    // TODO Notify Options page to reload? Update browser icon?
  }

  if (changes['testofill.floatingIconEnabled']) {
    const isEnabled = changes['testofill.floatingIconEnabled'].newValue !== false;
    updateContextMenuTitle(isEnabled);
  }
});

// ------------------------------------------------------------ message handling
/** Listen for message from the popup or ctx. menu with the selected ruleSet */
function handleMessage({ id, payload }, sender, sendResponseFn) {
  if (id === "content_script_loaded") {
    if (postponedMsg) {
      const { tab, messageId, payload, responseCallback } = postponedMsg;
      if (tab.url === sender.tab.url) {
        sendMessageToContentScript(tab, messageId, payload, responseCallback);
      } else {
        logger.debug('handleMessage:content_script_loaded - ignoring postponed msg, for another tab',
          { postponed: tab2.url, current: tab.url }
        );
      }
    }
  } else if (id === 'visual_mode_change') {
    chrome.action.setIcon({
      path: {
        16: `autofill_16x16-${payload.mode}.png`,
        128: `autofill_128x128-${payload.mode}.png`
      },
    });
  } else if (id === 'start_workflow') {
    startWorkflow(sender.tab || payload.tab, payload.workflowName); // handled from popup (no sender.tab?) or content
  } else if (id === 'save_form_captured') {
    mergeIntoOptions(sender.tab, payload.forms);
  } else {
    logger.warn("Unsupported message id received: " + id, message);
  }

  return false; // sendResponseFn is not async
}

if (!chrome.runtime.onMessage.hasListeners()) {
  chrome.runtime.onMessage.addListener(handleMessage);
}
