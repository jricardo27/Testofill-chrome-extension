import * as rs from "./shared/rules-store.js";
import { logger } from "./shared/logger.js";
// Options storage

function showStatus(message, type) {
  var statusElm = document.getElementById("status");

  var color = "blue";
  if (type === "error") {
    message = 'ERROR: ' + message;
    color = "red";
  } else if (type === "info") {
    color = "cadetblue";
  }

  statusElm.innerHTML = '<span style="color:' + color + '" class="status-msg">' + message + '</span>';

  // TODO fix this timeout reset, does not work:
  setTimeout(function () {
    statusElm.innerHTML = "";
  }, 750);
}

function showError(message) {
  showStatus(message, "error");
}

function saveToStorage(json) { // see also events.js: mergeIntoOptions()
  rs.saveRulesToStorage(json)
    .then(_ => showStatus("Options Saved."))
    .catch((error) => showError("Saving failed: " + error));
}

function validateOptions(json) {
  if (!json || typeof json !== 'object') {
    return "Root must be a JSON object.";
  }
  if (!json.forms) {
    return "Missing 'forms' object.";
  }

  // Validate forms
  for (const [name, rule] of Object.entries(json.forms)) {
    // Legacy array support or new object support
    if (Array.isArray(rule)) {
      // Legacy: Array of rules for a key (which is the regex)
      // We can't easily validate the key as regex here without try-catch, but structure is:
      // "regex": [{name, fields...}]
      for (let i = 0; i < rule.length; i++) {
        const subRule = rule[i];
        if (!subRule.fields) return `Form "${name}" [index ${i}] missing 'fields'`;
      }
    } else {
      // New schema: { urlPattern, fields }
      if (!rule.urlPattern) return `Form "${name}" missing 'urlPattern'`;
      if (!rule.fields) return `Form "${name}" missing 'fields'`;
      if (!Array.isArray(rule.fields)) return `Form "${name}" 'fields' must be an array`;

      for (let i = 0; i < rule.fields.length; i++) {
        const field = rule.fields[i];
        if (!field.selector && !field.query) {
          return `Form "${name}" field #${i + 1} missing 'selector' or 'query'`;
        }
      }
    }
  }

  return null; // No error
}

function save_options(editor) {
  var rules = editor.get();
  var error = validateOptions(rules);
  if (error) {
    showError("Validation Error: " + error);
    return;
  }
  saveToStorage(rules);
}

function restore_options(editor) {
  var exampleJson = {
    "name": "Testofill Configuration Example",
    "version": "1.0.0",
    "description": "Example configuration for Testofill form auto-filling",
    "environments": {
      "example": {
        "us": "https://example-us.app.com/",
        "au": "https://example-au.app.com/"
      }
    },
    "forms": {
      "Signup Form": {
        "urlPattern": "/signup/",
        "waitForSelector": "input[type='email']",
        "fields": [
          {
            "selector": "input[type='email']",
            "value": "test.user.t{timestamp}@example.com",
            "type": "input",
            "description": "Email address",
            "delay": 50
          },
          {
            "selector": "input[type='password']",
            "value": "ExamplePassword123!",
            "type": "input",
            "description": "Password",
            "delay": 50
          },
          {
            "selector": "input[type='checkbox']",
            "value": "true",
            "type": "checkbox",
            "description": "Accept terms and conditions",
            "delay": 50
          }
        ]
      },
      "Upload Bill Form": {
        "urlPattern": "/upload-bill",
        "waitForSelector": "input[type='file']",
        "fields": [
          {
            "selector": "input[type='file']",
            "value": "",
            "type": "file",
            "description": "Bill file upload - requires manual file selection",
            "note": "Cannot auto-fill file inputs, must select manually"
          }
        ]
      }
    },
    "options": {
      "delayBetweenFields": 50,
      "scrollToField": true,
      "highlightField": true,
      "confirmBeforeSubmit": false,
      "debugMode": false,
      "autoDetectCountry": true,
      "retryFailedFields": true,
      "maxRetries": 3
    }
  };

  chrome.storage.local.get('testofill.rules', function (items) {
    if (typeof chrome.runtime.lastError === "undefined") {
      var rules = items['testofill.rules'];
      logger.log("Rules restored: ", rules);

      if (typeof rules !== "undefined") { // TODO verify behaves OK if there are no saved rules
        editor.set(rules);
      } else {
        editor.set(exampleJson);
        showStatus("This is only an example, not really saved - save it if you want", "info");
      }
      editor.expandAll();

    } else {
      showError("Restoring the rules failed: " + chrome.runtime.lastError);
      logger.error("ERROR restoring rules", chrome.runtime.lastError);
    }
  });
}

function init() {
  var container = document.getElementById("jsoneditor");
  var options = {
    change: function () { showStatus("Configuration changed, don't forget to save it", "info"); },
    mode: 'tree',
    modes: ['tree', 'code'], // allowed modes
    error: function (err) {
      logger.error("JSONEditor error:", err);
    }
  };
  var editor = new jsoneditor.JSONEditor(container, options);

  restore_options(editor);

  document.querySelector('.save').addEventListener('click', function () { save_options(editor); });
  document.querySelector('.reset').addEventListener('click', function () {
    restore_options(editor);
    showStatus("Configuration reset to the saved one", "info");
  });

  // Autorun toggle
  const autorunCB = document.getElementById('toggleAutorun');
  chrome.storage.local.get(['testofill.autorunEnabled'], (res) => {
    autorunCB.checked = res['testofill.autorunEnabled'] !== false; // default true
  });
  autorunCB.addEventListener('change', (e) => {
    chrome.storage.local.set({ 'testofill.autorunEnabled': e.target.checked });
    showStatus(e.target.checked ? "Autorun enabled." : "Autorun disabled.", "info");
  });

  // Debug Log toggle
  const debugLogCB = document.getElementById('toggleDebugLog');
  chrome.storage.local.get(['testofill.debugLogEnabled'], (res) => {
    debugLogCB.checked = res['testofill.debugLogEnabled'] === true; // default false
  });
  debugLogCB.addEventListener('change', (e) => {
    chrome.storage.local.set({ 'testofill.debugLogEnabled': e.target.checked });
    showStatus(e.target.checked ? "Debug Logging enabled." : "Debug Logging disabled.", "info");
  });

}

document.addEventListener('DOMContentLoaded', init);
