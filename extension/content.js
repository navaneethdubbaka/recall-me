// Content script for Recall Me extension
// Runs on ChatGPT and Perplexity pages

console.log('Recall Me content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    // Respond to ping to confirm content script is ready
    sendResponse({ ready: true });
  } else if (request.action === 'selectAllChatText') {
    const success = selectAllChatText();
    sendResponse({ success });
  } else if (request.action === 'getAllChatText') {
    const chatText = getAllChatText();
    sendResponse({ chatText });
  } else if (request.action === 'debugPageElements') {
    debugPageElements();
    sendResponse({ success: true });
  } else if (request.action === 'pasteAgentResponse') {
    const success = pasteAgentResponse(request.content, request.query);
    sendResponse({ success });
  }
});



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

function selectAllChatText() {
  console.log('Selecting all chat text...');
  console.log('Current URL:', window.location.href);
  
  try {
    // More comprehensive and up-to-date selectors for ChatGPT and Perplexity
    const chatSelectors = [
      // ChatGPT selectors (updated for current version)
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
      '[data-message-author-role="system"]',
      '.group\\/conversation-turn',
      '.markdown',
      '.prose',
      '.whitespace-pre-wrap',
      '[class*="markdown"]',
      '[class*="prose"]',
      '[class*="message"]',
      '[class*="conversation"]',
      // Perplexity selectors (updated)
      '[data-testid="conversation-turn"]',
      '[data-testid="message"]',
      '[data-testid="chat-message"]',
      '.prose',
      '.markdown',
      '[class*="prose"]',
      '[class*="markdown"]',
      '[class*="message"]',
      // Generic selectors
      '[role="article"]',
      '[role="main"]',
      '.message',
      '.chat-message',
      '.conversation-item',
      '.chat-item',
      // Fallback selectors for any text content
      'p',
      'div[class*="text"]',
      'span[class*="text"]'
    ];
    
    let allText = '';
    let selectedElements = [];
    let foundSelectors = [];
    
    // Try to find chat content using various selectors
    for (const selector of chatSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          foundSelectors.push(selector);
          
          elements.forEach(element => {
            const text = element.textContent || element.innerText;
            if (text && text.trim().length > 0) {
              // Avoid duplicates by checking if this text is already included
              if (!allText.includes(text.trim())) {
                allText += text.trim() + '\n\n';
                selectedElements.push(element);
              }
            }
          });
        }
      } catch (selectorError) {
        console.log(`Error with selector ${selector}:`, selectorError);
      }
    }
    
    // If no specific chat elements found, try a more aggressive approach
    if (!allText.trim()) {
      console.log('No specific chat elements found, trying broader approach...');
      
      // Look for any divs with substantial text content
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const text = div.textContent || div.innerText;
        if (text && text.trim().length > 50) { // Only consider substantial text blocks
          // Check if this looks like chat content (not navigation, buttons, etc.)
          const hasChatKeywords = /(user|assistant|chat|message|conversation|ai|gpt|perplexity)/i.test(text);
          const isNotNavigation = !div.closest('nav, header, footer, [role="navigation"]');
          
          if (hasChatKeywords && isNotNavigation && !allText.includes(text.trim())) {
            allText += text.trim() + '\n\n';
            selectedElements.push(div);
          }
        }
      }
    }
    
    console.log(`Found selectors: ${foundSelectors.join(', ')}`);
    console.log(`Total text length: ${allText.length}`);
    console.log(`Selected elements: ${selectedElements.length}`);
    
    if (allText.trim()) {
      // Create a temporary textarea to hold all the text
      const tempTextarea = document.createElement('textarea');
      tempTextarea.value = allText.trim();
      tempTextarea.style.position = 'fixed';
      tempTextarea.style.left = '-9999px';
      tempTextarea.style.top = '-9999px';
      tempTextarea.style.opacity = '0';
      document.body.appendChild(tempTextarea);
      
      // Select all text in the textarea
      tempTextarea.focus();
      tempTextarea.select();
      tempTextarea.setSelectionRange(0, tempTextarea.value.length);
      
      // Copy to clipboard using modern API
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(allText.trim()).then(() => {
            console.log('✓ All chat text copied to clipboard (modern API)');
          }).catch(err => {
            console.error('Modern clipboard API failed:', err);
            // Fallback to execCommand
            const success = document.execCommand('copy');
            if (success) {
              console.log('✓ All chat text copied to clipboard (execCommand fallback)');
            }
          });
        } else {
          // Fallback to execCommand
          const success = document.execCommand('copy');
          if (success) {
            console.log('✓ All chat text copied to clipboard (execCommand)');
          } else {
            throw new Error('execCommand failed');
          }
        }
      } catch (err) {
        console.error('Failed to copy text:', err);
        // Try alternative method
        try {
          const success = document.execCommand('copy');
          if (success) {
            console.log('✓ All chat text copied to clipboard (fallback)');
          }
        } catch (fallbackErr) {
          console.error('Fallback copy also failed:', fallbackErr);
        }
      }
      
      // Remove temporary textarea
      document.body.removeChild(tempTextarea);
      
      // Also try to select the actual chat elements visually
      if (selectedElements.length > 0) {
        try {
          const selection = window.getSelection();
          selection.removeAllRanges();
          
          const range = document.createRange();
          range.selectNodeContents(selectedElements[0]);
          
          // Extend selection to include all elements
          for (let i = 1; i < selectedElements.length; i++) {
            try {
              range.setEndAfter(selectedElements[i]);
            } catch (rangeError) {
              console.log('Error extending range:', rangeError);
            }
          }
          
          selection.addRange(range);
          console.log('✓ Chat elements selected visually');
        } catch (selectionError) {
          console.log('Error with visual selection:', selectionError);
        }
      }
      
      return true;
    } else {
      console.log('No chat text found with any selector');
      console.log('Available elements on page:', document.querySelectorAll('*').length);
      return false;
    }
  } catch (error) {
    console.error('Error selecting chat text:', error);
    return false;
  }
}

