// Popup script for Recall Me extension

document.addEventListener('DOMContentLoaded', async () => {
  const studyToggle = document.getElementById('studyToggle');
  const status = document.getElementById('status');
  const querySection = document.getElementById('querySection');
  const apiUrlInput = document.getElementById('apiUrl');
  const queryInput = document.getElementById('query');
  const kInput = document.getElementById('k');
  const searchBtn = document.getElementById('searchBtn');
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const success = document.getElementById('success');
  const saveSearchCheckbox = document.getElementById('saveSearch');
  const savedSearchesBtn = document.getElementById('savedSearchesBtn');
  const savedSearchesModal = document.getElementById('savedSearchesModal');
  const closeModal = document.getElementById('closeModal');
  const savedSearchesList = document.getElementById('savedSearchesList');
  const clearAllSearches = document.getElementById('clearAllSearches');
  const exportFormatSelect = document.getElementById('exportFormat');
  const debugBtn = document.getElementById('debugBtn');
  const testPdfBtn = document.getElementById('testPdfBtn');
  const copyChatBtn = document.getElementById('copyChatBtn');
  const copyChatTextBtn = document.getElementById('copyChatTextBtn');
  const testBtn = document.getElementById('testBtn');
  const toggleFloatingBtn = document.getElementById('toggleFloatingBtn');
  const forceAddBtn = document.getElementById('forceAddBtn');
  const currentPageDiv = document.getElementById('currentPage');

  // Load saved settings
  const result = await chrome.storage.sync.get(['studyMode', 'apiUrl']);
  const studyMode = result.studyMode || false;
  const savedApiUrl = result.apiUrl || 'http://localhost:5000';

  // Update current page info
  await updateCurrentPageInfo();

  // Update UI
  updateUI(studyMode);
  apiUrlInput.value = savedApiUrl;

  // Toggle study mode
  studyToggle.addEventListener('click', async () => {
    const newMode = !studyToggle.classList.contains('active');
    await chrome.storage.sync.set({ studyMode: newMode });
    updateUI(newMode);
  });

  // Save API URL on change
  apiUrlInput.addEventListener('change', async () => {
    await chrome.storage.sync.set({ apiUrl: apiUrlInput.value });
  });


  // Search and export
  searchBtn.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    const k = parseInt(kInput.value) || 5;
    const apiUrl = apiUrlInput.value.trim();
    const exportFormat = exportFormatSelect.value;

    if (!query) {
      showError('Please enter a query');
      return;
    }

    if (!apiUrl) {
      showError('Please enter API URL');
      return;
    }

    // Save search if checkbox is checked
    if (saveSearchCheckbox.checked) {
      await saveSearch(query, k, apiUrl);
    }

    await handleExport(exportFormat, query);
  });

  // Saved searches modal
  savedSearchesBtn.addEventListener('click', () => {
    showSavedSearchesModal();
  });

  closeModal.addEventListener('click', () => {
    savedSearchesModal.style.display = 'none';
  });

  clearAllSearches.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all saved searches?')) {
      await chrome.storage.sync.remove(['savedSearches']);
      showSavedSearchesModal();
    }
  });

  // Document library modal

  // Copy entire chat to PDF button
  copyChatBtn.addEventListener('click', async () => {
    showLoading(true);
    hideMessages();
    
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('Current tab:', tab.url, tab.title);
      
      // Check if we're on a supported page
      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com') && !tab.url.includes('perplexity.ai')) {
        showError('Please open this extension while on ChatGPT (chatgpt.com or chat.openai.com) or Perplexity (perplexity.ai)');
        return;
      }
      
      // Send message to content script to get all chat text
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getAllChatText'
      });
      
      console.log('Response from content script:', response);
      
      if (response && response.chatText && response.chatText.trim()) {
        // Generate PDF from chat text
        const pdfBlob = await generatePDFFromChatText(response.chatText, 'Entire Chat Export');
        
        // Download the PDF
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-export-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showSuccess('Entire chat copied and converted to PDF successfully!');
      } else {
        showError('No chat text found. Please make sure you have an active conversation on this page.');
      }
    } catch (error) {
      console.error('Failed to copy entire chat:', error);
      if (error.message.includes('Could not establish connection')) {
        showError('Content script not loaded. Please refresh the ChatGPT/Perplexity page and try again.');
      } else {
        showError('Failed to copy entire chat. Please make sure you are on a supported page (ChatGPT/Perplexity).');
      }
    } finally {
      showLoading(false);
    }
  });

  // Copy entire chat to clipboard button
  copyChatTextBtn.addEventListener('click', async () => {
    showLoading(true);
    hideMessages();
    
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('Current tab:', tab.url, tab.title);
      
      // Check if we're on a supported page
      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com') && !tab.url.includes('perplexity.ai')) {
        showError('Please open this extension while on ChatGPT (chatgpt.com or chat.openai.com) or Perplexity (perplexity.ai)');
        return;
      }
      
      // Send message to content script to get all chat text
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getAllChatText'
      });
      
      console.log('Response from content script:', response);
      
      if (response && response.chatText && response.chatText.trim()) {
        // Copy to clipboard
        await navigator.clipboard.writeText(response.chatText);
        
        showSuccess('Entire chat copied to clipboard successfully!');
      } else {
        showError('No chat text found. Please make sure you have an active conversation on this page.');
      }
    } catch (error) {
      console.error('Failed to copy entire chat:', error);
      if (error.message.includes('Could not establish connection')) {
        showError('Content script not loaded. Please refresh the ChatGPT/Perplexity page and try again.');
      } else {
        showError('Failed to copy entire chat. Please make sure you are on a supported page (ChatGPT/Perplexity).');
      }
    } finally {
      showLoading(false);
    }
  });

  // Toggle floating button
  toggleFloatingBtn.addEventListener('click', async () => {
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on a supported page
      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com') && !tab.url.includes('perplexity.ai')) {
        showError('Please open this extension while on ChatGPT (chatgpt.com or chat.openai.com) or Perplexity (perplexity.ai)');
        return;
      }
      
      // Toggle floating button
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'toggleFloatingButton'
      });
      
      if (response && response.visible) {
        showSuccess('Floating button is now visible on the page!');
        toggleFloatingBtn.textContent = 'Hide Floating Button';
        toggleFloatingBtn.style.background = '#ef4444';
      } else {
        showSuccess('Floating button is now hidden.');
        toggleFloatingBtn.textContent = 'Show Floating Button';
        toggleFloatingBtn.style.background = '#8b5cf6';
      }
    } catch (error) {
      console.error('Failed to toggle floating button:', error);
      if (error.message.includes('Could not establish connection')) {
        showError('Content script not loaded. Please refresh the ChatGPT/Perplexity page and try again.');
      } else {
        showError('Failed to toggle floating button. Please make sure you are on a supported page.');
      }
    }
  });

  // Force add floating button
  forceAddBtn.addEventListener('click', async () => {
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on a supported page
      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com') && !tab.url.includes('perplexity.ai')) {
        showError('Please open this extension while on ChatGPT (chatgpt.com or chat.openai.com) or Perplexity (perplexity.ai)');
        return;
      }
      
      // Force add floating button
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'forceAddFloatingButton'
      });
      
      if (response && response.success) {
        showSuccess('Floating button force added successfully!');
      } else {
        showError('Failed to add floating button. Check console for details.');
      }
    } catch (error) {
      console.error('Failed to force add floating button:', error);
      if (error.message.includes('Could not establish connection')) {
        showError('Content script not loaded. Please refresh the ChatGPT/Perplexity page and try again.');
      } else {
        showError('Failed to force add floating button. Please make sure you are on a supported page.');
      }
    }
  });

  // Test button
  testBtn.addEventListener('click', async () => {
    showLoading(true);
    hideMessages();
    
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('Test - Current tab:', tab.url, tab.title);
      
      // Check if we're on a supported page
      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com') && !tab.url.includes('perplexity.ai')) {
        showError('Please open this extension while on ChatGPT (chatgpt.com or chat.openai.com) or Perplexity (perplexity.ai)');
        return;
      }
      
      // Test basic communication
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'testTextExtraction'
      });
      
      console.log('Test response:', response);
      
      if (response && response.chatText) {
        showSuccess(`Extension is working! Test message: "${response.chatText}"`);
      } else {
        showError('Extension communication failed. Content script may not be loaded.');
      }
    } catch (error) {
      console.error('Test failed:', error);
      if (error.message.includes('Could not establish connection')) {
        showError('Content script not loaded. Please refresh the ChatGPT/Perplexity page and try again.');
      } else {
        showError('Extension test failed. Please make sure you are on a supported page and reload the extension.');
      }
    } finally {
      showLoading(false);
    }
  });

  // Debug button
  debugBtn.addEventListener('click', async () => {
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('Debug - Current tab:', tab.url, tab.title);
      
      // Check if we're on a supported page
      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com') && !tab.url.includes('perplexity.ai')) {
        showError('Please open this extension while on ChatGPT (chatgpt.com or chat.openai.com) or Perplexity (perplexity.ai)');
        return;
      }
      
      // Send message to content script to run debug function
      await chrome.tabs.sendMessage(tab.id, {
        action: 'debugPageElements'
      });
      
      showSuccess('Debug info printed to console. Check browser dev tools (F12) > Console tab.');
    } catch (error) {
      console.error('Failed to run debug:', error);
      if (error.message.includes('Could not establish connection')) {
        showError('Content script not loaded. Please refresh the ChatGPT/Perplexity page and try again.');
      } else {
        showError('Failed to run debug. Please make sure you are on a supported page.');
      }
    }
  });

  // Test PDF button
  testPdfBtn.addEventListener('click', async () => {
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('Test PDF - Current tab:', tab.url, tab.title);
      
      // Check if we're on a supported page
      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com') && !tab.url.includes('perplexity.ai')) {
        showError('Please open this extension while on ChatGPT (chatgpt.com or chat.openai.com) or Perplexity (perplexity.ai)');
        return;
      }
      
      // Send message to content script to test PDF generation
      await chrome.tabs.sendMessage(tab.id, {
        action: 'testPdfGeneration'
      });
      
      showSuccess('PDF test initiated. Check console for details and download.');
    } catch (error) {
      console.error('PDF test failed:', error);
      if (error.message.includes('Could not establish connection')) {
        showError('Content script not loaded. Please refresh the ChatGPT/Perplexity page and try again.');
      } else {
        showError('PDF test failed. Please make sure you are on a supported page.');
      }
    }
  });

  async function updateCurrentPageInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com')) {
        currentPageDiv.innerHTML = '🟢 Connected to: <strong>ChatGPT</strong><br><small>' + tab.title + '</small>';
        currentPageDiv.style.color = '#10b981';
      } else if (tab.url.includes('perplexity.ai')) {
        currentPageDiv.innerHTML = '🟢 Connected to: <strong>Perplexity</strong><br><small>' + tab.title + '</small>';
        currentPageDiv.style.color = '#10b981';
      } else {
        currentPageDiv.innerHTML = '🔴 Not on supported page<br><small>Please go to ChatGPT or Perplexity</small>';
        currentPageDiv.style.color = '#ef4444';
      }
    } catch (error) {
      currentPageDiv.innerHTML = '❌ Error loading page info';
      currentPageDiv.style.color = '#ef4444';
    }
  }

  function updateUI(mode) {
    studyToggle.classList.toggle('active', mode);
    querySection.classList.toggle('active', mode);
    status.textContent = `Study mode: ${mode ? 'ON' : 'OFF'}`;
  }

  async function handleExport(exportFormat, query) {
    showLoading(true);
    hideMessages();

    try {
      const apiUrl = apiUrlInput.value.trim();
      
      // First, send query to Flask agent and get response
      const agentResponse = await sendQueryToAgent(apiUrl, query);
      
      if (!agentResponse) {
        showError('No response received from agent');
            return;
      }
      
      // Then handle the export based on format
        switch (exportFormat) {
        case 'select_chat':
          await handleSelectChatText(agentResponse, query);
            break;
          case 'pdf':
          await handleConvertChatToPDF(agentResponse, query);
            break;
          case 'markdown':
          await handleMarkdownExport(agentResponse, query);
            break;
          case 'json':
          await handleJSONExport(agentResponse, query);
            break;
          default:
          await handleSelectChatText(agentResponse, query);
      }
      
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      showLoading(false);
    }
  }

  async function sendQueryToAgent(apiUrl, query) {
    console.log('Sending query to Flask agent...');
    console.log('API URL:', apiUrl);
    console.log('Query:', query);
    
    try {
      // Send query to Flask agent
      const response = await fetch(`${apiUrl}/ai_search?query=${encodeURIComponent(query)}`);
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      console.log('Agent response received:', data);
      
      // Extract the AI response from the Flask response
      let aiResponse = null;
      
      if (data.ai_response) {
        aiResponse = data.ai_response;
        console.log('AI response found:', aiResponse);
      } else if (data.webhook?.response) {
        aiResponse = data.webhook.response;
        console.log('AI response from webhook:', aiResponse);
      } else {
        console.log('No AI response found in Flask response');
        throw new Error('No AI response received from Flask agent');
      }
      
      // Check if Flask already copied to clipboard
      if (data.clipboard_copied) {
        console.log('✓ Flask has already copied response to clipboard');
        showSuccess('AI response received and copied to clipboard by Flask!');
        return aiResponse;
      }
      
      return aiResponse;
      
    } catch (error) {
      console.error('Error sending query to agent:', error);
      throw error;
    }
  }

  function extractTextFromAgentResponse(agentResponse) {
    if (typeof agentResponse === 'string') {
      return agentResponse;
    } else if (Array.isArray(agentResponse)) {
      // Handle array responses (like from n8n workflows)
      if (agentResponse.length > 0 && agentResponse[0].output) {
        return agentResponse[0].output;
      } else if (agentResponse.length > 0 && agentResponse[0].message) {
        return agentResponse[0].message;
      } else if (agentResponse.length > 0 && agentResponse[0].content) {
        return agentResponse[0].content;
      } else {
        return JSON.stringify(agentResponse[0], null, 2);
      }
    } else if (agentResponse.output) {
      return agentResponse.output;
    } else if (agentResponse.message) {
      return agentResponse.message;
    } else if (agentResponse.content) {
      return agentResponse.content;
    } else if (agentResponse.response) {
      return agentResponse.response;
    } else if (agentResponse.text) {
      return agentResponse.text;
      } else {
      return JSON.stringify(agentResponse, null, 2);
    }
  }

  async function handleSelectChatText(agentResponse, query) {
    try {
      // Extract text from agent response
      const responseText = extractTextFromAgentResponse(agentResponse);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(responseText);
      
      // Also try to paste to current page if it's ChatGPT/Perplexity
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'pasteAgentResponse',
          content: responseText,
          query: query
        });
        showSuccess('Agent response copied to clipboard and pasted to chat!');
      } catch (contentError) {
        console.log('Could not paste to page, but text is copied to clipboard');
        showSuccess('Agent response copied to clipboard! You can paste it manually.');
      }
      
    } catch (error) {
      console.error('Failed to handle agent response:', error);
      showError('Failed to copy agent response to clipboard.');
    }
  }

  async function handleConvertChatToPDF(agentResponse, query) {
    try {
      // Extract text from agent response
      const responseText = extractTextFromAgentResponse(agentResponse);
      
      // Generate PDF from agent response
      const pdfBlob = await generatePDFFromChatText(responseText, query);
      
      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-response-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showSuccess('Agent response converted to PDF and downloaded successfully!');
    } catch (error) {
      console.error('Failed to convert agent response to PDF:', error);
      showError('Failed to convert agent response to PDF.');
    }
  }

  async function handleMarkdownExport(agentResponse, query) {
    try {
      // Extract text from agent response
      const responseText = extractTextFromAgentResponse(agentResponse);
      
      // Format as markdown
      const markdownContent = `# Agent Response Export\n\n**Generated:** ${new Date().toLocaleString()}\n**Query:** ${query}\n\n---\n\n${responseText}`;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(markdownContent);
      
      // Also download as file
      const blob = new Blob([markdownContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-response-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showSuccess('Agent response exported to Markdown! Copied to clipboard and downloaded.');
    } catch (error) {
      console.error('Failed to export agent response to Markdown:', error);
      showError('Failed to export agent response to Markdown.');
    }
  }

  async function handleJSONExport(agentResponse, query) {
    try {
      // Format as JSON with the full agent response
      const jsonContent = JSON.stringify({
        query: query,
        timestamp: new Date().toISOString(),
        agentResponse: agentResponse,
        metadata: {
          source: 'Flask Agent',
          exportType: 'agent_response'
        }
      }, null, 2);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(jsonContent);
      
      // Also download as file
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-response-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showSuccess('Agent response exported to JSON! Copied to clipboard and downloaded.');
    } catch (error) {
      console.error('Failed to export agent response to JSON:', error);
      showError('Failed to export agent response to JSON.');
    }
  }

  async function generatePDFFromChatText(chatText, query) {
    console.log('Generating PDF from chat text...');
    
    // Initialize jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Set up PDF styling
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (2 * margin);
    let currentY = margin;
    
    // Add title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Chat Export', margin, currentY);
    currentY += 10;
    
    // Add query if provided
    if (query) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(`Query: ${query}`, margin, currentY);
      currentY += 10;
    }
    
    // Add timestamp
    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, currentY);
    currentY += 15;
    
    // Add separator line
    doc.setLineWidth(0.5);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;
    
    // Add chat content
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(chatText, contentWidth);
        
        lines.forEach(line => {
          if (currentY > pageHeight - 20) {
            doc.addPage();
            currentY = margin;
          }
          doc.text(line, margin, currentY);
          currentY += 5;
        });
    
    // Add footer
    if (currentY > pageHeight - 20) {
      doc.addPage();
      currentY = margin;
    }
    
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.text('Exported using Recall Me Extension', margin, currentY);
    
    console.log('✓ PDF generation complete');
    
    // Convert to blob
    const pdfBlob = doc.output('blob');
    console.log('✓ PDF converted to blob:', pdfBlob.size, 'bytes');
    
    return pdfBlob;
  }
  







  function showLoading(show) {
    loading.style.display = show ? 'block' : 'none';
    searchBtn.disabled = show;
  }

  function showError(message) {
    error.textContent = message;
    error.style.display = 'block';
    success.style.display = 'none';
  }

  function showSuccess(message) {
    success.textContent = message;
    success.style.display = 'block';
    error.style.display = 'none';
  }

  function hideMessages() {
    error.style.display = 'none';
    success.style.display = 'none';
  }

  







  // Saved Searches Functions
  async function saveSearch(query, k, apiUrl) {
    try {
      const result = await chrome.storage.sync.get(['savedSearches']);
      const savedSearches = result.savedSearches || [];
      
      const searchEntry = {
        id: Date.now().toString(),
        query: query,
        k: k,
        apiUrl: apiUrl,
        timestamp: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
      
      // Check if this exact search already exists
      const existingIndex = savedSearches.findIndex(search => 
        search.query === query && search.k === k && search.apiUrl === apiUrl
      );
      
      if (existingIndex >= 0) {
        // Update last used time
        savedSearches[existingIndex].lastUsed = new Date().toISOString();
      } else {
        // Add new search
        savedSearches.unshift(searchEntry);
        
        // Limit to 20 saved searches
        if (savedSearches.length > 20) {
          savedSearches.splice(20);
        }
      }
      
      await chrome.storage.sync.set({ savedSearches: savedSearches });
      console.log('Search saved successfully');
    } catch (err) {
      console.error('Failed to save search:', err);
    }
  }

  async function showSavedSearchesModal() {
    try {
      const result = await chrome.storage.sync.get(['savedSearches']);
      const savedSearches = result.savedSearches || [];
      
      savedSearchesList.innerHTML = '';
      
      if (savedSearches.length === 0) {
        savedSearchesList.innerHTML = '<p style="color: #9aa3b2; text-align: center; margin: 20px 0;">No saved searches yet</p>';
      } else {
        savedSearches.forEach(search => {
          const searchItem = document.createElement('div');
          searchItem.style.cssText = `
            background: #12141a;
            border: 1px solid #1e2230;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: background 0.2s;
          `;
          
          searchItem.innerHTML = `
            <div style="font-weight: 600; color: #e6e8ee; margin-bottom: 4px;">${search.query}</div>
            <div style="font-size: 12px; color: #9aa3b2;">
              Results: ${search.k} | Last used: ${new Date(search.lastUsed).toLocaleDateString()}
            </div>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="use-search-btn" style="background: #4f46e5; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;">Use</button>
              <button class="delete-search-btn" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;">Delete</button>
            </div>
          `;
          
          // Add click handlers
          const useBtn = searchItem.querySelector('.use-search-btn');
          const deleteBtn = searchItem.querySelector('.delete-search-btn');
          
          useBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            useSavedSearch(search);
          });
          
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSavedSearch(search.id);
          });
          
          searchItem.addEventListener('click', () => {
            useSavedSearch(search);
          });
          
          searchItem.addEventListener('mouseenter', () => {
            searchItem.style.background = '#1e2230';
          });
          
          searchItem.addEventListener('mouseleave', () => {
            searchItem.style.background = '#12141a';
          });
          
          savedSearchesList.appendChild(searchItem);
        });
      }
      
      savedSearchesModal.style.display = 'block';
    } catch (err) {
      console.error('Failed to show saved searches:', err);
    }
  }

  async function useSavedSearch(search) {
    // Populate the form with saved search data
    queryInput.value = search.query;
    kInput.value = search.k;
    apiUrlInput.value = search.apiUrl;
    
    // Close modal
    savedSearchesModal.style.display = 'none';
    
    // Update last used time
    const result = await chrome.storage.sync.get(['savedSearches']);
    const savedSearches = result.savedSearches || [];
    const searchIndex = savedSearches.findIndex(s => s.id === search.id);
    if (searchIndex >= 0) {
      savedSearches[searchIndex].lastUsed = new Date().toISOString();
      await chrome.storage.sync.set({ savedSearches: savedSearches });
    }
    
    // Focus on query input
    queryInput.focus();
  }

  async function deleteSavedSearch(searchId) {
    if (confirm('Are you sure you want to delete this saved search?')) {
      try {
        const result = await chrome.storage.sync.get(['savedSearches']);
        const savedSearches = result.savedSearches || [];
        const filteredSearches = savedSearches.filter(search => search.id !== searchId);
        await chrome.storage.sync.set({ savedSearches: filteredSearches });
        showSavedSearchesModal(); // Refresh the modal
      } catch (err) {
        console.error('Failed to delete saved search:', err);
      }
    }
  }

});



