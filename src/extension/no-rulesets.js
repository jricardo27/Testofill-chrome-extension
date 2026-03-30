document.addEventListener('DOMContentLoaded', function() {
  var paramStr = document.location.search;
  var idx = paramStr.indexOf('url=');
  if (idx >= 0) {
    var url = paramStr.substring(idx + 4);
    document.getElementById('url').textContent = ' ' + url;
  }

  // Toggle Floating Icon
  const toggleIconCB = document.getElementById('toggleFloatingIcon');
  if (toggleIconCB) {
    chrome.storage.local.get(['testofill.floatingIconEnabled'], (res) => {
      toggleIconCB.checked = res['testofill.floatingIconEnabled'] !== false;
    });
    toggleIconCB.addEventListener('change', (e) => {
      chrome.storage.local.set({ 'testofill.floatingIconEnabled': e.target.checked });
    });
  }
});