function getAllChatText() {
  console.log('Getting all chat text...');
  console.log('Current URL:', window.location.href);
  
  try {
    // More comprehensive and up-to-date selectors for ChatGPT and Perplexity
    const chatSelectors = [
      // ChatGPT selectors (updated for current version)
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]',
      '[data-message-author-role="system"]',
      '.group\\/conversation-turn',
      '.markdown',
      '.prose',
      '.whitespace-pre-wrap',
      '[class*="markdown"]',
      '[class*="prose"]',
      '[class*="message"]',
      '[class*="conversation"]',
      // Perplexity selectors (updated)
      '[data-testid="conversation-turn"]',
      '[data-testid="message"]',
      '[data-testid="chat-message"]',
      '.prose',
      '.markdown',
      '[class*="prose"]',
      '[class*="markdown"]',
      '[class*="message"]',
      // Generic selectors
      '[role="article"]',
      '[role="main"]',
      '.message',
      '.chat-message',
      '.conversation-item',
      '.chat-item',
      // Fallback selectors for any text content
      'p',
      'div[class*="text"]',
      'span[class*="text"]'
    ];
    
    let allText = '';
    let foundSelectors = [];
    
    // Try to find chat content using various selectors
    for (const selector of chatSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          foundSelectors.push(selector);
          
          elements.forEach(element => {
            const text = element.textContent || element.innerText;
            if (text && text.trim().length > 0) {
              // Avoid duplicates by checking if this text is already included
              if (!allText.includes(text.trim())) {
                allText += text.trim() + '\n\n';
              }
            }
          });
        }
      } catch (selectorError) {
        console.log(`Error with selector ${selector}:`, selectorError);
      }
    }
    
    // If no specific chat elements found, try a more aggressive approach
    if (!allText.trim()) {
      console.log('No specific chat elements found, trying broader approach...');
      
      // Look for any divs with substantial text content
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const text = div.textContent || div.innerText;
        if (text && text.trim().length > 50) { // Only consider substantial text blocks
          // Check if this looks like chat content (not navigation, buttons, etc.)
          const hasChatKeywords = /(user|assistant|chat|message|conversation|ai|gpt|perplexity)/i.test(text);
          const isNotNavigation = !div.closest('nav, header, footer, [role="navigation"]');
          
          if (hasChatKeywords && isNotNavigation && !allText.includes(text.trim())) {
            allText += text.trim() + '\n\n';
          }
        }
      }
    }
    
    console.log(`Found selectors: ${foundSelectors.join(', ')}`);
    console.log(`Total text length: ${allText.length}`);
    
    if (allText.trim()) {
      console.log(`✓ Retrieved ${allText.length} characters of chat text`);
      return allText.trim();
    } else {
      console.log('No chat text found with any selector');
      console.log('Available elements on page:', document.querySelectorAll('*').length);
      return '';
    }
  } catch (error) {
    console.error('Error getting chat text:', error);
    return '';
  }
}

// Debug function to help troubleshoot page elements
function debugPageElements() {
  console.log('=== PAGE DEBUG INFO ===');
  console.log('URL:', window.location.href);
  console.log('Title:', document.title);
  console.log('Total elements:', document.querySelectorAll('*').length);
  
  // Check for common chat-related elements
  const commonSelectors = [
    '[data-message-author-role]',
    '[data-testid*="message"]',
    '[data-testid*="conversation"]',
    '[class*="message"]',
    '[class*="chat"]',
    '[class*="conversation"]',
    '[role="article"]',
    '[role="main"]',
    'p',
    'div'
  ];
  
  commonSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} elements with selector: ${selector}`);
      if (elements.length <= 5) {
        elements.forEach((el, i) => {
          const text = el.textContent?.substring(0, 100) || '';
          console.log(`  [${i}] Text preview: "${text}..."`);
        });
      }
    }
  });
  
  // Look for any elements with substantial text
  const allDivs = document.querySelectorAll('div');
  let textDivs = [];
  allDivs.forEach(div => {
    const text = div.textContent || div.innerText;
    if (text && text.trim().length > 100) {
      textDivs.push({
        element: div,
        text: text.substring(0, 200) + '...',
        length: text.length
      });
    }
  });
  
  console.log(`Found ${textDivs.length} divs with substantial text (>100 chars)`);
  textDivs.slice(0, 5).forEach((item, i) => {
    console.log(`  Text div [${i}]: ${item.length} chars - "${item.text}"`);
  });
  
  console.log('=== END DEBUG INFO ===');
}

// Make debug function available globally for testing
window.debugRecallMe = debugPageElements;

function pasteAgentResponse(content, query) {
  console.log('Pasting agent response to chat...');
  console.log('Content length:', content.length);
  console.log('Query:', query);
  
  try {
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
      
      // Set the agent response content
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

      console.log('✓ Agent response pasted to chat');
      return true;
    } else {
      console.log('No suitable textarea found for pasting');
      return false;
    }
  } catch (error) {
    console.error('Error pasting agent response:', error);
    return false;
  }
}
