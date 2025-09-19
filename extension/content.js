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
  } else if (request.action === 'testTextExtraction') {
    const testText = 'This is a test message from the Recall Me extension. If you can see this, the extension is working correctly.';
    sendResponse({ chatText: testText });
  } else if (request.action === 'toggleFloatingButton') {
    const existingButton = document.getElementById('recall-me-floating-btn');
    if (existingButton) {
      existingButton.remove();
      sendResponse({ visible: false });
    } else {
      addFloatingButton();
      sendResponse({ visible: true });
    }
  } else if (request.action === 'forceAddFloatingButton') {
    console.log('Force adding floating button...');
    addFloatingButton();
    const buttonExists = document.getElementById('recall-me-floating-btn') !== null;
    sendResponse({ success: buttonExists, message: buttonExists ? 'Button added successfully' : 'Failed to add button' });
  } else if (request.action === 'testPdfGeneration') {
    console.log('Testing PDF generation...');
    try {
      const testText = 'This is a test PDF generation.\n\nIt should create a proper PDF file with this content.\n\nIf you see this, the PDF generation is working correctly!';
      generateAndDownloadPDF(testText);
      sendResponse({ success: true, message: 'PDF test initiated' });
    } catch (error) {
      console.error('PDF test failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
});



// Add floating action button
function addFloatingButton() {
  console.log('Adding floating button...');
  console.log('Current URL:', window.location.href);
  
  // Remove existing button if it exists
  const existingButton = document.getElementById('recall-me-floating-btn');
  if (existingButton) {
    existingButton.remove();
  }

  // Create floating button
  const floatingBtn = document.createElement('div');
  floatingBtn.id = 'recall-me-floating-btn';
  floatingBtn.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
      cursor: pointer;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      transition: all 0.3s ease;
      border: 2px solid rgba(255, 255, 255, 0.2);
    " onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 20px rgba(79, 70, 229, 0.6)'" 
       onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(79, 70, 229, 0.4)'">
      📚
    </div>
  `;

  // Add click handler - Convert to PDF
  floatingBtn.addEventListener('click', async () => {
    try {
      // Show loading state
      const btn = floatingBtn.querySelector('div');
      const originalContent = btn.innerHTML;
      btn.innerHTML = '⏳';
      btn.style.background = '#6b7280';

      // Get all chat text
      const chatText = getAllChatText();
      
      if (chatText && chatText.trim()) {
        // Generate and download PDF
        await generateAndDownloadPDF(chatText);
        
        // Show success state
        btn.innerHTML = '📄';
        btn.style.background = '#059669';
        
        // Show success message
        showFloatingMessage('PDF downloaded!', 'success');
        
        // Reset button after 2 seconds
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
        }, 2000);
      } else {
        // Show error state
        btn.innerHTML = '❌';
        btn.style.background = '#ef4444';
        showFloatingMessage('No chat text found', 'error');
        
        // Reset button after 2 seconds
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
        }, 2000);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      const btn = floatingBtn.querySelector('div');
      btn.innerHTML = '❌';
      btn.style.background = '#ef4444';
      showFloatingMessage('Failed to generate PDF', 'error');
      
      // Reset button after 2 seconds
      setTimeout(() => {
        btn.innerHTML = '📚';
        btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
      }, 2000);
    }
  });

  // Add right-click handler for clipboard copy
  floatingBtn.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    
    try {
      const btn = floatingBtn.querySelector('div');
      const originalContent = btn.innerHTML;
      btn.innerHTML = '⏳';
      btn.style.background = '#6b7280';

      // Get all chat text
      const chatText = getAllChatText();
      
      if (chatText && chatText.trim()) {
        // Copy to clipboard
        await navigator.clipboard.writeText(chatText);
        
        // Show success state
        btn.innerHTML = '✅';
        btn.style.background = '#10b981';
        showFloatingMessage('Chat copied to clipboard!', 'success');
        
        // Reset button after 2 seconds
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
        }, 2000);
      } else {
        btn.innerHTML = '❌';
        btn.style.background = '#ef4444';
        showFloatingMessage('No chat text found', 'error');
        
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
        }, 2000);
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      const btn = floatingBtn.querySelector('div');
      btn.innerHTML = '❌';
      btn.style.background = '#ef4444';
      showFloatingMessage('Failed to copy to clipboard', 'error');
      
      setTimeout(() => {
        btn.innerHTML = '📚';
        btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
      }, 2000);
    }
  });

  document.body.appendChild(floatingBtn);
}

// Show floating message
function showFloatingMessage(message, type) {
  // Remove existing message
  const existingMessage = document.getElementById('recall-me-message');
  if (existingMessage) {
    existingMessage.remove();
  }

  const messageDiv = document.createElement('div');
  messageDiv.id = 'recall-me-message';
  messageDiv.style.cssText = `
    position: fixed;
    top: 90px;
    right: 20px;
    background: ${type === 'success' ? '#10b981' : '#ef4444'};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    max-width: 200px;
    word-wrap: break-word;
    animation: slideIn 0.3s ease;
  `;
  
  messageDiv.textContent = message;
  document.body.appendChild(messageDiv);

  // Add CSS animation
  if (!document.getElementById('recall-me-styles')) {
    const style = document.createElement('style');
    style.id = 'recall-me-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // Remove message after 3 seconds
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.remove();
    }
  }, 3000);
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
function initializeExtension() {
  console.log('Initializing Recall Me extension...');
  addStudyModeIndicator();
  addFloatingButton();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// For ChatGPT, also try to add the button after a delay since it loads content dynamically
if (window.location.href.includes('chat.openai.com') || window.location.href.includes('chatgpt.com')) {
  console.log('ChatGPT detected, adding delayed initialization...');
  setTimeout(() => {
    console.log('Delayed initialization for ChatGPT...');
    addFloatingButton();
  }, 2000);
  
  // Also try after 5 seconds in case the page is still loading
  setTimeout(() => {
    console.log('Second delayed initialization for ChatGPT...');
    addFloatingButton();
  }, 5000);
  
  // Use MutationObserver to detect when ChatGPT loads new content
  const observer = new MutationObserver((mutations) => {
    let shouldAddButton = false;
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if new content was added
        for (let node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Look for chat-related elements
            if (node.querySelector && (
              node.querySelector('[data-message-author-role]') ||
              node.querySelector('.markdown') ||
              node.querySelector('.prose') ||
              node.textContent?.includes('ChatGPT')
            )) {
              shouldAddButton = true;
              break;
            }
          }
        }
      }
    });
    
    if (shouldAddButton) {
      console.log('ChatGPT content detected, ensuring button is present...');
      addFloatingButton();
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('ChatGPT MutationObserver started');
}

function selectAllChatText() {
  console.log('Selecting all chat text...');
  console.log('Current URL:', window.location.href);
  
  try {
    // Get all chat text first
    const allText = getAllChatText();
    
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
  console.log('Page title:', document.title);
  
  try {
    // Simple and direct approach - get all visible text content
    let allText = '';
    
    // Method 1: Try to get text from main content areas
    const mainSelectors = [
      'main',
      '[role="main"]',
      '.main',
      '#main',
      '.content',
      '#content',
      '.chat-container',
      '.conversation',
      '.messages',
      '.chat-messages'
    ];
    
    let mainContent = null;
    for (const selector of mainSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainContent = element;
        console.log(`Found main content with selector: ${selector}`);
        break;
      }
    }
    
    if (!mainContent) {
      mainContent = document.body;
      console.log('Using document.body as main content');
    }
    
    // Method 2: Get all text nodes from the main content
    const textNodes = [];
    const walker = document.createTreeWalker(
      mainContent,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const text = node.textContent.trim();
          // Skip very short text, navigation, buttons, inputs
          if (text.length < 5) return NodeFilter.FILTER_REJECT;
          if (node.parentElement.closest('nav, header, footer, button, input, textarea, script, style')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node.textContent.trim());
    }
    
    console.log(`Found ${textNodes.length} text nodes`);
    
    // Method 3: Also try specific chat selectors as backup
    const chatSelectors = [
      '[data-message-author-role]',
      '[data-testid*="message"]',
      '[data-testid*="conversation"]',
      '[class*="message"]',
      '[class*="conversation"]',
      '[class*="chat"]',
      '[class*="turn"]',
      '.markdown',
      '.prose'
    ];
    
    let chatElements = [];
    for (const selector of chatSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
        chatElements.push(...elements);
      }
    }
    
    // Combine text from chat elements
    let chatText = '';
    chatElements.forEach(element => {
      const text = element.textContent || element.innerText;
      if (text && text.trim().length > 10) {
        chatText += text.trim() + '\n\n';
      }
    });
    
    // Use chat text if available, otherwise use all text nodes
    if (chatText.trim()) {
      allText = chatText.trim();
      console.log(`Using chat-specific text: ${allText.length} characters`);
    } else {
      allText = textNodes.join('\n\n');
      console.log(`Using all text nodes: ${allText.length} characters`);
    }
    
    // Clean up the text
    allText = allText.replace(/\s+/g, ' ').trim();
    
    // Method 4: If still no text, try a very broad approach
    if (!allText || allText.length < 50) {
      console.log('Trying very broad text extraction...');
      
      // Get all divs and paragraphs with substantial text
      const allElements = document.querySelectorAll('div, p, span, article, section, h1, h2, h3, h4, h5, h6');
      const textParts = [];
      
      allElements.forEach(element => {
        const text = element.textContent || element.innerText;
        if (text && text.trim().length > 20) {
          // Skip navigation and UI elements
          if (!element.closest('nav, header, footer, button, input, textarea, script, style, [role="navigation"], [role="banner"]')) {
            textParts.push(text.trim());
          }
        }
      });
      
      if (textParts.length > 0) {
        allText = textParts.join('\n\n');
        console.log(`Using broad extraction: ${allText.length} characters`);
      }
    }
    
    console.log(`Final text length: ${allText.length}`);
    console.log(`Text preview: ${allText.substring(0, 200)}...`);
    
    if (allText && allText.length > 10) {
      console.log(`✓ Retrieved ${allText.length} characters of text`);
      return allText;
    } else {
      console.log('No substantial text found');
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

// PDF generation function using jsPDF
async function generateAndDownloadPDF(text) {
  try {
    console.log('Starting PDF generation...');
    
    // Load jsPDF library if not already loaded
    if (typeof window.jspdf === 'undefined') {
      console.log('Loading jsPDF library...');
      await loadJSPDF();
    }

    console.log('jsPDF library loaded, creating PDF...');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Set font
    doc.setFont('helvetica');
    
    // Add title
    doc.setFontSize(16);
    doc.setTextColor(79, 70, 229); // #4f46e5
    doc.text('Chat Export', 20, 20);
    
    // Add timestamp
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
    
    // Add content
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    
    // Split text into lines and add to PDF
    const lines = doc.splitTextToSize(text, 170); // 170mm width
    let yPosition = 40;
    const pageHeight = 280; // A4 height in mm
    const lineHeight = 6;
    
    console.log(`Adding ${lines.length} lines to PDF...`);
    
    for (let i = 0; i < lines.length; i++) {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(lines[i], 20, yPosition);
      yPosition += lineHeight;
    }
    
    // Save the PDF
    const fileName = `chat-export-${new Date().toISOString().split('T')[0]}.pdf`;
    console.log(`Saving PDF as: ${fileName}`);
    doc.save(fileName);
    
    console.log('✓ PDF file downloaded successfully');
  } catch (error) {
    console.error('Error generating PDF:', error);
    console.error('Error details:', error.message, error.stack);
    
    // Fallback: Try simple HTML to PDF conversion
    console.log('Falling back to HTML download...');
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Chat Export</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6; 
              color: #333;
            }
            h1 { 
              color: #4f46e5; 
              border-bottom: 2px solid #4f46e5; 
              padding-bottom: 10px; 
            }
            .timestamp { 
              color: #666; 
              font-size: 12px; 
              margin-bottom: 20px; 
            }
            .content { 
              white-space: pre-wrap; 
              font-size: 14px;
            }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Chat Export</h1>
          <div class="timestamp">Generated: ${new Date().toLocaleString()}</div>
          <div class="content">${text}</div>
        </body>
        </html>
      `;
      
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-export-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✓ HTML file downloaded as fallback (can be printed to PDF)');
    } catch (fallbackError) {
      console.error('HTML fallback also failed:', fallbackError);
      throw new Error('Failed to generate PDF and all fallbacks failed');
    }
  }
}

// Load jsPDF library dynamically
async function loadJSPDF() {
  return new Promise((resolve, reject) => {
    if (typeof window.jspdf !== 'undefined') {
      console.log('jsPDF already loaded');
      resolve();
      return;
    }
    
    console.log('Loading jsPDF from:', chrome.runtime.getURL('libs/jspdf.min.js'));
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('libs/jspdf.min.js');
    script.onload = () => {
      console.log('jsPDF script loaded, checking if library is available...');
      // Wait a bit for the library to initialize
      setTimeout(() => {
        if (typeof window.jspdf !== 'undefined') {
          console.log('jsPDF library loaded successfully');
          resolve();
        } else {
          console.error('jsPDF script loaded but library not available');
          reject(new Error('jsPDF library not available after loading'));
        }
      }, 100);
    };
    script.onerror = (error) => {
      console.error('Failed to load jsPDF script:', error);
      reject(new Error('Failed to load jsPDF library'));
    };
    document.head.appendChild(script);
  });
}

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
