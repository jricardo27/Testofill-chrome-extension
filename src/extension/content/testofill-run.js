/**
 * The Content Script injected into the browser document and
 * invoked by messages from the extension (via event.js).
 */

const FLOATING_UI_CSS = `
  #testofill-floating-ui {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 280px;
    background: #ffffff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow: hidden;
    transition: all 0.3s ease;
  }
  #testofill-floating-ui.minimized {
    width: 48px;
    height: 48px;
    border-radius: 24px;
    cursor: pointer;
  }
  #testofill-floating-ui.minimized .form-list, #testofill-floating-ui.minimized .footer {
    display: none;
  }
  #testofill-floating-ui .form-list {
    max-height: 300px;
    overflow-y: auto;
    padding: 8px;
  }
  #testofill-floating-ui .form-item {
    display: block;
    width: 100%;
    text-align: left;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    padding: 10px;
    margin-bottom: 6px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: #333;
    transition: background 0.2s;
  }
  #testofill-floating-ui .form-item:hover {
    background: #e2e6ea;
  }
  #testofill-floating-ui .mini-icon {
    display: none;
    width: 100%;
    height: 100%;
    justify-content: center;
    align-items: center;
    font-size: 24px;
  }
  #testofill-floating-ui.minimized .mini-icon {
    display: flex;
    background: #007bff;
    color: white;
    border-radius: 24px;
  }
  #testofill-floating-ui .close-mini {
    display: none;
    position: absolute;
    top: -2px;
    right: -2px;
    background: #dc3545;
    color: white;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    font-size: 14px;
    line-height: 16px;
    text-align: center;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  #testofill-floating-ui.minimized .close-mini {
    display: block;
  }
  #testofill-floating-ui .footer {
    border-top: 1px solid #eee;
    padding: 8px;
    background: #fdfdfd;
  }
  .testofill-live-test-panel {
    position: fixed;
    bottom: 20px;
    right: 310px;
    width: 350px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 2147483647;
    font-family: inherit;
    padding: 12px;
  }
  .testofill-keyword-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    padding: 2px 0;
    border-bottom: 1px dashed #eee;
  }
  .testofill-keyword-row b { color: #0056b3; }
  .testofill-test-form {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #eee;
  }
  .testofill-test-form input {
    width: 100%;
    margin-bottom: 5px;
    padding: 4px;
    font-size: 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .testofill-btn-primary {
    background: #28a745;
    color: #fff;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
    font-weight: bold;
    margin-top: 5px;
  }
`;

/** Returns a preview of what placeholders resolve to right now */
async function getKeywordPreview() {
  const keys = [
    '{timestamp}', '{time}', '{firstName}', '{lastName}', '{fullName}',
    '{streetName}', '{streetType}', '{city}', '{stateAU}', '{stateUS}',
    '{postcodeAU}', '{postcodeUS}',
    '{random2}', '{random3-[1,5]}', '{random4}', '{random6}', '{phoneUS}', '{phoneUSLocal}',
    '{lastPhoneUS6}', '{lastPhoneUSDigit:0}'
  ];
  const results = {};
  for (const k of keys) {
    results[k] = await processPlaceholders(k);
  }
  return results;
}


