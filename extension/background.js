// Background script for Recall Me extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Recall Me extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically due to manifest configuration
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  
  try {
    switch (command) {
      case 'open-popup':
        await handleOpenPopup();
        break;
      case 'quick-search':
        await handleQuickSearch();
        break;
      case 'toggle-study-mode':
        await handleToggleStudyMode();
        break;
      default:
        console.log('Unknown command:', command);
    }
  } catch (error) {
    console.error('Error handling command:', command, error);
  }
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

// Command handlers
async function handleOpenPopup() {
  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab && (tab.url.includes('chat.openai.com') || tab.url.includes('perplexity.ai'))) {
    // Open the popup by clicking the extension icon
    await chrome.action.openPopup();
  } else {
    // Show notification for unsupported sites
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Recall Me',
      message: 'This feature works best on ChatGPT or Perplexity pages'
    });
  }
}

async function handleQuickSearch() {
  try {
    // Get saved searches and use the most recent one
    const result = await chrome.storage.sync.get(['savedSearches', 'studyMode', 'apiUrl']);
    const savedSearches = result.savedSearches || [];
    const studyMode = result.studyMode || false;
    const apiUrl = result.apiUrl || 'http://localhost:5000';
    
    if (!studyMode) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Recall Me',
        message: 'Study mode is not enabled. Enable it first to use quick search.'
      });
      return;
    }
    
    if (savedSearches.length === 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Recall Me',
        message: 'No saved searches found. Save a search first to use quick search.'
      });
      return;
    }
    
    // Use the most recently used search
    const mostRecentSearch = savedSearches.reduce((latest, current) => {
      return new Date(current.lastUsed) > new Date(latest.lastUsed) ? current : latest;
    });
    
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && (tab.url.includes('chat.openai.com') || tab.url.includes('perplexity.ai'))) {
      // Perform the search
      await performQuickSearch(mostRecentSearch, tab);
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Recall Me',
        message: 'Quick search works best on ChatGPT or Perplexity pages'
      });
    }
  } catch (error) {
    console.error('Error in quick search:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Recall Me Error',
      message: 'Failed to perform quick search: ' + error.message
    });
  }
}

async function handleToggleStudyMode() {
  try {
    const result = await chrome.storage.sync.get(['studyMode']);
    const currentMode = result.studyMode || false;
    const newMode = !currentMode;
    
    await chrome.storage.sync.set({ studyMode: newMode });
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Recall Me',
      message: `Study mode ${newMode ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    console.error('Error toggling study mode:', error);
  }
}

async function performQuickSearch(search, tab) {
  try {
    // Show loading notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Recall Me',
      message: `Searching for: "${search.query}"...`
    });
    
    // Perform the search
    const response = await fetch(`${search.apiUrl}/search_lc?query=${encodeURIComponent(search.query)}&k=${search.k}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Check if webhook is enabled for this search
    let webhookResponse = null;
    if (search.enableAI && search.webhookUrl) {
      try {
        // Show webhook waiting notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Recall Me',
          message: `Waiting for webhook response...`
        });
        
        // Get webhook response (simplified version for background script)
        webhookResponse = await getWebhookResponseQuick(search.webhookUrl, search.query, data);
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Recall Me',
          message: `Webhook response received!`
        });
      } catch (webhookErr) {
        console.error('Webhook request failed in quick search:', webhookErr);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Recall Me Error',
          message: `Webhook failed: ${webhookErr.message}`
        });
      }
    }
    
    // Format the content
    const formattedContent = formatSearchResultsForQuickSearch(data, search.query);
    
    // Copy content to clipboard first (webhook response or RAG content)
    try {
      let contentToCopy = '';
      if (webhookResponse) {
        contentToCopy = JSON.stringify(webhookResponse, null, 2);
      } else {
        contentToCopy = formattedContent;
      }
      
      // Use chrome.scripting to copy to clipboard since background script doesn't have direct clipboard access
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: copyToClipboard,
        args: [contentToCopy]
      });
      console.log('✓ Content copied to clipboard');
      
    } catch (clipboardError) {
      console.error('Failed to copy content to clipboard:', clipboardError);
    }
    
    // Try to ensure content script is ready, then send content
    try {
      // First, try to ping the content script to see if it's ready
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      
      // If ping succeeds, send the content
      await chrome.tabs.sendMessage(tab.id, {
        action: 'pasteContent',
        content: webhookResponse ? '' : formattedContent, // Empty content if webhook response exists
        fullResponse: webhookResponse ? {} : data, // Empty full response if webhook response exists
        webhookResponse: webhookResponse || data.webhook, // Use webhook response if available
        aiResponse: null
      });
      
      console.log('✓ Content sent to content script successfully');
      
    } catch (error) {
      console.error('Content script not ready or failed to send content:', error);
      
      // Fallback: try to inject content directly
      try {
        if (webhookResponse) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: pasteWebhookResponseDirectly,
            args: [webhookResponse]
          });
          console.log('✓ Webhook response injected directly via scripting');
        } else {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: pasteRAGContentDirectly,
            args: [formattedContent]
          });
          console.log('✓ RAG content injected directly via scripting');
        }
      } catch (injectError) {
        console.error('Failed to inject content directly:', injectError);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Recall Me Error',
          message: 'Failed to paste content. Please try again or check if you\'re on a supported page.'
        });
      }
    }
    
    // Update last used time
    const result = await chrome.storage.sync.get(['savedSearches']);
    const savedSearches = result.savedSearches || [];
    const searchIndex = savedSearches.findIndex(s => s.id === search.id);
    if (searchIndex >= 0) {
      savedSearches[searchIndex].lastUsed = new Date().toISOString();
      await chrome.storage.sync.set({ savedSearches: savedSearches });
    }
    
    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Recall Me',
      message: `Found ${data.hits?.length || 0} results for: "${search.query}"`
    });
    
  } catch (error) {
    console.error('Error performing quick search:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Recall Me Error',
      message: 'Quick search failed: ' + error.message
    });
  }
}

