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
  const documentLibraryBtn = document.getElementById('documentLibraryBtn');
  const documentLibraryModal = document.getElementById('documentLibraryModal');
  const closeLibraryModal = document.getElementById('closeLibraryModal');
  const documentLibraryList = document.getElementById('documentLibraryList');
  const refreshLibrary = document.getElementById('refreshLibrary');
  const debugBtn = document.getElementById('debugBtn');

  // Load saved settings
  const result = await chrome.storage.sync.get(['studyMode', 'apiUrl']);
  const studyMode = result.studyMode || false;
  const savedApiUrl = result.apiUrl || 'http://localhost:5000';

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
  documentLibraryBtn.addEventListener('click', () => {
    showDocumentLibraryModal();
  });

  closeLibraryModal.addEventListener('click', () => {
    documentLibraryModal.style.display = 'none';
  });

  refreshLibrary.addEventListener('click', () => {
    loadDocumentLibrary();
  });

  // Debug button
  debugBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Send message to content script to run debug function
      await chrome.tabs.sendMessage(tab.id, {
        action: 'debugPageElements'
      });
      
      showSuccess('Debug info printed to console. Check browser dev tools (F12) > Console tab.');
    } catch (error) {
      console.error('Failed to run debug:', error);
      showError('Failed to run debug. Please make sure you are on a supported page.');
    }
  });

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

  // Document Library Functions
  async function showDocumentLibraryModal() {
    documentLibraryModal.style.display = 'block';
    await loadDocumentLibrary();
  }

  async function loadDocumentLibrary() {
    try {
      documentLibraryList.innerHTML = '<p style="color: #9aa3b2; text-align: center;">Loading documents...</p>';
      
      const apiUrl = apiUrlInput.value.trim();
      const response = await fetch(`${apiUrl}/get_document_info`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        documentLibraryList.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${data.error}</p>`;
        return;
      }
      
      if (data.documents.length === 0) {
        documentLibraryList.innerHTML = '<p style="color: #9aa3b2; text-align: center;">No documents indexed yet. Upload a PDF to get started.</p>';
        return;
      }
      
      let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">';
      
      data.documents.forEach(doc => {
        html += `
          <div style="background: #12141a; border: 1px solid #1e2230; border-radius: 6px; padding: 8px; text-align: center;">
            <div style="height: 80px; background: #1e2230; border-radius: 4px; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; color: #9aa3b2;">
              📄
            </div>
            <div style="font-size: 12px; color: #e6e8ee; margin-bottom: 4px;">Page ${doc.page}</div>
            <div style="font-size: 10px; color: #9aa3b2; margin-bottom: 8px;">${doc.image_count} images</div>
            <button onclick="searchDocumentPage(${doc.page})" style="background: #4f46e5; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; width: 100%;">Search</button>
          </div>
        `;
      });
      
      html += '</div>';
      documentLibraryList.innerHTML = html;
      
    } catch (err) {
      console.error('Failed to load document library:', err);
      documentLibraryList.innerHTML = `<p style="color: #ef4444; text-align: center;">Error loading documents: ${err.message}</p>`;
    }
  }

  // Global function for document page search
  window.searchDocumentPage = async function(pageNumber) {
    const query = prompt(`Enter search query for page ${pageNumber}:`);
    if (query) {
      const apiUrl = apiUrlInput.value.trim();
      const k = parseInt(kInput.value) || 5;
      
      try {
        showLoading(true);
        hideMessages();
        
        const response = await fetch(`${apiUrl}/ai_search?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        // Filter results to only show results from the specified page
        const filteredData = {
          ...data,
          hits: data.hits.filter(hit => hit.metadata?.page === pageNumber)
        };
        
        // Close modal and perform search
        documentLibraryModal.style.display = 'none';
        await searchAndExport(apiUrl, query, k, exportFormatSelect.value);
        
      } catch (err) {
        showError(`Error searching page ${pageNumber}: ${err.message}`);
      } finally {
        showLoading(false);
      }
    }
  };
});