// Helper for local matching within content script
async function matchRulesLocally(currentUrl) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return [];
  console.log("Testofill: Checking for matches against URL:", currentUrl);
  const data = await chrome.storage.local.get('testofill.rules');
  const rules = data['testofill.rules'] || {};
  if (!rules.forms) {
    console.log("Testofill: No rules.forms found in storage.");
    return [];
  }

  let matches = [];
  const environments = rules.environments || {};
  let country = null;

  for (const envGroup in environments) {
    const envs = environments[envGroup];
    for (const code in envs) {
      if (currentUrl.startsWith(envs[code])) {
        country = code.toUpperCase();
        break;
      }
    }
    if (country) break;
  }
  console.log("Testofill: Detected country context:", country);

  for (const formName in rules.forms) {
    const formDef = rules.forms[formName];

    if (Array.isArray(formDef)) {
      // Key is a URL pattern, value is array of rules
      try {
        const regex = new RegExp(formName);
        const isMatch = !!currentUrl.match(regex);
        if (isMatch) {
          // For old schema, rules are in an array; they don't usually have requiredSelector per item
          // but we'll check if one exists in the first item or similar if needed.
          // However, old schema doesn't really support requiredSelector.
          matches = matches.concat(formDef.map(f => ({ ...f, name: f.name || formName, context: { country } })));
        }
      } catch (e) {
        console.warn("Testofill: Error matching form key as regex:", formName);
      }
    } else if (formDef.urlPattern) {
      // Key is name, value is object with urlPattern
      try {
        const regex = new RegExp(formDef.urlPattern);
        const isMatch = !!currentUrl.match(regex);
        if (isMatch) {
          // CHECK REQUIRED SELECTOR
          if (formDef.requiredSelector && Sizzle(formDef.requiredSelector).length === 0) {
            console.log(`Testofill: RuleSet '${formName}' skipped - requiredSelector '${formDef.requiredSelector}' not found.`);
            continue;
          }
          matches.push({ ...formDef, name: formName, context: { country } });
        }
      } catch (e) {
        console.error(`Testofill: Invalid urlPattern regex for form '${formName}':`, formDef.urlPattern);
      }
    }
  }
  console.log(`Testofill: Found ${matches.length} matching ruleSet(s) for this page.`);
  return matches;
}

