// Content script for Recall Me extension
// Runs on ChatGPT and Perplexity pages

console.log('Recall Me content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pasteContent') {
    const success = pasteToChat(request.content, request.fullResponse, request.webhookResponse);
    sendResponse({ success });
  }
});

function pasteToChat(content, fullResponse = {}, webhookResponse = {}) {
  console.log('=== CONTENT SCRIPT DEBUG ===');
  console.log('Attempting to paste content:', content.substring(0, 100) + '...');
  console.log('Full content length:', content.length);
  console.log('Full response keys:', Object.keys(fullResponse));
  console.log('Webhook response:', webhookResponse);
  console.log('Full content received:', content);
  
  // More comprehensive selectors for ChatGPT
  let textarea = document.querySelector('textarea[placeholder*="Message"]') || 
                 document.querySelector('textarea[placeholder*="message"]') ||
                 document.querySelector('textarea[data-id="root"]') ||
                 document.querySelector('textarea[placeholder*="Send a message"]') ||
                 document.querySelector('textarea[placeholder*="Type a message"]') ||
                 document.querySelector('div[contenteditable="true"]') ||
                 document.querySelector('textarea');

  // Try to find Perplexity textarea - more specific selectors
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
    
    // Handle contenteditable divs (ChatGPT, Perplexity)
    if (textarea.contentEditable === 'true') {
      console.log('Processing contenteditable div...');
      
      // Clear existing content first
      textarea.innerHTML = '';
      
      // Create complete content with webhook response
      let completeContent = content;
      
      // Add webhook response if available
      if (webhookResponse && Object.keys(webhookResponse).length > 0) {
        console.log('Adding webhook response...');
        completeContent += '\n\n--- WEBHOOK RESPONSE ---\n';
        completeContent += JSON.stringify(webhookResponse, null, 2);
        console.log('✓ Webhook response added');
      }
      
      // Add full response metadata if available
      if (fullResponse && Object.keys(fullResponse).length > 0) {
        console.log('Adding full response metadata...');
        completeContent += '\n\n--- FULL RESPONSE METADATA ---\n';
        
        // Add key information from full response
        if (fullResponse.hits) {
          completeContent += `\nHits: ${fullResponse.hits.length} results found\n`;
        }
        if (fullResponse.image_paths) {
          completeContent += `Image Paths: ${Object.keys(fullResponse.image_paths).length} image paths\n`;
        }
        
        // Add the complete response as JSON
        completeContent += '\nComplete Response:\n';
        completeContent += JSON.stringify(fullResponse, null, 2);
        
        console.log('✓ Full response metadata added');
      }
      
      // Set the complete content as text (no HTML processing needed since it's text-only)
      console.log('Setting complete content...');
      textarea.textContent = completeContent;
      console.log('✓ Complete content injected successfully');
      
    } else if (textarea.tagName === 'TEXTAREA') {
      // For regular textareas, create complete content
      let completeContent = content;
      
      if (webhookResponse && Object.keys(webhookResponse).length > 0) {
        completeContent += '\n\n--- WEBHOOK RESPONSE ---\n';
        completeContent += JSON.stringify(webhookResponse, null, 2);
      }
      
      if (fullResponse && Object.keys(fullResponse).length > 0) {
        completeContent += '\n\n--- FULL RESPONSE METADATA ---\n';
        completeContent += JSON.stringify(fullResponse, null, 2);
      }
      
      textarea.value = completeContent;
    }
    
    // Trigger multiple events to ensure the app recognizes the change
    const events = ['input', 'change', 'keyup', 'keydown', 'paste', 'compositionend'];
    events.forEach(eventType => {
      textarea.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });

    // For Perplexity, also try triggering focus events
    textarea.dispatchEvent(new Event('focus', { bubbles: true }));
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    textarea.focus();

    // Try to trigger a paste event to make ChatGPT recognize the content
    setTimeout(() => {
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      });
      textarea.dispatchEvent(pasteEvent);
    }, 100);

    console.log('Content pasted successfully');
    return true;
  }
  
  console.log('No suitable textarea found');
  return false;
}

function simulateTyping(element, text) {
  console.log('Simulating typing for Perplexity...');
  
  // Focus the element first
  element.focus();
  
  // Clear existing content
  element.textContent = '';
  element.innerHTML = '';
  
  // Simulate typing character by character with small delays
  let index = 0;
  const typeInterval = setInterval(() => {
    if (index < text.length) {
      const char = text[index];
      element.textContent += char;
      
      // Trigger input event for each character
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      index++;
    } else {
      clearInterval(typeInterval);
      
      // Final events
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('keyup', { bubbles: true }));
      
      console.log('Typing simulation complete');
    }
  }, 10); // 10ms delay between characters
}

// Add visual indicator when study mode is active
function addStudyModeIndicator() {
  chrome.storage.sync.get(['studyMode'], (result) => {
    if (result.studyMode) {
      // Add a small indicator to show study mode is active
      const indicator = document.createElement('div');
      indicator.id = 'recall-me-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #4f46e5;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 10000;
        pointer-events: none;
      `;
      indicator.textContent = '📚 Study Mode';
      document.body.appendChild(indicator);
    }
  });
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addStudyModeIndicator);
} else {
  addStudyModeIndicator();
}