async function getWebhookResponseQuick(webhookUrl, query, ragData) {
  console.log('Sending quick webhook request...');
  
  // Prepare the payload for the AI agent
  const payload = {
    event: 'chat_message',
    message: query,
    timestamp: new Date().toISOString(),
    session_id: 'extension_quick_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    rag_context: {
      query: query,
      hits: ragData.hits || [],
      total_results: ragData.hits?.length || 0
    }
  };
  
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`Webhook HTTP ${response.status}: ${response.statusText}`);
  }
  
  const aiData = await response.json();
  console.log('Quick webhook response:', aiData);
  
  // Handle different response formats
  if (aiData.message === "Workflow was started" || aiData.status === "processing") {
    console.log('Workflow started, polling for response...');
    
    // Simple polling for quick search (fewer attempts)
    return await pollForWebhookResponseQuick(webhookUrl, payload.session_id, 0);
  } else {
    return aiData;
  }
}

async function pollForWebhookResponseQuick(webhookUrl, sessionId, attempt = 0) {
  const maxAttempts = 10; // Fewer attempts for quick search
  const baseDelay = 3000; // Start with 3 seconds
  
  if (attempt >= maxAttempts) {
    throw new Error('Timeout waiting for webhook response');
  }
  
  const delay = baseDelay * Math.pow(1.2, attempt); // Slower backoff
  console.log(`Quick poll attempt ${attempt + 1}/${maxAttempts}, waiting ${delay}ms...`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  try {
    const pollResponse = await fetch(`${webhookUrl}?session_id=${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (pollResponse.ok) {
      const responseData = await pollResponse.json();
      
      if (responseData.status === 'completed' || responseData.message || responseData.content || responseData.response) {
        console.log('✓ Quick webhook response received:', responseData);
        return responseData;
      } else if (responseData.status === 'processing' || responseData.status === 'pending') {
        return await pollForWebhookResponseQuick(webhookUrl, sessionId, attempt + 1);
      }
    }
    
    if (attempt < maxAttempts - 1) {
      return await pollForWebhookResponseQuick(webhookUrl, sessionId, attempt + 1);
    } else {
      throw new Error('Webhook response not ready');
    }
    
  } catch (error) {
    console.log(`Quick poll attempt ${attempt + 1} failed:`, error.message);
    
    if (attempt < maxAttempts - 1) {
      return await pollForWebhookResponseQuick(webhookUrl, sessionId, attempt + 1);
    } else {
      throw error;
    }
  }
}

function formatSearchResultsForQuickSearch(data, query) {
  const hits = data.hits || [];
  
  let content = `**Quick Search: "${query}"**\n\n`;
  
  if (hits.length === 0) {
    content += "No relevant content found in your documents.\n";
    return content;
  }

  content += `Found ${hits.length} relevant results:\n\n`;

  // Add text results
  hits.forEach((hit, index) => {
    const metadata = hit.metadata || {};
    const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
    content += `**${index + 1}. Text${page}**\n`;
    content += `${hit.content}\n\n`;
  });

  content += `\n---\n*Quick search from Recall Me*`;
  
  return content;
}

// Helper function to copy content to clipboard
function copyToClipboard(content) {
  console.log('=== COPYING TO CLIPBOARD ===');
  console.log('Content length:', content.length);
  
  try {
    navigator.clipboard.writeText(content).then(() => {
      console.log('✓ Content copied to clipboard successfully');
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
    });
  } catch (error) {
    console.error('Clipboard API not available:', error);
  }
}

// Fallback functions for direct content injection when content script is not available
function pasteWebhookResponseDirectly(webhookResponse) {
  console.log('=== DIRECT WEBHOOK RESPONSE INJECTION (BACKGROUND) ===');
  console.log('Webhook response:', webhookResponse);
  
  // Copy to clipboard first
  try {
    const webhookContent = JSON.stringify(webhookResponse, null, 2);
    navigator.clipboard.writeText(webhookContent).then(() => {
      console.log('✓ Webhook response copied to clipboard (background)');
    }).catch(err => {
      console.error('Failed to copy webhook response to clipboard (background):', err);
    });
  } catch (error) {
    console.error('Clipboard API not available (background):', error);
  }
  
  // Find the textarea/input element
  let textarea = document.querySelector('textarea[placeholder*="Message"]') || 
                 document.querySelector('textarea[placeholder*="message"]') ||
                 document.querySelector('textarea[data-id="root"]') ||
                 document.querySelector('textarea[placeholder*="Send a message"]') ||
                 document.querySelector('textarea[placeholder*="Type a message"]') ||
                 document.querySelector('div[contenteditable="true"]') ||
                 document.querySelector('textarea');

  // Try to find Perplexity textarea
  if (!textarea) {
    textarea = document.querySelector('textarea[placeholder*="Ask anything"]') ||
               document.querySelector('textarea[placeholder*="ask"]') ||
               document.querySelector('textarea[placeholder*="Ask"]') ||
               document.querySelector('div[contenteditable="true"][role="textbox"]') ||
               document.querySelector('div[contenteditable="true"]') ||
               document.querySelector('[data-testid="search-input"]') ||
               document.querySelector('[data-testid="composer-input"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="Ask"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="ask"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="message"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="Message"]') ||
               document.querySelector('div[contenteditable="true"][data-testid*="input"]') ||
               document.querySelector('div[contenteditable="true"][data-testid*="composer"]');
  }

  console.log('Found textarea:', textarea);

  if (textarea) {
    console.log('Textarea type:', textarea.tagName, 'Contenteditable:', textarea.contentEditable);
    
    // Focus the element
    textarea.focus();
    
    // Clear any existing content
    if (textarea.tagName === 'TEXTAREA') {
      textarea.value = '';
    } else {
      textarea.textContent = '';
      textarea.innerHTML = '';
    }
    
    // Set the webhook response as JSON
    const webhookContent = JSON.stringify(webhookResponse, null, 2);
    
    if (textarea.contentEditable === 'true') {
      textarea.textContent = webhookContent;
    } else if (textarea.tagName === 'TEXTAREA') {
      textarea.value = webhookContent;
    }
    
    // Trigger events to ensure the app recognizes the change
    const events = ['input', 'change', 'keyup', 'keydown', 'paste', 'compositionend'];
    events.forEach(eventType => {
      textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });

    // For Perplexity, also try triggering focus events
    textarea.dispatchEvent(new Event('focus', { bubbles: true }));
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    textarea.focus();

    console.log('✓ Webhook response injected directly (background)');
    return true;
  }
  
  console.log('No suitable textarea found for direct injection (background)');
  return false;
}

function pasteRAGContentDirectly(content) {
  console.log('=== DIRECT RAG CONTENT INJECTION (BACKGROUND) ===');
  console.log('Content length:', content.length);
  
  // Find the textarea/input element
  let textarea = document.querySelector('textarea[placeholder*="Message"]') || 
                 document.querySelector('textarea[placeholder*="message"]') ||
                 document.querySelector('textarea[data-id="root"]') ||
                 document.querySelector('textarea[placeholder*="Send a message"]') ||
                 document.querySelector('textarea[placeholder*="Type a message"]') ||
                 document.querySelector('div[contenteditable="true"]') ||
                 document.querySelector('textarea');

  // Try to find Perplexity textarea
  if (!textarea) {
    textarea = document.querySelector('textarea[placeholder*="Ask anything"]') ||
               document.querySelector('textarea[placeholder*="ask"]') ||
               document.querySelector('textarea[placeholder*="Ask"]') ||
               document.querySelector('div[contenteditable="true"][role="textbox"]') ||
               document.querySelector('div[contenteditable="true"]') ||
               document.querySelector('[data-testid="search-input"]') ||
               document.querySelector('[data-testid="composer-input"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="Ask"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="ask"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="message"]') ||
               document.querySelector('div[contenteditable="true"][aria-label*="Message"]') ||
               document.querySelector('div[contenteditable="true"][data-testid*="input"]') ||
               document.querySelector('div[contenteditable="true"][data-testid*="composer"]');
  }

  console.log('Found textarea:', textarea);

  if (textarea) {
    console.log('Textarea type:', textarea.tagName, 'Contenteditable:', textarea.contentEditable);
    
    // Focus the element
    textarea.focus();
    
    // Clear any existing content
    if (textarea.tagName === 'TEXTAREA') {
      textarea.value = '';
    } else {
      textarea.textContent = '';
      textarea.innerHTML = '';
    }
    
    if (textarea.contentEditable === 'true') {
      textarea.textContent = content;
    } else if (textarea.tagName === 'TEXTAREA') {
      textarea.value = content;
    }
    
    // Trigger events to ensure the app recognizes the change
    const events = ['input', 'change', 'keyup', 'keydown', 'paste', 'compositionend'];
    events.forEach(eventType => {
      textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });

    // For Perplexity, also try triggering focus events
    textarea.dispatchEvent(new Event('focus', { bubbles: true }));
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    textarea.focus();

    console.log('✓ RAG content injected directly (background)');
    return true;
  }
  
  console.log('No suitable textarea found for direct injection (background)');
  return false;
}