function createFloatingUI(matches) {
  let container = document.getElementById('testofill-floating-ui');

  if (!container) {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = FLOATING_UI_CSS;
    document.head.appendChild(styleSheet);

    container = document.createElement('div');
    container.id = 'testofill-floating-ui';

    // Initial header/mini-icon
    container.innerHTML = `
      <div class="mini-icon">✎</div>
      <div class="close-mini" id="testofill-close-mini" title="Hide Icon">&times;</div>
      <div class="form-list" style="margin-top: 5px;"></div>
      <div class="footer" style="display: flex; justify-content: space-between; align-items: center;">
        <button id="testofill-live-btn" class="form-item" style="margin:0; text-align:center; background:#e9ecef; flex-grow: 1;">🧪 Live Test / Keywords</button>
        <div style="margin-left: 10px; display: flex; gap: 8px;">
          <button id="testofill-min-btn" title="Minimize" style="background:#007bff; color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer;">&minus;</button>
          <button id="testofill-close-btn" title="Hide Popup" style="background:#dc3545; color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer;">&times;</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const minBtn = container.querySelector('#testofill-min-btn');
    const miniIcon = container.querySelector('.mini-icon');
    const toggleMin = (e) => {
      e.stopPropagation();
      container.classList.toggle('minimized');
      const panel = document.querySelector('.testofill-live-test-panel');
      if (panel) panel.style.display = container.classList.contains('minimized') ? 'none' : 'block';
    };
    minBtn.onclick = toggleMin;
    miniIcon.onclick = toggleMin;
    
    container.querySelector('#testofill-close-btn').onclick = (e) => {
      e.stopPropagation();
      chrome.storage.local.set({ 'testofill.floatingIconEnabled': false });
    };
    container.querySelector('#testofill-close-mini').onclick = (e) => {
      e.stopPropagation();
      chrome.storage.local.set({ 'testofill.floatingIconEnabled': false });
    };
    container.querySelector('#testofill-live-btn').onclick = () => createLiveTestUI();
  }

  const list = container.querySelector('.form-list');
  list.innerHTML = ''; // Clear for update

  matches.forEach(ruleSet => {
    const btn = document.createElement('button');
    btn.className = 'form-item';
    btn.innerText = ruleSet.name;
    btn.onclick = (e) => { e.stopPropagation(); fillForms(ruleSet); };
    list.appendChild(btn);
  });
}

// Global state to avoid flicker
let lastMatchesHash = "";
function updateAvailableForms() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    if (typeof observer !== 'undefined') observer.disconnect();
    return;
  }
  chrome.storage.local.get(['testofill.floatingIconEnabled']).then((settings) => {
    const isEnabled = settings['testofill.floatingIconEnabled'] !== false; // Default true
    if (!isEnabled) {
      const existing = document.getElementById('testofill-floating-ui');
      if (existing) existing.remove();
      lastMatchesHash = ""; // Reset so it recreates if re-enabled
      return;
    }

    matchRulesLocally(document.location.toString()).then(matches => {
      const hash = JSON.stringify(matches.map(m => m.name));
      if (hash === lastMatchesHash) return;
      lastMatchesHash = hash;

      if (matches.length > 0) {
        createFloatingUI(matches);
      } else {
        const existing = document.getElementById('testofill-floating-ui');
        if (existing) existing.remove();
      }
    });
  });
}

const debouncedUpdate = _.debounce(updateAvailableForms, 500);
const observer = new MutationObserver((mutations) => {
  // Only update if significant changes or inputs added
  const shouldUpdate = mutations.some(m =>
    m.addedNodes.length > 0 || m.type === 'attributes'
  );
  if (shouldUpdate) debouncedUpdate();
});


async function createLiveTestUI() {
  let panel = document.querySelector('.testofill-live-test-panel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.className = 'testofill-live-test-panel';
  panel.innerHTML = `
    <div style="font-weight:bold; border-bottom: 2px solid #eee; padding-bottom: 4px; margin-bottom: 8px; display: flex; justify-content: space-between;">
      <span>🧪 Live Evaluator & Keywords</span>
      <button id="testofill-close-live" style="border:none; background:none; cursor:pointer;">&times;</button>
    </div>
    <div id="testofill-keywords-list" style="max-height: 150px; overflow-y: auto; margin-bottom: 10px;">
      Loading keywords...
    </div>
    <div class="testofill-test-form">
      <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Test a selector:</div>
      <input id="testofill-live-selector" type="text" placeholder="CSS Selector (e.g. #first_name)">
      <input id="testofill-live-value" type="text" placeholder="Value (e.g. {firstName})">
      <button class="testofill-btn-primary" id="testofill-run-test">Run One-Off Test</button>
    </div>
  `;

  document.body.appendChild(panel);

  const keyList = panel.querySelector('#testofill-keywords-list');
  const preview = await getKeywordPreview();
  keyList.innerHTML = Object.entries(preview).map(([k, v]) => `
    <div class="testofill-keyword-row"><b>${k}</b> <span>${v}</span></div>
  `).join('');

  panel.querySelector('#testofill-close-live').onclick = () => panel.remove();

  panel.querySelector('#testofill-run-test').onclick = async () => {
    const selector = panel.querySelector('#testofill-live-selector').value;
    const val = panel.querySelector('#testofill-live-value').value;
    if (!selector) { alert("Please enter a selector"); return; }

    const elements = Sizzle(selector);
    if (elements.length === 0) {
      alert(`No elements found for: ${selector}`);
      return;
    }

    const mockRule = { selector, value: val };
    for (const el of elements) {
      // Highlight briefly
      const oldBorder = el.style.border;
      el.style.border = '3px solid #28a745';
      setTimeout(() => el.style.border = oldBorder, 1000);

      await fillField(el, mockRule);
    }
  };
}



//---------------------------------------------------------------------- FILL FORM
/* Apply the selected rule set to the current page, filling its form(s).
 * ruleSet ex.: {"name":"kid user test", "fields":
 *  [{"query": "[name='q']", "value": "Hi!"}]}
 *
 */
//---------------------------------------------------------------------- HELPERS
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Robustly set input value and trigger events for modern frameworks (React, etc.) */
function setInputValue(elm, value) {
  if (!elm) return;
  console.log(`Testofill: Filling '${elm.name || elm.id}' with '${value}'`, elm);

  const isReadOnly = elm.readOnly || elm.hasAttribute('readonly');
  if (isReadOnly) {
    elm.readOnly = false;
    elm.removeAttribute('readonly');
  }

  // React-specific: Bypassing the value setter tracking
  const proto = Object.getPrototypeOf(elm);
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;

  // React 16+ value tracking hack
  const tracker = elm._valueTracker;
  if (tracker) tracker.setValue(""); // Reset tracker to force change detection

  elm.dispatchEvent(new Event('focus', { bubbles: true }));

  if (nativeSetter && nativeSetter !== Object.getOwnPropertyDescriptor(elm, "value")?.set) {
    nativeSetter.call(elm, value);
  } else {
    elm.value = value;
  }

  if (tracker) tracker.setValue(value);

  // Dispatch events to wake up listeners
  elm.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  elm.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  elm.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  elm.dispatchEvent(new Event('input', { bubbles: true }));
  elm.dispatchEvent(new Event('change', { bubbles: true }));
  elm.dispatchEvent(new Event('focusout', { bubbles: true }));

  // Try document.execCommand for even more native-like input triggering
  try {
    elm.focus();
    elm.select();
    document.execCommand('insertText', false, value);
  } catch (e) {
    // Ignore if it fails or is not supported/possible
  }

  // Simulate synthetic input event for frameworks checking event properties
  elm.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    composed: true,
    data: value,
    inputType: 'insertText'
  }));

  // Simulate "Enter" to commit the value just in case
  elm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  elm.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

  // Restore state after a delay to allow framework processing or re-renders
  setTimeout(() => {
    console.log(`Testofill: Post-fill check for '${elm.id || elm.name}': value is "${elm.value}"`);
    if (isReadOnly) {
      elm.readOnly = true;
      elm.setAttribute('readonly', '');
    }
    elm.dispatchEvent(new Event('blur', { bubbles: true }));

    // Simulate Escape to close any dropdowns/pickers opened by our interaction
    elm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    elm.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
  }, 200);
}

async function waitForElement(selector, timeout = 5000) {
  const startTime = Date.now();
  // Using Sizzle to support :contains() and other advanced selectors
  while (Sizzle(selector).length === 0) {
    if (Date.now() - startTime > timeout) {
      console.warn(`Testofill: Timeout waiting for selector: ${selector}`);
      return false;
    }
    await sleep(100);
  }
  return true;
}

async function processPlaceholders(value) {
  if (typeof value !== 'string') return value;

  const now = new Date();

  // {timestamp}
  value = value.replace(/{timestamp}/g, now.getTime());

  // {time} - HHMMSS
  const timestamp = now.toTimeString().split(' ')[0].replace(/:/g, '');
  value = value.split('{time}').join(timestamp);

  // {randomN} or {randomN-[exclusions]}
  value = value.replace(/{random(\d+)(?:-\[([\d, ]*)\])?}/g, (match, lengthStr, exclusionsStr) => {
    const length = parseInt(lengthStr, 10);
    const exclusions = exclusionsStr ? exclusionsStr.split(/[, ]+/).filter(x => x).map(s => s.trim()) : [];
    const pool = "0123456789".split('').filter(d => !exclusions.includes(d));
    if (pool.length === 0) {
      console.warn("Testofill: random pool is empty after exclusions:", exclusions);
      return match;
    }
    let result = '';
    for (let i = 0; i < length; i++) {
       result += pool[Math.floor(Math.random() * pool.length)];
    }
    return result;
  });

  // {phoneUS} - Special generator: +1500yxxxxxx where y ≠ 2
  if (value.includes('{phoneUS}')) {
    const y = "013456789"[Math.floor(Math.random() * 9)];
    const rest = Math.random().toString().slice(2, 8); // 6 random digits
    const phone = `+1500${y}${rest}`;
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      await chrome.storage.local.set({ 'testofill.lastPhoneUS': phone });
    }
    value = value.replace(/{phoneUS}/g, phone);
  }

  // {phoneUSLocal} - Special generator: 500yxxxxxx where y ≠ 2
  if (value.includes('{phoneUSLocal}')) {
    const y = "013456789"[Math.floor(Math.random() * 9)];
    const rest = Math.random().toString().slice(2, 8); // 6 random digits
    const phone = `500${y}${rest}`;
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      await chrome.storage.local.set({ 'testofill.lastPhoneUS': phone });
    }
    value = value.replace(/{phoneUSLocal}/g, phone);
  }

  // {lastPhoneUS6} - Retrieve last 6 digits of the last generated US phone
  if (value.includes('{lastPhoneUS6}')) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const data = await chrome.storage.local.get('testofill.lastPhoneUS');
      const lastPhone = data['testofill.lastPhoneUS'] || "";
      const last6 = lastPhone.slice(-6);
      value = value.replace(/{lastPhoneUS6}/g, last6);
    }
  }

  // {lastPhoneUSDigit:N} - Get the N-th digit (0-5) of the last 6 digits
  if (value.includes('{lastPhoneUSDigit:')) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const data = await chrome.storage.local.get('testofill.lastPhoneUS');
      const lastPhone = data['testofill.lastPhoneUS'] || "";
      const last6 = lastPhone.slice(-6);
      value = value.replace(/{lastPhoneUSDigit:(\d)}/g, (match, digit) => {
        const idx = parseInt(digit, 10);
        return last6[idx] || "";
      });
    }
  }

  // Random names and addresses using Chance.js (if available)
  if (typeof chance !== 'undefined') {
    value = value.replace(/{firstName}/g, () => chance.first());
    value = value.replace(/{lastName}/g, () => chance.last());
    value = value.replace(/{fullName}/g, () => chance.name());
    value = value.replace(/{streetName}/g, () => chance.word({ capitalize: true }));
    const streetTypes = ['Street', 'Road', 'Avenue', 'Lane', 'Drive', 'Court', 'Circuit', 'Place', 'Boulevard', 'Way'];
    value = value.replace(/{streetType}/g, () => streetTypes[Math.floor(Math.random() * streetTypes.length)]);
    value = value.replace(/{city}/g, () => chance.city());
    value = value.replace(/{stateUS}/g, () => chance.state());
    value = value.replace(/{postcodeUS}/g, () => chance.zip());
  }

  // Region specific states
  value = value.replace(/{stateAU}/g, () => {
    const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
    return states[Math.floor(Math.random() * states.length)];
  });

  // AU Postcode (4 digits)
  value = value.replace(/{postcodeAU}/g, () => Math.floor(2000 + Math.random() * 6000).toString());

  return value;
}

//---------------------------------------------------------------------- FILL FORM
/* Apply the selected rule set to the current page, filling its form(s). */
//---------------------------------------------------------------------- FILL FORM
/* Apply the selected rule set to the current page, filling its form(s). */
async function fillForms(ruleSet) {
  if (typeof ruleSet === 'undefined') return;

  const data = await chrome.storage.local.get('testofill.rules');
  const rules = data['testofill.rules'] || {};
  const globalOptions = rules.options || {}; // global options are at rules.options
  const context = ruleSet.context || {}; // e.g. { country: 'US' }

  // 0. RequiredSelector (Discrimination)
  if (ruleSet.requiredSelector && Sizzle(ruleSet.requiredSelector).length === 0) {
    console.log(`Testofill: Aborting, required selector '${ruleSet.requiredSelector}' not found.`);
    return;
  }

  // 1. WaitForSelector
  if (ruleSet.waitForSelector) {
    console.log(`Testofill: Waiting for selector ${ruleSet.waitForSelector}...`);
    await waitForElement(ruleSet.waitForSelector);
  }

  var unmatchedSelectors = [];

  // Process fields sequentially to support delays
  for (const field of ruleSet.fields) {

    // Country Filter
    if (field.country && context.country && field.country !== context.country) {
      console.debug(`Skipping field ${field.description} due to country mismatch (${field.country} !== ${context.country})`);
      continue;
    }

    // 2. Field Delay
    // Use field delay or fallback to global delay or default 50ms
    const delay = field.delay !== undefined ? field.delay : (globalOptions.delayBetweenFields || 50);
    if (delay > 0) {
      await sleep(delay);
    }

    var fieldElms = Sizzle(field.selector || field.query); // Support both 'selector' and 'query'
    if (fieldElms.length === 0) {
      unmatchedSelectors.push(field);
    } else {
      for (const inputElm of fieldElms) {
        // Global Option: Scroll to Field
        if (globalOptions.scrollToField) {
          inputElm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Global Option: Highlight Field
        if (globalOptions.highlightField) {
          const originalBorder = inputElm.style.border;
          const originalBg = inputElm.style.backgroundColor;
          inputElm.style.border = '2px solid red';
          inputElm.style.backgroundColor = '#ffffcc';
          setTimeout(() => {
            inputElm.style.border = originalBorder;
            inputElm.style.backgroundColor = originalBg;
          }, 1000); // Highlight for 1s
        }

        await fillField(inputElm, field);
      }
    }
  }

  if (unmatchedSelectors.length > 0) {
    console.log("Warning: some fields matched nothing in the set named " +
      ruleSet.name,
      unmatchedSelectors);
  }

}

/* Apply rule to a field to fill it (exec. for each matching field, e.g. radio). */
async function fillField(fieldElm, fieldRule) {
  // Support generative (legacy)
  if (!_.isUndefined(fieldRule.generate)) {
    fieldRule.value = await parseTopGenExpr(fieldRule.generate); // Note: generative might need to be async too if it uses storage, but for now we keep it simple
  }

  // 3. Process Placeholders
  let valueToFill = await processPlaceholders(fieldRule.value);

  if (fieldElm.type === 'checkbox') {
    // boolean check
    if (String(valueToFill) === 'true') valueToFill = true;
    if (String(valueToFill) === 'false') valueToFill = false;

    if (fieldElm.checked === Boolean(valueToFill)) return;
    fieldElm.dispatchEvent(new MouseEvent('click', { 'view': window, 'bubbles': true }));
  } else if (fieldElm.type === 'file') {
    // File inputs are read-only for security, just log/notify
    console.log(`Testofill: Skipping file input ${fieldRule.selector || fieldRule.query}. Manual selection required.`);
    if (fieldRule.value) console.log(`Expected file: ${fieldRule.value}`);
    if (fieldRule.note) console.log(`Note: ${fieldRule.note}`);
    // Optional: Focus it so user sees it
    fieldElm.focus();
    fieldElm.click(); // Some browsers allow opening dialog, most block it. Worth a try or just focus.
  } else if (fieldElm.type === 'select-one') {
    // assertFieldType(fieldElm.type, fieldRule, 'string'); // Relaxed type check for placeholders
    setInputValue(fieldElm, valueToFill);
  } else if (fieldElm.type === 'select-multiple') {
    fieldElm.dispatchEvent(new Event('focus', { bubbles: true }));
    const value = (valueToFill === null) ? [] : valueToFill;
    // ... existing select-multiple logic ...
    if (!Array.isArray(value)) {
      // Try single value
      // console.error...
    }
    // For now keeping existing logic for arrays, but if placeholder returns string, wrap in array?
    // Let's assume select-multiple values don't use string placeholders for the array itself usually.
    if (!Array.isArray(value)) {
      console.error("The form element is a select-multiple and thus the value " +
        "to fill in should be null or an array of 0+ values but it is not an array; " +
        "query: " + (fieldRule.selector || fieldRule.query) + ", the value: ", value,
        "; the field: ", fieldElm);
      return;
    }
    for (var j = fieldElm.length - 1; j >= 0; j--) {
      var multiOpt = fieldElm[j];
      multiOpt.selected = (value.indexOf(multiOpt.value) >= 0);
    }
    fieldElm.dispatchEvent(new Event('change', { 'view': window, 'bubbles': true }));
  } else if (fieldElm.type === 'radio') {
    // Radio buttons
    // The selector usually targets a group or specific button.
    // If specific button (e.g. by ID or unique attr), click it if value matches?
    // Actually existing logic: find the one with matching value.
    const wantChecked = (fieldElm.value === valueToFill);
    if (wantChecked === fieldElm.checked) return;
    if (wantChecked) {
      fieldElm.dispatchEvent(new MouseEvent('click', { 'view': window, 'bubbles': true }));
    }
  } else if (fieldRule.textContent) {
    fieldElm.dispatchEvent(new Event('focus', { bubbles: true }));
    fieldElm.textContent = fieldRule.textContent;
    fieldElm.dispatchEvent(new Event('input', { bubbles: true }));
  } else { // Typically a text <input>
    setInputValue(fieldElm, valueToFill);
  }
}

/** Warn if fieldRule.value is not of the expectedType. */
function assertFieldType(fieldType, fieldRule, expectedType) {
  if (fieldRule.value === null) return;
  const actualType = (typeof fieldRule.value === 'object') ?
    fieldRule.value.constructor.name : typeof fieldRule.value;
  if (actualType === expectedType) return true;
  console.assert(
    actualType === expectedType,
    `fieldRule.value for a ${fieldType} must be a ${expectedType} (or null); fieldRule={query: ${fieldRule.query}, value:${fieldRule.value}}`);
  return false;
}

// function elmToString(elm) {
//   if (elm.id) return `[id=${elm.id}]`;
//   if (elm.name) return `[name=${elm.name}]`;
//   if (elm.className) return `[class=${elm.className}]`;
// }

//---------------------------------------------------------------------- SAVE FORM

/**
 * Find all forms on the page, create query+value pair for each relevant field,
 * return an array of {name: .., fields: [..]} that can be merged into the existing config.
 */
function makeTestofillJsonFromPageForms(tabUrl) {
  var excludedTypes = ['button', 'submit', 'reset', 'form', 'hidden'];
  var debugStrs = [];

  // if (tabUrl != document.location.toString()) {
  //   console.debug("document.location != tabUrl", { loc: document.location.toString(), tabUrl });
  //   return null; // skip forms in iframes etc.
  // }

  var formListJson =
    _.map(document.forms, function (form, idx) {
      var formName = "TODO Name this " + form.id;
      var fieldElms = Sizzle(":input", form); // Find inputs and  textareas, selects, and buttons:

      var fieldElmsOnlyRelevant = _.filter(fieldElms, f =>
        (f.name !== "" || f.id !== "") &&
        f.value !== '' &&
        excludedTypes.indexOf(f.type) === -1 &&
        !f.disabled &&
        !f.readonly
      );

      var jsonFieldsAll = _.chain(fieldElmsOnlyRelevant)
        .groupBy(f => f.name ? f.name : f.id) // group all radios with the same value into one array
        .map(_.values) // turn {'fieldName': [field1, field2,...]} into just the array of fields (for that name/id)
        .map(inputGrp => ({ "query": makeQueryFrom(inputGrp[0]), "value": makeValueFrom(inputGrp) }))
        .value();

      // Filter out fields with no discernible value, ...
      var jsonFieldsOnlySet = _.filter(jsonFieldsAll, rule => rule.value !== undefined);

      const cntAllFields = fieldElms.length;
      const formIdent = form.id || form.className || '';
      let msg = `Form #${idx} ${formIdent ? `{${formIdent}}` : ''}`;
      if (cntAllFields === 0) {
        debugStrs.push(`${msg} has no fields`);
      } else {
        const cntIrrelevant = (fieldElms.length - fieldElmsOnlyRelevant.length);
        if (cntIrrelevant) msg += ` ${cntIrrelevant}/${cntAllFields} field(s) were irrelevant (no name or value / disabled / type such as hidden)`;
        const cntExcluded = (jsonFieldsAll.length - jsonFieldsOnlySet.length);
        if (cntExcluded) msg += ` ${cntExcluded}/${cntAllFields} field(s) were excluded due to not having any value I could understand`;
        debugStrs.push(msg);
      }

      return { "name": formName, "fields": jsonFieldsOnlySet };
    });

  var formsNonempty = formListJson.filter(function (f) {
    return f.fields.length > 0;
  });

  if (formsNonempty.length < formListJson.length) {
    debugStrs.push("Also, " + (formListJson.length - formsNonempty.length) +
      " forms were skipped for they had no relevant fields");
  }

  console.log(`Testofill: Saving ${formsNonempty.length} form(s) out of ${document.forms.length} at ${document.location.toString()}: `, debugStrs, "See https://github.com/holyjak/Testofill-chrome-extension/wiki/Help:-Save-forms-saved-input-from-0-forms for help");

  // A single page may contain multiple documents due to iframes so make it possible to distinguish them:
  return formsNonempty;
}

