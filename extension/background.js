// Background script for Recall Me extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Recall Me extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically due to manifest configuration
});

// Listen for storage changes to update content scripts
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.studyMode) {
    // Notify content scripts about study mode changes
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && (tab.url.includes('chat.openai.com') || tab.url.includes('perplexity.ai'))) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'studyModeChanged',
            studyMode: changes.studyMode.newValue
          }).catch(() => {
            // Ignore errors for tabs that don't have content script
          });
        }
      });
    });
  }
});
