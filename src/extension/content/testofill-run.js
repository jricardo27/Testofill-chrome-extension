/**
 * The Content Script injected into the browser document and
 * invoked by messages from the extension (via event.js).
 * @type {String}
 */

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

  // {random4}
  value = value.replace(/{random4}/g, () => Math.floor(1000 + Math.random() * 9000));

  // {random6}
  value = value.replace(/{random6}/g, () => Math.floor(100000 + Math.random() * 900000));

  // {phoneUS} - Special generator: +1500yxxxxxx where y ≠ 2
  if (value.includes('{phoneUS}')) {
    const y = "013456789"[Math.floor(Math.random() * 9)];
    const rest = Math.random().toString().slice(2, 8); // 6 random digits
    const phone = `+1500${y}${rest}`;
    await chrome.storage.local.set({ 'testofill.lastPhoneUS': phone });
    value = value.replace(/{phoneUS}/g, phone);
  }

  // {phoneUSLocal} - Special generator: 500yxxxxxx where y ≠ 2
  if (value.includes('{phoneUSLocal}')) {
    const y = "013456789"[Math.floor(Math.random() * 9)];
    const rest = Math.random().toString().slice(2, 8); // 6 random digits
    const phone = `500${y}${rest}`;
    await chrome.storage.local.set({ 'testofill.lastPhoneUS': phone });
    value = value.replace(/{phoneUSLocal}/g, phone);
  }

  // {lastPhoneUS6} - Retrieve last 6 digits of the last generated US phone
  if (value.includes('{lastPhoneUS6}')) {
    const data = await chrome.storage.local.get('testofill.lastPhoneUS');
    const lastPhone = data['testofill.lastPhoneUS'] || "";
    const last6 = lastPhone.slice(-6);
    value = value.replace(/{lastPhoneUS6}/g, last6);
  }

  // {lastPhoneUSDigit:N} - Get the N-th digit (0-5) of the last 6 digits
  if (value.includes('{lastPhoneUSDigit:')) {
    const data = await chrome.storage.local.get('testofill.lastPhoneUS');
    const lastPhone = data['testofill.lastPhoneUS'] || "";
    const last6 = lastPhone.slice(-6);
    value = value.replace(/{lastPhoneUSDigit:(\d)}/g, (match, digit) => {
      const idx = parseInt(digit, 10);
      return last6[idx] || "";
    });
  }

  // Random names using Chance.js (if available)
  if (typeof chance !== 'undefined') {
    value = value.replace(/{firstName}/g, () => chance.first());
    value = value.replace(/{lastName}/g, () => chance.last());
    value = value.replace(/{fullName}/g, () => chance.name());
  }

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
    if (fieldElm.value === valueToFill) return;
    fieldElm.dispatchEvent(new Event('focus', { bubbles: true }));
    fieldElm.value = valueToFill;
    fieldElm.dispatchEvent(new Event('change', { 'view': window, 'bubbles': true }));
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
    fieldElm.dispatchEvent(new Event('focus', { bubbles: true }));
    fieldElm.value = valueToFill;
    fieldElm.dispatchEvent(new Event('input', { bubbles: true }));
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
