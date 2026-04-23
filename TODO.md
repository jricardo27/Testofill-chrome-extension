# TODO


## Permissions [OUTDATED]

The `tabs`permission gives a warning about having access to the browsing history.

* Consider making `tabs` optional =>
  * being able to update browser action icon when accessing a url - but it does not work well anyway
  * not being able to auto-fill until the ext. has been manually invoked at least once in the tab - 
    could add a shortcut such as Alt+F to fill in, then it would be auto - see https://developer.chrome.com/docs/extensions/reference/api/commands
    Check https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/functional-samples/sample.optional_permissions/newtab.js for
    checking, requesting permissions

FYI: activeTab gives you:

* Call runtime.executeScript or runtime.insertCSS on that tab.
* Get the URL, title, and favicon for that tab via an API that returns a tabs.Tab object (essentially, activeTab grants the tabs permission temporarily).

## Generative

* Use $ to prefix fns
* Import chance fns w/o 'chance.' prefix, add identity and concat
* Integrate generative into options and -run scripts
* Make parse return a fn that will be called by -run when filling in the form inst. of a value
* Brief docs
* Options: add 'Powered by' chance, sizzle, _, jsoneditor, Ace

## Other

* Make browser action icon more reliable
* Better logging of save form when not matches
* Make it work with forms using React - trigger events it listens to; experiment with http://jsfiddle.net/zcz1p35n/4/ 

## Proposed Improvements & Refactorings

### Code Architecture
- [ ] **Registry-based Placeholders**: Refactor `processPlaceholders` in `testofill-run.js` to use a registry/map of generator functions instead of a large `if/else` or `replace` chain.
- [ ] **Centralized State Management**: Move concurrency locking (mutex) into `rules-store.js` to protect against race conditions from ALL writers (Options page, Service Worker, content scripts if any).
- [ ] **UI Componentization**: Decouple the Floating UI from the main form-filling logic in `testofill-run.js`. Use a cleaner template system or a small UI controller.
- [ ] **Inconsistent API usage**: Standardize on using `sendMessageToContentScript` helper from `integrations.js` throughout the service worker (currently `processWorkflowStep` calls `chrome.tabs.sendMessage` directly).

### Extra Functionality
- [ ] **Rules Import/Export**: Add buttons in the Options page to export/import JSON configurations to/from files.
- [ ] **Regex URL Tester**: Add a small utility in the Options page to test if a URL matches a specific `urlPattern`.
- [ ] **Cross-Field References**: Support placeholders that reference other field values on the page (e.g., `{fields['#username'].value}`).
- [ ] **Custom JS Generators**: Allow restricted JavaScript expressions for complex value generation in the rule definitions.

### Reliability & Performance
- [ ] **MutationObserver Tuning**: Optimize the observer in `testofill-run.js` to ignore changes made by Testofill's own UI and reduce irrelevant re-renders.
- [ ] **Latency Investigation**: Research and fix the reported 5-second latency on complex forms (check if it's due to regex overhead or DOM traversal).
- [ ] **Shadow DOM Support**: Extend Sizzle or add logic to support finding elements inside Shadow DOM.
- [ ] **Persistence Reliability**: Ensure `chrome.storage.local.set` failures (quota etc.) are clearly reported in the UI, not just logged to console.