function makeQueryFrom(input) {
  return input.name ? "[name='" + input.name + "']" : "[id='" + input.id + "']";
}

function makeValueFrom(inputGrp) {
  if (inputGrp.length > 1) { // group of radio buttons
    return _.chain(inputGrp)
      .where({ checked: true })
      .pluck('value')
      .sample() // list to (the only one) single element or undefined
      .value(); // -> undefined if no match
  }

  var fieldElm = inputGrp[0];
  if (fieldElm.type === 'checkbox') {
    return fieldElm.checked;
  } else if (fieldElm.type === 'select-one') {
    return (fieldElm.selectedOptions[0] || {}).value;
  } else if (fieldElm.type === 'select-multiple') {
    return _.pluck(fieldElm.selectedOptions, 'value');
  } else {
    return fieldElm.value;
  }
}

//---------------------------------------------------------------------- LISTENERS

/** Listen for message from the popup or ctx. menu with the selected ruleSet */
function handleMessage(message, sender, sendResponseFn) {
  var fromExtension = !sender.tab;
  if (!fromExtension) return;

  var payload = message.payload;

  if (message.id === "fill_form") {
    var ruleSet = payload;
    fillForms(ruleSet);
  } else if (message.id === "get_filtered_rules") {
    matchRulesLocally(document.location.toString()).then(sendResponseFn);
    return true; // Keep channel open for async response
  } else if (message.id === "toggle_live_test") {
    createLiveTestUI();
  } else if (message.id === "save_form") {
    const { tabUrl } = payload;
    const extractedForms = makeTestofillJsonFromPageForms(tabUrl);
    // Send back to SW; we can't use sendResponseFn reliably for multiple frames/async
    if (extractedForms && extractedForms.length > 0) {
      chrome.runtime.sendMessage({
        id: 'save_form_captured',
        payload: { url: tabUrl, forms: extractedForms }
      });
    }
  } else if (message.id === "extracted_forms_saved") {
    alert("Input from " + payload.count + " forms has been saved for " + payload.url +
      (payload.count ? `\nGive it a name in the extension options if you want multiple values for the form.` : '') +
      "\n(See DevTools Console for details)");
  } else if (message.id === "extracted_forms_save_failed") {
    alert("FAILED to save " + payload.count + " forms extracted from " + payload.url + " due to " + payload.error);
  } else {
    console.log("ERROR: Unsupported message id received: " + message.id, message);
  }
}

function onColorSchemeChange(mql) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
  chrome.runtime.sendMessage({
    id: 'visual_mode_change', payload: { mode: mql.matches ? 'dark' : 'light' }
  });
}

const mql = window.matchMedia('(prefers-color-scheme: dark)')
mql.addEventListener('change', onColorSchemeChange);

// Add listeners - invoked whenever the user presses the browser action icon or when
// we (re)insert the content script => avoid adding the listener if already there
// NOTE: `chrome.runtime.onMessage.hasListener(handleMessage` always returns false?!
if (!chrome.runtime.onMessage.hasListeners()) {
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.runtime.sendMessage({ id: 'content_script_loaded' });
  onColorSchemeChange(mql);
}

// Initialize Floating UI only in Top Frame
if (window.top === window.self) {
  updateAvailableForms();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['id', 'class', 'name', 'readonly']
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes['testofill.floatingIconEnabled'] !== undefined) {
      lastMatchesHash = ""; // force update
      debouncedUpdate();
    }
  });
}
