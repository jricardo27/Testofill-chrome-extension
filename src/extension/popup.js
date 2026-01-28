import * as rs from "./shared/rules-store.js";
import * as integr from "./shared/integration.js";

/** Entry point for initializing the matching ruleSets select for the given tab */
function renderForTab(tab) {
  // Load full rules to get workflows
  rs.getFullRules().then(rules => {
    // 1. Render Workflows
    renderWorkflows(rules);

    // 2. Find matching Forms
    findMatchingRules(tab.url, function (ruleSets) {
      renderRuleSetSelection(ruleSets);
      document.querySelector('#ruleSetList').addEventListener('change', function (evt) {
        handleRuleSetSelected(evt, tab, ruleSets);
      });
    });

    // Event Listeners
    document.getElementById('runWorkflow').addEventListener('click', () => handleRunWorkflow(tab));

  });
}

/* Find defined ruleSets matching this URL */
function findMatchingRules(currentUrl, ruleSetsCallback) {
  rs.findMatchingRules(currentUrl).then(ruleSetsCallback);
}

// -------------------------------------------------------------------------------- UI RENDERING

function renderWorkflows(rules) {
  const wfSelect = document.getElementById("workflowList");
  if (rules.workflows) {
    for (const wfName in rules.workflows) {
      wfSelect.add(new Option(wfName, wfName));
    }
  }
}

/** Fill in the rule set <select> with the given ruleSets */
function renderRuleSetSelection(ruleSets) {
  var ruleSetList = document.getElementById("ruleSetList");
  // ruleSetList.size = Math.max(2, ruleSets.length); // auto-size

  if (ruleSets.length === 0) {
    ruleSetList.add(new Option("No matching forms found", ""));
    ruleSetList.disabled = true;
    return;
  }

  ruleSets.forEach(function (ruleSet, idx) {
    const context = ruleSet.context || {};
    const countryInfo = context.country ? ` [${context.country}]` : "";
    var label = ruleSet.name + countryInfo + (ruleSet.doc ? " - " + ruleSet.doc : "");
    ruleSetList.add(new Option(label, idx));
  });
}

// -------------------------------------------------------------------------------- HANDLERS

/** Get the selected ruleSet, send message to the content script to apply it */
function handleRuleSetSelected(evt, tab, ruleSets) {
  evt.preventDefault();
  var select = evt.target;
  var ruleSetIdx = select.value;
  if (ruleSetIdx === "") return; // "No matching forms" option

  var ruleSet = ruleSets[ruleSetIdx];

  integr.sendMessageToContentScript(tab, "fill_form", ruleSet)
    .then((_resp) => { window.close(); })
    .catch((_resp) => { window.close(); });
}

function handleRunWorkflow(tab) {
  const wfName = document.getElementById("workflowList").value;
  if (!wfName) return;

  // Send message to Service Worker to start workflow
  // We need to send it to runtime, not content script directly (though SW listens to both? SW listens to runtime.onMessage)
  chrome.runtime.sendMessage({
    id: 'start_workflow',
    payload: {
      tab: tab,
      workflowName: wfName
      // context is auto-detected by service worker
    }
  });
  window.close();
}

// Trigger renderForTab when loaded
document.addEventListener('DOMContentLoaded', function () {
  var tabIdFromUrl = window.location.hash.substring(1);
  if (tabIdFromUrl) {
    // Opened from ctx menu
    chrome.tabs.get(parseInt(tabIdFromUrl), function (tab) {
      renderForTab(tab);
    });
  } else {
    // Opened from browserAction icon
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      renderForTab(tab);
    });
  }
});
