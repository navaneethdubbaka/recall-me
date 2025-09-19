// Popup script for Recall Me extension

document.addEventListener('DOMContentLoaded', async () => {
  const studyToggle = document.getElementById('studyToggle');
  const status = document.getElementById('status');
  const querySection = document.getElementById('querySection');
  const apiUrlInput = document.getElementById('apiUrl');
  const queryInput = document.getElementById('query');
  const kInput = document.getElementById('k');
  const webhookUrlInput = document.getElementById('webhookUrl');
  const enableAICheckbox = document.getElementById('enableAI');
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

  // Load saved settings
  const result = await chrome.storage.sync.get(['studyMode', 'apiUrl', 'webhookUrl', 'enableAI']);
  const studyMode = result.studyMode || false;
  const savedApiUrl = result.apiUrl || 'http://localhost:5000';
  const savedWebhookUrl = result.webhookUrl || '';
  const enableAI = result.enableAI || false;

  // Update UI
  updateUI(studyMode);
  apiUrlInput.value = savedApiUrl;
  webhookUrlInput.value = savedWebhookUrl;
  enableAICheckbox.checked = enableAI;

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

  // Save webhook URL on change
  webhookUrlInput.addEventListener('change', async () => {
    await chrome.storage.sync.set({ webhookUrl: webhookUrlInput.value });
  });

  // Save AI enable setting on change
  enableAICheckbox.addEventListener('change', async () => {
    await chrome.storage.sync.set({ enableAI: enableAICheckbox.checked });
  });

  // Search and export
  searchBtn.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    const k = parseInt(kInput.value) || 5;
    const apiUrl = apiUrlInput.value.trim();
    const webhookUrl = webhookUrlInput.value.trim();
    const enableAI = enableAICheckbox.checked;
    const exportFormat = exportFormatSelect.value;

    if (!query) {
      showError('Please enter a query');
      return;
    }

    if (!apiUrl) {
      showError('Please enter API URL');
      return;
    }

    if (enableAI && !webhookUrl) {
      showError('Please enter webhook URL when AI agent is enabled');
      return;
    }

    // Save search if checkbox is checked
    if (saveSearchCheckbox.checked) {
      await saveSearch(query, k, apiUrl, webhookUrl, enableAI);
    }

    await searchAndExport(apiUrl, query, k, exportFormat, webhookUrl, enableAI);
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

  function updateUI(mode) {
    studyToggle.classList.toggle('active', mode);
    querySection.classList.toggle('active', mode);
    status.textContent = `Study mode: ${mode ? 'ON' : 'OFF'}`;
  }

  async function searchAndExport(apiUrl, query, k, exportFormat, webhookUrl, enableAI) {
    showLoading(true);
    hideMessages();

    try {
      // Use AI-only endpoint when AI is enabled
      let response;
      if (enableAI && webhookUrl) {
        // Use AI-only endpoint
        response = await fetch(`${apiUrl}/ai_search?query=${encodeURIComponent(query)}`);
      } else {
        // For non-AI mode, use the chat endpoint as fallback
        response = await fetch(`${apiUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: query })
        });
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Debug: log the full response to see what we're getting
      console.log('=== API RESPONSE DEBUG ===');
      if (enableAI && webhookUrl) {
        console.log('API URL called:', `${apiUrl}/ai_search?query=${encodeURIComponent(query)}`);
      } else {
        console.log('API URL called:', `${apiUrl}/chat (POST)`);
      }
      console.log('Response status:', response.status);
      console.log('Full API response:', data);
      console.log('Response keys:', Object.keys(data));
      console.log('Hits:', data.hits);
      console.log('Images:', data.images);
      console.log('Image paths:', data.image_paths);
      console.log('AI Response in data:', data.ai_response);
      console.log('Webhook result:', data.webhook);

      // Get AI agent response if enabled
      let aiResponse = null;
      if (enableAI && webhookUrl) {
        console.log('=== AI AGENT RESPONSE FROM SEARCH ENDPOINT ===');
        console.log('API URL:', apiUrl);
        console.log('Query:', query);
        console.log('Enable AI:', enableAI);
        console.log('Webhook URL configured:', !!webhookUrl);
        
        // DEBUG: Check what we actually received from the API
        console.log('=== DEBUG: FULL API RESPONSE ===');
        console.log('data:', data);
        console.log('data.ai_response:', data.ai_response);
        console.log('data.webhook:', data.webhook);
        console.log('data.webhook.response:', data.webhook?.response);
        
        // Check if AI response is already in the search results
        if (data.ai_response) {
          console.log('=== AI RESPONSE FOUND IN SEARCH RESULTS ===');
          aiResponse = data.ai_response;
          console.log('AI Response received:', aiResponse);
          console.log('AI Response type:', typeof aiResponse);
          console.log('AI Response is array:', Array.isArray(aiResponse));
        } else if (data.webhook?.response) {
          console.log('=== AI RESPONSE FOUND IN WEBHOOK RESPONSE ===');
          aiResponse = data.webhook.response;
          console.log('AI Response from webhook:', aiResponse);
          console.log('AI Response type:', typeof aiResponse);
          console.log('AI Response is array:', Array.isArray(aiResponse));
        } else {
          console.log('No AI response found in search results or webhook, trying separate AI chat endpoint...');
          // Fallback to separate AI chat endpoint
          try {
            aiResponse = await getAIResponse(apiUrl, query, data);
            console.log('=== AI RESPONSE RECEIVED FROM SEPARATE AI CHAT ENDPOINT ===');
            console.log('AI Response received:', aiResponse);
            console.log('AI Response type:', typeof aiResponse);
            console.log('AI Response is array:', Array.isArray(aiResponse));
          } catch (aiErr) {
            console.error('AI Agent request via separate endpoint failed:', aiErr);
            showError(`AI request failed: ${aiErr.message}`);
            return;
          }
        }
        
        // FLASK CLIPBOARD COPY: Flask handles clipboard copying, extension just shows success
        console.log('=== FLASK CLIPBOARD COPY MODE ===');
        console.log('aiResponse:', aiResponse);
        console.log('Clipboard copied by Flask:', data.clipboard_copied);
        
        if (data.clipboard_copied || aiResponse) {
          loading.innerHTML = '✓ AI response received and copied to clipboard by Flask!';
          console.log('✓ AI response received, Flask has copied to clipboard');
          showSuccess('AI response received and copied to clipboard! You can now paste it anywhere.');
          return; // Exit early - Flask has handled everything
        } else {
          console.log('❌ No AI response received from Flask');
          showError('No AI response received from Flask');
          return;
        }
      }

      // Handle different export formats
      // When AI is enabled, only use webhook response (aiResponse)
      if (enableAI && webhookUrl) {
        console.log('=== AI MODE: Using ONLY AI response from Flask API, ignoring RAG data ===');
        console.log('Enable AI:', enableAI);
        console.log('Webhook URL configured:', webhookUrl);
        console.log('AI Response to be used:', aiResponse);
        console.log('AI Response type:', typeof aiResponse);
        console.log('AI Response is array:', Array.isArray(aiResponse));
        console.log('RAG data being ignored:', data);
        
        // AI is enabled - only process webhook response, ignore RAG data completely
        switch (exportFormat) {
          case 'paste':
            await handlePasteExport({}, query, aiResponse); // Empty RAG data, only AI response
            break;
          case 'pdf':
            await handlePDFExport({}, query, aiResponse); // Empty RAG data, only AI response
            break;
          case 'markdown':
            await handleMarkdownExport({}, query, aiResponse); // Empty RAG data, only AI response
            break;
          case 'json':
            await handleJSONExport({}, query, aiResponse); // Empty RAG data, only AI response
            break;
          default:
            await handlePasteExport({}, query, aiResponse); // Empty RAG data, only AI response
        }
      } else {
        console.log('=== RAG MODE: Using document search results ===');
        // AI is not enabled - use RAG data
        switch (exportFormat) {
          case 'paste':
            await handlePasteExport(data, query, null);
            break;
          case 'pdf':
            await handlePDFExport(data, query, null);
            break;
          case 'markdown':
            await handleMarkdownExport(data, query, null);
            break;
          case 'json':
            await handleJSONExport(data, query, null);
            break;
          default:
            await handlePasteExport(data, query, null);
        }
      }
      
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      showLoading(false);
    }
  }

  async function getAIResponse(apiUrl, query, ragData) {
    console.log('Sending request to Flask AI chat endpoint...');
    
    // Prepare the payload for the Flask API
    const payload = {
      query: query,
      timestamp: new Date().toISOString(),
      session_id: 'extension_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      rag_context: {
        query: query,
        hits: ragData.hits || [],
        total_results: ragData.hits?.length || 0
      }
    };
    
    console.log('Flask API payload:', payload);
    
    const response = await fetch(`${apiUrl}/ai_chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Flask API response status:', response.status);
    console.log('Flask API response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Flask API error response:', errorText);
      throw new Error(`Flask API HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }
    
    let apiData;
    try {
      apiData = await response.json();
      console.log('Flask API response:', apiData);
      console.log('Response type:', typeof apiData);
      console.log('Is array:', Array.isArray(apiData));
      
      if (apiData && typeof apiData === 'object') {
        console.log('Object keys:', Object.keys(apiData));
        console.log('AI response in API data:', apiData.ai_response);
      }
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError);
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      // If JSON parsing fails, treat the text as the response
      apiData = { ai_response: { message: responseText } };
    }
    
    // Extract the AI response from the Flask API response
    if (apiData && apiData.ai_response) {
      console.log('✓ AI response extracted from Flask API');
      return apiData.ai_response;
    } else {
      console.log('❌ No AI response found in Flask API response');
      throw new Error('No AI response received from Flask API');
    }
  }

  async function pollForWebhookResponse(webhookUrl, sessionId, attempt = 0) {
    const maxAttempts = 20; // Maximum 20 attempts
    const baseDelay = 2000; // Start with 2 seconds
    const maxDelay = 10000; // Maximum 10 seconds between attempts
    
    if (attempt >= maxAttempts) {
      throw new Error('Timeout waiting for webhook response after ' + maxAttempts + ' attempts');
    }
    
    // Calculate delay with exponential backoff
    const delay = Math.min(baseDelay * Math.pow(1.5, attempt), maxDelay);
    
    console.log(`Polling attempt ${attempt + 1}/${maxAttempts}, waiting ${delay}ms...`);
    
    // Wait before polling
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      // Try to get the response using a POST request with the session ID
      // This is more likely to work with webhook endpoints
      const pollResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_response',
          session_id: sessionId
        })
      });
      
      if (pollResponse.ok) {
        let responseData;
        try {
          responseData = await pollResponse.json();
          console.log(`Poll attempt ${attempt + 1} response:`, responseData);
        } catch (jsonError) {
          console.error('Failed to parse polling response JSON:', jsonError);
          const responseText = await pollResponse.text();
          console.log('Raw polling response text:', responseText);
          responseData = { message: responseText };
        }
        
        // Accept ANY response that's not null/undefined and has content
        if (responseData && responseData !== null && responseData !== undefined) {
          // Check if it's still processing
          if (responseData.status === 'processing' || responseData.status === 'pending' || responseData.message === 'Workflow was started') {
            console.log('Still processing, continuing to poll...');
            return await pollForWebhookResponse(webhookUrl, sessionId, attempt + 1);
          } else {
            // Check if response has meaningful content (including array responses)
            const hasContent = responseData.message || 
                              responseData.content || 
                              responseData.response || 
                              responseData.text || 
                              responseData.answer || 
                              responseData.result || 
                              responseData.data ||
                              responseData.output ||
                              (Array.isArray(responseData) && responseData.length > 0 && (responseData[0].output || responseData[0].message || responseData[0].content)) ||
                              (typeof responseData === 'string' && responseData.length > 0);
            
            if (hasContent) {
              console.log('✓ Webhook response received with content:', responseData);
              return responseData;
            } else {
              console.log('Response received but no meaningful content, continuing to poll...');
              return await pollForWebhookResponse(webhookUrl, sessionId, attempt + 1);
            }
          }
        }
      } else {
        console.log(`Poll attempt ${attempt + 1} failed with status: ${pollResponse.status}`);
        const errorText = await pollResponse.text();
        console.log('Polling error response:', errorText);
      }
      
      // If we get here, the response wasn't ready or was an error
      // Continue polling unless we've reached max attempts
      if (attempt < maxAttempts - 1) {
        return await pollForWebhookResponse(webhookUrl, sessionId, attempt + 1);
      } else {
        throw new Error('Webhook response not ready after maximum attempts');
      }
      
    } catch (error) {
      console.log(`Poll attempt ${attempt + 1} failed:`, error.message);
      
      // If it's a network error and we haven't reached max attempts, continue polling
      if (attempt < maxAttempts - 1) {
        return await pollForWebhookResponse(webhookUrl, sessionId, attempt + 1);
      } else {
        throw error;
      }
    }
  }

  function removeBase64Data(data) {
    console.log('Removing base64 data from response...');
    
    // Create a copy of the data without base64 content
    const textOnlyData = { ...data };
    
    // Remove images object (contains base64 data)
    if (textOnlyData.images) {
      console.log('Removing images object with base64 data');
      delete textOnlyData.images;
    }
    
    // Remove image_paths if it exists
    if (textOnlyData.image_paths) {
      console.log('Removing image_paths object');
      delete textOnlyData.image_paths;
    }
    
    // Clean up hits to remove any base64 content
    if (textOnlyData.hits) {
      textOnlyData.hits = textOnlyData.hits.map(hit => {
        const cleanHit = { ...hit };
        // Remove any base64 content from hit content
        if (cleanHit.content && cleanHit.content.includes('base64')) {
          cleanHit.content = cleanHit.content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[IMAGE_DATA_REMOVED]');
        }
        return cleanHit;
      });
    }
    
    console.log('✓ Base64 data removed from response');
    return textOnlyData;
  }

  async function copyTextAndImagesToClipboard(text, images) {
    console.log('Starting to copy text and images to clipboard...');
    console.log('Text length:', text.length);
    console.log('Number of images:', Object.keys(images).length);
    
    // Check if clipboard API is available
    if (!navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('Clipboard API not available');
    }
    
    // Convert base64 images to Blob objects
    const imageBlobs = [];
    
    for (const [imageId, base64Data] of Object.entries(images)) {
      try {
        console.log(`Converting ${imageId}...`);
        console.log(`Base64 data length: ${base64Data.length}`);
        
        // Clean base64 data - remove data URL prefix if present
        let cleanBase64 = base64Data;
        if (base64Data.startsWith('data:image/png;base64,')) {
          cleanBase64 = base64Data.split(',')[1];
        } else if (base64Data.startsWith('data:image/')) {
          cleanBase64 = base64Data.split(',')[1];
        }
        
        // Convert base64 to blob using a more reliable method
        let blob;
        try {
          // Method 1: Try using fetch (most common)
          const response = await fetch(`data:image/png;base64,${cleanBase64}`);
          blob = await response.blob();
        } catch (fetchErr) {
          console.log(`Fetch method failed for ${imageId}, trying alternative method:`, fetchErr);
          
          // Method 2: Alternative base64 to blob conversion
          const byteCharacters = atob(cleanBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          blob = new Blob([byteArray], { type: 'image/png' });
        }
        
        imageBlobs.push(blob);
        console.log(`✓ Converted ${imageId} to blob:`, blob.size, 'bytes, type:', blob.type);
      } catch (err) {
        console.log(`✗ Failed to convert ${imageId}:`, err);
      }
    }
    
    if (imageBlobs.length > 0) {
      try {
        console.log(`Attempting to copy text and ${imageBlobs.length} images to clipboard...`);
        
        // Create a single clipboard item with both text and images
        // Note: Some browsers support multiple formats in a single ClipboardItem
        const clipboardItem = new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'image/png': imageBlobs[0] // Use the first image as the primary image
        });
        
        await navigator.clipboard.write([clipboardItem]);
        console.log(`✓ Successfully copied text and primary image to clipboard`);
        
        // If there are multiple images, copy them as separate items
        if (imageBlobs.length > 1) {
          console.log(`Copying ${imageBlobs.length - 1} additional images...`);
          for (let i = 1; i < imageBlobs.length; i++) {
            try {
              const additionalItem = new ClipboardItem({
                'image/png': imageBlobs[i]
              });
              await navigator.clipboard.write([additionalItem]);
              console.log(`✓ Copied additional image ${i + 1} of ${imageBlobs.length}`);
              
              // Small delay between copies
              if (i < imageBlobs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (err) {
              console.log(`✗ Failed to copy additional image ${i + 1}:`, err);
            }
          }
        }
        
      } catch (err) {
        console.log('✗ Failed to copy combined text and images:', err);
        console.log('Error details:', err.message);
        
        // Fallback: try copying text and images separately
        console.log('Trying fallback: copying text and images separately...');
        try {
          await navigator.clipboard.writeText(text);
          console.log('✓ Text copied to clipboard');
          
          // Copy images one by one
          for (let i = 0; i < imageBlobs.length; i++) {
            try {
              const imageItem = new ClipboardItem({
                'image/png': imageBlobs[i]
              });
              await navigator.clipboard.write([imageItem]);
              console.log(`✓ Copied image ${i + 1} of ${imageBlobs.length}`);
              
              if (i < imageBlobs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (imageErr) {
              console.log(`✗ Failed to copy image ${i + 1}:`, imageErr);
            }
          }
        } catch (fallbackErr) {
          console.log('✗ Fallback also failed:', fallbackErr);
          throw fallbackErr;
        }
      }
    } else {
      console.log('No images to copy, copying text only');
      await navigator.clipboard.writeText(text);
    }
  }

  async function copyImagesToClipboard(images) {
    console.log('Starting to copy images to clipboard...');
    console.log('Number of images:', Object.keys(images).length);
    console.log('Images object:', images);
    
    // Check if clipboard API is available
    if (!navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('Clipboard API not available');
    }
    
    // Convert base64 images to Blob objects and copy to clipboard
    const imageBlobs = [];
    
    for (const [imageId, base64Data] of Object.entries(images)) {
      try {
        console.log(`Converting ${imageId}...`);
        console.log(`Base64 data length: ${base64Data.length}`);
        console.log(`Base64 data starts with: ${base64Data.substring(0, 50)}...`);
        
        // Clean base64 data - remove data URL prefix if present
        let cleanBase64 = base64Data;
        if (base64Data.startsWith('data:image/png;base64,')) {
          cleanBase64 = base64Data.split(',')[1];
          console.log(`Removed data URL prefix, clean base64 length: ${cleanBase64.length}`);
        } else if (base64Data.startsWith('data:image/')) {
          cleanBase64 = base64Data.split(',')[1];
          console.log(`Removed data URL prefix, clean base64 length: ${cleanBase64.length}`);
        }
        
        // Convert base64 to blob using a more reliable method
        let blob;
        try {
          // Method 1: Try using fetch (most common)
          const response = await fetch(`data:image/png;base64,${cleanBase64}`);
          blob = await response.blob();
        } catch (fetchErr) {
          console.log(`Fetch method failed for ${imageId}, trying alternative method:`, fetchErr);
          
          // Method 2: Alternative base64 to blob conversion
          const byteCharacters = atob(cleanBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          blob = new Blob([byteArray], { type: 'image/png' });
        }
        imageBlobs.push(blob);
        console.log(`✓ Converted ${imageId} to blob:`, blob.size, 'bytes, type:', blob.type);
      } catch (err) {
        console.log(`✗ Failed to convert ${imageId}:`, err);
      }
    }
    
    if (imageBlobs.length > 0) {
      try {
        console.log(`Attempting to copy ${imageBlobs.length} images to clipboard...`);
        
        // Try to copy all images as a single clipboard item first
        const clipboardItems = imageBlobs.map(blob => new ClipboardItem({
          'image/png': blob
        }));
        
        await navigator.clipboard.write(clipboardItems);
        console.log(`✓ Successfully copied ${imageBlobs.length} images to clipboard as single context`);
      } catch (err) {
        console.log('✗ Failed to copy all images at once, trying one by one:', err);
        console.log('Error details:', err.message);
        
        // Fallback: try copying images one by one
        let successCount = 0;
        for (let i = 0; i < imageBlobs.length; i++) {
          try {
            const clipboardItem = new ClipboardItem({
              'image/png': imageBlobs[i]
            });
            await navigator.clipboard.write([clipboardItem]);
            successCount++;
            console.log(`✓ Successfully copied image ${i + 1} of ${imageBlobs.length}`);
            
            // Add a small delay between copies to avoid overwhelming the clipboard
            if (i < imageBlobs.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (singleErr) {
            console.log(`✗ Failed to copy image ${i + 1}:`, singleErr);
            console.log(`Error details:`, singleErr.message);
          }
        }
        
        if (successCount === 0) {
          throw new Error('Failed to copy any images to clipboard');
        } else if (successCount < imageBlobs.length) {
          console.log(`⚠️ Only copied ${successCount} of ${imageBlobs.length} images`);
        }
      }
    } else {
      console.log('No images to copy');
      throw new Error('No images to copy');
    }
  }

  function formatSearchResults(data, query, aiResponse = null) {
    console.log('=== FORMAT SEARCH RESULTS DEBUG ===');
    console.log('Data received:', data);
    console.log('Data keys:', Object.keys(data));
    console.log('Data.image_paths:', data.image_paths);
    console.log('Data.image_paths type:', typeof data.image_paths);
    console.log('Data.image_paths keys:', data.image_paths ? Object.keys(data.image_paths) : 'undefined');
    console.log('AI Response:', aiResponse);
    
    const hits = data.hits || [];
    const images = data.images || {};
    const imagePaths = data.image_paths || {};
    const apiUrl = apiUrlInput.value.trim();
    
    console.log('Hits:', hits.length);
    console.log('Images object:', images);
    console.log('Images object keys:', Object.keys(images));
    console.log('Images object values (first 3):', Object.values(images).slice(0, 3).map(v => v ? v.substring(0, 50) + '...' : 'null'));
    console.log('Image paths object:', imagePaths);
    console.log('Image paths object keys:', Object.keys(imagePaths));
    console.log('API URL:', apiUrl);
    
    let content = `**Study Context for: "${query}"**\n\n`;
    
    // Add AI Agent response if available
    if (aiResponse) {
      content += `## 🤖 AI Agent Response\n\n`;
      
      // Handle different response formats more flexibly
      let responseText = '';
      
      if (typeof aiResponse === 'string') {
        responseText = aiResponse;
      } else if (Array.isArray(aiResponse)) {
        // Handle array responses (like from n8n workflows)
        if (aiResponse.length > 0 && aiResponse[0].output) {
          responseText = aiResponse[0].output;
        } else if (aiResponse.length > 0 && aiResponse[0].message) {
          responseText = aiResponse[0].message;
        } else if (aiResponse.length > 0 && aiResponse[0].content) {
          responseText = aiResponse[0].content;
        } else {
          // If array doesn't have expected fields, stringify the first item
          responseText = JSON.stringify(aiResponse[0], null, 2);
        }
      } else if (aiResponse.output) {
        responseText = aiResponse.output;
      } else if (aiResponse.message) {
        responseText = aiResponse.message;
      } else if (aiResponse.content) {
        responseText = aiResponse.content;
      } else if (aiResponse.response) {
        responseText = aiResponse.response;
      } else if (aiResponse.text) {
        responseText = aiResponse.text;
      } else if (aiResponse.answer) {
        responseText = aiResponse.answer;
      } else if (aiResponse.result) {
        responseText = aiResponse.result;
      } else if (aiResponse.data) {
        responseText = aiResponse.data;
      } else {
        // For any other format, try to extract meaningful content
        // or fall back to JSON stringify
        responseText = JSON.stringify(aiResponse, null, 2);
      }
      
      content += `${responseText}\n\n`;
      content += `---\n\n`;
    }
    
    // Add RAG results
    content += `## 📚 Document Search Results\n\n`;
    
    if (hits.length === 0) {
      content += "No relevant content found in your documents.\n";
      return content;
    }

    content += `Found ${hits.length} relevant results:\n\n`;

    // Separate text and image hits
    const textHits = hits.filter(hit => hit.metadata?.type === 'text' || !hit.metadata?.type);
    const imageHits = hits.filter(hit => hit.metadata?.type === 'image');

    // Add text results
    textHits.forEach((hit, index) => {
      const metadata = hit.metadata || {};
      const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
      content += `**${index + 1}. Text${page}**\n`;
      content += `${hit.content}\n\n`;
    });

    // Add image results
    if (imageHits.length > 0) {
      content += `\n**Images Found:**\n\n`;
      imageHits.forEach((hit, index) => {
        const metadata = hit.metadata || {};
        const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
        const imageId = metadata.image_id;
        
        content += `**Image ${index + 1}${page}**\n`;
        if (imageId && imagePaths[imageId]) {
          // Use the image file path instead of base64
          const imageUrl = `${apiUrl}${imagePaths[imageId]}`;
          content += `<img src="${imageUrl}" alt="Image from page ${metadata.page}" style="max-width: 100%; height: auto; border: 1px solid #ccc; margin: 10px 0;" />\n`;
          content += `*Image from page ${metadata.page}*\n\n`;
        } else {
          content += `[Image data not available - ${imageId}]\n\n`;
        }
      });
    }

    // Also add any standalone images from the images object that weren't in hits
    const standaloneImages = Object.keys(imagePaths).filter(imageId => 
      !imageHits.some(hit => hit.metadata?.image_id === imageId)
    );

    console.log('Standalone images:', standaloneImages);
    console.log('Image paths:', imagePaths);
    console.log('Image paths keys:', Object.keys(imagePaths));
    console.log('Image paths values:', Object.values(imagePaths));

    if (standaloneImages.length > 0) {
      content += `\n**Additional Images:**\n\n`;
      console.log('Processing standalone images:', standaloneImages);
      standaloneImages.forEach((imageId, index) => {
        content += `**Additional Image ${index + 1}**\n`;
        console.log(`Processing image ${index + 1}: ${imageId}`);
        console.log(`imagePaths[${imageId}]:`, imagePaths[imageId]);
        console.log(`images[${imageId}]:`, images[imageId] ? 'exists' : 'missing');
        
        if (imagePaths[imageId]) {
          // Use base64 data URL instead of HTTP URL to avoid mixed content issues
          const base64Data = images[imageId];
          if (base64Data) {
            const dataUrl = `data:image/png;base64,${base64Data}`;
            console.log('Creating base64 data URL for:', imageId);
            console.log('Base64 data length:', base64Data.length);
            console.log('Data URL length:', dataUrl.length);
            content += `<img src="${dataUrl}" alt="Additional Image" style="max-width: 100%; height: auto; border: 1px solid #ccc; margin: 10px 0;" />\n`;
          } else {
            console.log('No base64 data found for:', imageId);
            content += `[Image data not available - ${imageId}]\n\n`;
          }
        } else {
          console.log('No image path found for:', imageId);
          content += `[Image path not available - ${imageId}]\n\n`;
        }
        content += `*Image ID: ${imageId}*\n\n`;
      });
    } else {
      console.log('No standalone images found');
    }

    content += `\n---\n*Retrieved from your documents using Recall Me*`;
    
    return content;
  }

  function formatTextOnlyContent(data, query) {
    console.log('=== FORMAT TEXT ONLY CONTENT DEBUG ===');
    console.log('Data received:', data);
    console.log('Data keys:', Object.keys(data));
    
    const hits = data.hits || [];
    const imagePaths = data.image_paths || {};
    
    console.log('Hits:', hits.length);
    console.log('Image paths object:', imagePaths);
    console.log('Image paths object keys:', Object.keys(imagePaths));
    
    let content = `**Study Context for: "${query}"**\n\n`;
    
    if (hits.length === 0) {
      content += "No relevant content found in your documents.\n";
      return content;
    }

    content += `Found ${hits.length} relevant results:\n\n`;

    // Separate text and image hits
    const textHits = hits.filter(hit => hit.metadata?.type === 'text' || !hit.metadata?.type);
    const imageHits = hits.filter(hit => hit.metadata?.type === 'image');

    // Add text results
    textHits.forEach((hit, index) => {
      const metadata = hit.metadata || {};
      const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
      content += `**${index + 1}. Text${page}**\n`;
      content += `${hit.content}\n\n`;
    });

    // Add image results (as text references, not actual images)
    if (imageHits.length > 0) {
      content += `\n**Images Found:**\n\n`;
      imageHits.forEach((hit, index) => {
        const metadata = hit.metadata || {};
        const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
        const imageId = metadata.image_id;
        
        content += `**Image ${index + 1}${page}**\n`;
        if (imageId && imagePaths[imageId]) {
          content += `[Image from page ${metadata.page} - ID: ${imageId}]\n`;
          content += `*Image available in clipboard - paste with Ctrl+V*\n\n`;
        } else {
          content += `[Image data not available - ${imageId}]\n\n`;
        }
      });
    }

    // Also add any standalone images from the images object that weren't in hits
    const standaloneImages = Object.keys(imagePaths).filter(imageId => 
      !imageHits.some(hit => hit.metadata?.image_id === imageId)
    );

    console.log('Standalone images:', standaloneImages);

    if (standaloneImages.length > 0) {
      content += `\n**Additional Images:**\n\n`;
      console.log('Processing standalone images:', standaloneImages);
      standaloneImages.forEach((imageId, index) => {
        content += `**Additional Image ${index + 1}**\n`;
        console.log(`Processing image ${index + 1}: ${imageId}`);
        console.log(`imagePaths[${imageId}]:`, imagePaths[imageId]);
        
        if (imagePaths[imageId]) {
          content += `[Additional Image - ID: ${imageId}]\n`;
          content += `*Image available in clipboard - paste with Ctrl+V*\n\n`;
        } else {
          console.log('No image path found for:', imageId);
          content += `[Image path not available - ${imageId}]\n\n`;
        }
      });
    } else {
      console.log('No standalone images found');
    }

    content += `\n---\n*Retrieved from your documents using Recall Me*`;
    
    return content;
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

  // PDF Generation Functions
  async function generatePDFWithContent(data, query) {
    console.log('=== GENERATING PDF ===');
    console.log('Data received:', data);
    console.log('Query:', query);
    
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
    doc.text(`Study Context for: "${query}"`, margin, currentY);
    currentY += 15;
    
    // Add separator line
    doc.setLineWidth(0.5);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;
    
    const hits = data.hits || [];
    const images = data.images || {};
    const imagePaths = data.image_paths || {};
    
    console.log('Processing hits:', hits.length);
    console.log('Processing images:', Object.keys(images).length);
    
    // Separate text and image hits
    const textHits = hits.filter(hit => hit.metadata?.type === 'text' || !hit.metadata?.type);
    const imageHits = hits.filter(hit => hit.metadata?.type === 'image');
    
    // Add text results
    if (textHits.length > 0) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Found ${hits.length} relevant results:`, margin, currentY);
      currentY += 10;
      
      textHits.forEach((hit, index) => {
        // Check if we need a new page
        if (currentY > pageHeight - 40) {
          doc.addPage();
          currentY = margin;
        }
        
        const metadata = hit.metadata || {};
        const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
        
        // Add hit title
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`${index + 1}. Text${page}`, margin, currentY);
        currentY += 8;
        
        // Add hit content
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const content = hit.content || '';
        const lines = doc.splitTextToSize(content, contentWidth);
        
        lines.forEach(line => {
          if (currentY > pageHeight - 20) {
            doc.addPage();
            currentY = margin;
          }
          doc.text(line, margin, currentY);
          currentY += 5;
        });
        
        currentY += 5; // Space between hits
      });
    }
    
    // Add image results
    if (imageHits.length > 0) {
      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentY = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Images Found:', margin, currentY);
      currentY += 10;
      
      for (let i = 0; i < imageHits.length; i++) {
        const hit = imageHits[i];
        const metadata = hit.metadata || {};
        const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
        const imageId = metadata.image_id;
        
        // Check if we need a new page
        if (currentY > pageHeight - 60) {
          doc.addPage();
          currentY = margin;
        }
        
        // Add image title
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`Image ${i + 1}${page}`, margin, currentY);
        currentY += 8;
        
        // Add image if available
        if (imageId && images[imageId]) {
          try {
            console.log(`Adding image ${imageId} to PDF...`);
            
            // Convert base64 to blob
            let cleanBase64 = images[imageId];
            if (cleanBase64.startsWith('data:image/png;base64,')) {
              cleanBase64 = cleanBase64.split(',')[1];
            } else if (cleanBase64.startsWith('data:image/')) {
              cleanBase64 = cleanBase64.split(',')[1];
            }
            
            // Add image to PDF
            const imgData = `data:image/png;base64,${cleanBase64}`;
            const imgWidth = Math.min(contentWidth, 150); // Max width 150
            const imgHeight = (imgWidth * 0.75); // Maintain aspect ratio
            
            // Check if image fits on current page
            if (currentY + imgHeight > pageHeight - 20) {
              doc.addPage();
              currentY = margin;
            }
            
            doc.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
            currentY += imgHeight + 5;
            
            console.log(`✓ Image ${imageId} added to PDF`);
          } catch (imgErr) {
            console.log(`✗ Failed to add image ${imageId}:`, imgErr);
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`[Image ${imageId} could not be added]`, margin, currentY);
            currentY += 10;
          }
        } else {
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          doc.text(`[Image data not available - ${imageId}]`, margin, currentY);
          currentY += 10;
        }
      }
    }
    
    // Add standalone images
    const standaloneImages = Object.keys(imagePaths).filter(imageId => 
      !imageHits.some(hit => hit.metadata?.image_id === imageId)
    );
    
    if (standaloneImages.length > 0) {
      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentY = margin;
      }
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Additional Images:', margin, currentY);
      currentY += 10;
      
      standaloneImages.forEach((imageId, index) => {
        // Check if we need a new page
        if (currentY > pageHeight - 60) {
          doc.addPage();
          currentY = margin;
        }
        
        // Add image title
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`Additional Image ${index + 1}`, margin, currentY);
        currentY += 8;
        
        // Add image if available
        if (images[imageId]) {
          try {
            console.log(`Adding standalone image ${imageId} to PDF...`);
            
            // Convert base64 to blob
            let cleanBase64 = images[imageId];
            if (cleanBase64.startsWith('data:image/png;base64,')) {
              cleanBase64 = cleanBase64.split(',')[1];
            } else if (cleanBase64.startsWith('data:image/')) {
              cleanBase64 = cleanBase64.split(',')[1];
            }
            
            // Add image to PDF
            const imgData = `data:image/png;base64,${cleanBase64}`;
            const imgWidth = Math.min(contentWidth, 150); // Max width 150
            const imgHeight = (imgWidth * 0.75); // Maintain aspect ratio
            
            // Check if image fits on current page
            if (currentY + imgHeight > pageHeight - 20) {
              doc.addPage();
              currentY = margin;
            }
            
            doc.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
            currentY += imgHeight + 5;
            
            console.log(`✓ Standalone image ${imageId} added to PDF`);
          } catch (imgErr) {
            console.log(`✗ Failed to add standalone image ${imageId}:`, imgErr);
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`[Image ${imageId} could not be added]`, margin, currentY);
            currentY += 10;
          }
        } else {
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          doc.text(`[Image data not available - ${imageId}]`, margin, currentY);
          currentY += 10;
        }
      });
    }
    
    // Add footer
    if (currentY > pageHeight - 20) {
      doc.addPage();
      currentY = margin;
    }
    
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.text('Retrieved from your documents using Recall Me', margin, currentY);
    
    console.log('✓ PDF generation complete');
    
    // Convert to blob
    const pdfBlob = doc.output('blob');
    console.log('✓ PDF converted to blob:', pdfBlob.size, 'bytes');
    
    return pdfBlob;
  }
  
  async function copyPDFToClipboard(pdfBlob) {
    console.log('Copying PDF to clipboard...');
    console.log('PDF blob size:', pdfBlob.size, 'bytes');
    
    // Check if clipboard API is available
    if (!navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('Clipboard API not available');
    }
    
    try {
      // Create clipboard item with PDF
      const clipboardItem = new ClipboardItem({
        'application/pdf': pdfBlob
      });
      
      await navigator.clipboard.write([clipboardItem]);
      console.log('✓ PDF successfully copied to clipboard');
    } catch (err) {
      console.log('✗ Failed to copy PDF to clipboard:', err);
      console.log('Error details:', err.message);
      throw err;
    }
  }

  // Test function for debugging clipboard issues
  window.testClipboard = async function() {
    try {
      console.log('Testing clipboard functionality...');
      
      // Test 1: Check if clipboard API is available
      if (!navigator.clipboard) {
        console.log('❌ navigator.clipboard not available');
        return;
      }
      console.log('✅ navigator.clipboard is available');
      
      // Test 2: Check if write method is available
      if (!navigator.clipboard.write) {
        console.log('❌ navigator.clipboard.write not available');
        return;
      }
      console.log('✅ navigator.clipboard.write is available');
      
      // Test 3: Try to write simple text
      try {
        await navigator.clipboard.writeText('Test clipboard text');
        console.log('✅ Text clipboard write works');
      } catch (err) {
        console.log('❌ Text clipboard write failed:', err);
        return;
      }
      
      // Test 4: Try to create a simple image blob
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 100, 100);
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        console.log('✅ Created test image blob:', blob.size, 'bytes');
        
        // Test 5: Try to write image to clipboard
        const clipboardItem = new ClipboardItem({
          'image/png': blob
        });
        
        await navigator.clipboard.write([clipboardItem]);
        console.log('✅ Image clipboard write works');
        
      } catch (err) {
        console.log('❌ Image clipboard write failed:', err);
      }
      
    } catch (err) {
      console.log('❌ Clipboard test failed:', err);
    }
  };

  // Export Format Handlers
  async function handlePasteExport(data, query, aiResponse = null) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    console.log('=== HANDLE PASTE EXPORT ===');
    console.log('AI Response (webhook response):', aiResponse);
    console.log('AI Response type:', typeof aiResponse);
    console.log('AI Response is null:', aiResponse === null);
    console.log('AI Response is undefined:', aiResponse === undefined);
    console.log('RAG Data (should be empty when AI enabled):', data);
    
    // DIRECT BYPASS: If we have any AI response, force copy it immediately
    if (aiResponse) {
      console.log('🚀 DIRECT BYPASS: AI response detected, forcing immediate copy');
      try {
        let responseText = '';
        if (typeof aiResponse === 'string') {
          responseText = aiResponse;
        } else if (aiResponse.output) {
          responseText = aiResponse.output;
        } else if (aiResponse.message) {
          responseText = aiResponse.message;
        } else if (aiResponse.content) {
          responseText = aiResponse.content;
        } else {
          responseText = JSON.stringify(aiResponse, null, 2);
        }
        
        // Copy to clipboard immediately
        await navigator.clipboard.writeText(responseText);
        console.log('✅ DIRECT COPY: AI response copied to clipboard immediately');
        
        // Send to content script immediately
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'pasteContent',
            content: '',
            fullResponse: {},
            webhookResponse: aiResponse,
            aiResponse: aiResponse,
            query: query
          });
          
          console.log('✅ DIRECT PASTE: AI response sent to content script immediately');
          showSuccess('AI response copied and pasted successfully!');
          return; // Exit early - we're done!
          
        } catch (contentScriptError) {
          console.log('Content script failed, trying direct injection...');
          
          // Fallback: Direct injection
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: pasteWebhookResponseDirectly,
            args: [aiResponse, query]
          });
          
          console.log('✅ DIRECT INJECTION: AI response injected directly');
          showSuccess('AI response copied and pasted successfully!');
          return; // Exit early - we're done!
        }
        
      } catch (error) {
        console.error('Direct copy failed:', error);
        // Continue with normal flow as fallback
      }
    }
    
    // If we have an AI response (aiResponse), use ONLY that and ignore RAG data completely
    if (aiResponse !== null && aiResponse !== undefined) {
      console.log('=== AI MODE: Using ONLY AI response from Flask API, completely ignoring RAG data ===');
      
      // Copy webhook response to clipboard first (TEXT ONLY - NO IMAGES)
      try {
        // Extract meaningful text from webhook response
        let webhookText = '';
        
        if (typeof aiResponse === 'string') {
          webhookText = aiResponse;
        } else if (Array.isArray(aiResponse)) {
          // Handle array responses (like from n8n workflows)
          if (aiResponse.length > 0 && aiResponse[0].output) {
            webhookText = aiResponse[0].output;
          } else if (aiResponse.length > 0 && aiResponse[0].message) {
            webhookText = aiResponse[0].message;
          } else if (aiResponse.length > 0 && aiResponse[0].content) {
            webhookText = aiResponse[0].content;
          } else {
            // If array doesn't have expected fields, stringify the first item
            webhookText = JSON.stringify(aiResponse[0], null, 2);
          }
        } else if (aiResponse.output) {
          webhookText = aiResponse.output;
        } else if (aiResponse.message) {
          webhookText = aiResponse.message;
        } else if (aiResponse.content) {
          webhookText = aiResponse.content;
        } else if (aiResponse.response) {
          webhookText = aiResponse.response;
        } else if (aiResponse.text) {
          webhookText = aiResponse.text;
        } else if (aiResponse.answer) {
          webhookText = aiResponse.answer;
        } else if (aiResponse.result) {
          webhookText = aiResponse.result;
        } else if (aiResponse.data) {
          webhookText = aiResponse.data;
        } else {
          // Fall back to JSON stringify for complex objects
          webhookText = JSON.stringify(aiResponse, null, 2);
        }
        
        await navigator.clipboard.writeText(webhookText);
        console.log('✓ Webhook response (text only) copied to clipboard');
      } catch (clipboardError) {
        console.error('Failed to copy webhook response to clipboard:', clipboardError);
      }
      
      // Try to ensure content script is ready, then send webhook response
      try {
        // First, try to ping the content script to see if it's ready
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        
        // If ping succeeds, send ONLY the AI response
        await chrome.tabs.sendMessage(tab.id, {
          action: 'pasteContent',
          content: '', // Empty content since we only want AI response
          fullResponse: {}, // Empty full response - no RAG data
          webhookResponse: aiResponse, // This is the AI response from Flask API
          aiResponse: aiResponse, // Pass the AI response
          query: query // Pass the query for context
        });
        
        console.log('✓ AI response sent to content script for pasting');
        showSuccess('AI response (text only) copied to clipboard and pasted to chat successfully!');
        
      } catch (error) {
        console.error('Content script not ready or failed to send webhook response:', error);
        
        // Fallback: try to inject the content directly
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: pasteWebhookResponseDirectly,
            args: [aiResponse, query] // Pass both AI response and query
          });
          
          console.log('✓ AI response injected directly via scripting');
          showSuccess('AI response (text only) copied to clipboard and pasted to chat successfully!');
          
        } catch (injectError) {
          console.error('Failed to inject webhook response directly:', injectError);
          showError('Failed to paste AI response. Please try again or check if you\'re on a supported page (ChatGPT/Perplexity).');
        }
      }
      
        } else {
      // No webhook response - show error message instead of RAG results
      console.log('=== NO WEBHOOK RESPONSE DEBUG ===');
      console.log('aiResponse value:', aiResponse);
      console.log('aiResponse type:', typeof aiResponse);
      console.log('aiResponse is null:', aiResponse === null);
      console.log('aiResponse is undefined:', aiResponse === undefined);
      console.log('aiResponse is array:', Array.isArray(aiResponse));
      if (Array.isArray(aiResponse)) {
        console.log('Array length:', aiResponse.length);
        if (aiResponse.length > 0) {
          console.log('First item:', aiResponse[0]);
          console.log('First item keys:', Object.keys(aiResponse[0]));
        }
      }
      showError('No AI response received. Please check your AI agent configuration and try again.');
    }
  }

  async function handlePDFExport(data, query, aiResponse = null) {
    try {
      console.log('Generating PDF export...');
      const pdfBlob = await generatePDFWithContent(data, query, aiResponse);
      console.log('✓ PDF generated successfully');
      
      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recall-me-search-${query.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const aiStatus = aiResponse ? ' + AI Response' : '';
      showSuccess(`PDF exported successfully with ${data.hits?.length || 0} results${aiStatus}!`);
    } catch (err) {
      console.error('PDF export failed:', err);
      showError(`PDF export failed: ${err.message}`);
    }
  }

  async function handleMarkdownExport(data, query, aiResponse = null) {
    try {
      const markdownContent = formatMarkdownExport(data, query, aiResponse);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(markdownContent);
      
      // Also download as file
      const blob = new Blob([markdownContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recall-me-search-${query.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const aiStatus = aiResponse ? ' + AI Response' : '';
      showSuccess(`Markdown exported successfully with ${data.hits?.length || 0} results${aiStatus}! Copied to clipboard and downloaded.`);
    } catch (err) {
      console.error('Markdown export failed:', err);
      showError(`Markdown export failed: ${err.message}`);
    }
  }

  async function handleJSONExport(data, query, aiResponse = null) {
    try {
      const jsonContent = JSON.stringify({
        query: query,
        timestamp: new Date().toISOString(),
        results: data.hits || [],
        images: data.image_paths || {},
        aiResponse: aiResponse,
        metadata: {
          totalResults: data.hits?.length || 0,
          imageCount: Object.keys(data.images || {}).length,
          hasAIResponse: !!aiResponse
        }
      }, null, 2);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(jsonContent);
      
      // Also download as file
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recall-me-search-${query.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const aiStatus = aiResponse ? ' + AI Response' : '';
      showSuccess(`JSON exported successfully with ${data.hits?.length || 0} results${aiStatus}! Copied to clipboard and downloaded.`);
    } catch (err) {
      console.error('JSON export failed:', err);
      showError(`JSON export failed: ${err.message}`);
    }
  }

  function formatMarkdownExport(data, query) {
    const hits = data.hits || [];
    const imagePaths = data.image_paths || {};
    const apiUrl = apiUrlInput.value.trim();
    
    let markdown = `# Study Context: "${query}"\n\n`;
    markdown += `**Generated:** ${new Date().toLocaleString()}\n`;
    markdown += `**Results:** ${hits.length} found\n\n`;
    markdown += `---\n\n`;
    
    if (hits.length === 0) {
      markdown += "No relevant content found in your documents.\n";
      return markdown;
    }

    // Separate text and image hits
    const textHits = hits.filter(hit => hit.metadata?.type === 'text' || !hit.metadata?.type);
    const imageHits = hits.filter(hit => hit.metadata?.type === 'image');

    // Add text results
    textHits.forEach((hit, index) => {
      const metadata = hit.metadata || {};
      const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
      markdown += `## ${index + 1}. Text${page}\n\n`;
      markdown += `${hit.content}\n\n`;
    });

    // Add image results
    if (imageHits.length > 0) {
      markdown += `## Images Found\n\n`;
      imageHits.forEach((hit, index) => {
        const metadata = hit.metadata || {};
        const page = metadata.page !== undefined ? ` (Page ${metadata.page})` : '';
        const imageId = metadata.image_id;
        
        markdown += `### Image ${index + 1}${page}\n\n`;
        if (imageId && imagePaths[imageId]) {
          const imageUrl = `${apiUrl}${imagePaths[imageId]}`;
          markdown += `![Image from page ${metadata.page}](${imageUrl})\n\n`;
          markdown += `*Image from page ${metadata.page}*\n\n`;
        } else {
          markdown += `[Image data not available - ${imageId}]\n\n`;
        }
      });
    }

    // Add standalone images
    const standaloneImages = Object.keys(imagePaths).filter(imageId => 
      !imageHits.some(hit => hit.metadata?.image_id === imageId)
    );

    if (standaloneImages.length > 0) {
      markdown += `## Additional Images\n\n`;
      standaloneImages.forEach((imageId, index) => {
        markdown += `### Additional Image ${index + 1}\n\n`;
        if (imagePaths[imageId]) {
          const imageUrl = `${apiUrl}${imagePaths[imageId]}`;
          markdown += `![Additional Image](${imageUrl})\n\n`;
        } else {
          markdown += `[Image path not available - ${imageId}]\n\n`;
        }
        markdown += `*Image ID: ${imageId}*\n\n`;
      });
    }

    markdown += `---\n\n`;
    markdown += `*Retrieved from your documents using Recall Me*\n`;
    
    return markdown;
  }

  // Saved Searches Functions
  async function saveSearch(query, k, apiUrl, webhookUrl, enableAI) {
    try {
      const result = await chrome.storage.sync.get(['savedSearches']);
      const savedSearches = result.savedSearches || [];
      
      const searchEntry = {
        id: Date.now().toString(),
        query: query,
        k: k,
        apiUrl: apiUrl,
        webhookUrl: webhookUrl,
        enableAI: enableAI,
        timestamp: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
      
      // Check if this exact search already exists
      const existingIndex = savedSearches.findIndex(search => 
        search.query === query && search.k === k && search.apiUrl === apiUrl
      );
      
      if (existingIndex >= 0) {
        // Update last used time and settings
        savedSearches[existingIndex].lastUsed = new Date().toISOString();
        savedSearches[existingIndex].webhookUrl = webhookUrl;
        savedSearches[existingIndex].enableAI = enableAI;
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
    webhookUrlInput.value = search.webhookUrl || '';
    enableAICheckbox.checked = search.enableAI || false;
    
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

// Fallback functions for direct content injection when content script is not available
function pasteWebhookResponseDirectly(webhookResponse, query = '') {
  console.log('=== DIRECT WEBHOOK RESPONSE INJECTION ===');
  console.log('Webhook response:', webhookResponse);
  console.log('Query:', query);
  
  // Copy to clipboard first (TEXT ONLY - NO IMAGES)
  try {
    // Extract meaningful text from webhook response
    let webhookContent = '';
    
    if (typeof webhookResponse === 'string') {
      webhookContent = webhookResponse;
    } else if (Array.isArray(webhookResponse)) {
      // Handle array responses (like from n8n workflows)
      if (webhookResponse.length > 0 && webhookResponse[0].output) {
        webhookContent = webhookResponse[0].output;
      } else if (webhookResponse.length > 0 && webhookResponse[0].message) {
        webhookContent = webhookResponse[0].message;
      } else if (webhookResponse.length > 0 && webhookResponse[0].content) {
        webhookContent = webhookResponse[0].content;
      } else {
        // If array doesn't have expected fields, stringify the first item
        webhookContent = JSON.stringify(webhookResponse[0], null, 2);
      }
    } else if (webhookResponse.output) {
      webhookContent = webhookResponse.output;
    } else if (webhookResponse.message) {
      webhookContent = webhookResponse.message;
    } else if (webhookResponse.content) {
      webhookContent = webhookResponse.content;
    } else if (webhookResponse.response) {
      webhookContent = webhookResponse.response;
    } else if (webhookResponse.text) {
      webhookContent = webhookResponse.text;
    } else if (webhookResponse.answer) {
      webhookContent = webhookResponse.answer;
    } else if (webhookResponse.result) {
      webhookContent = webhookResponse.result;
    } else if (webhookResponse.data) {
      webhookContent = webhookResponse.data;
    } else {
      // Fall back to JSON stringify for complex objects
      webhookContent = JSON.stringify(webhookResponse, null, 2);
    }
    
    navigator.clipboard.writeText(webhookContent).then(() => {
      console.log('✓ Webhook response (text only) copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy webhook response to clipboard:', err);
    });
  } catch (error) {
    console.error('Clipboard API not available:', error);
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
    
    // Set the webhook response content
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

    console.log('✓ Webhook response injected directly');
    return true;
  }
  
  console.log('No suitable textarea found for direct injection');
  return false;
}

function pasteRAGContentDirectly(content) {
  console.log('=== DIRECT RAG CONTENT INJECTION ===');
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

    console.log('✓ RAG content injected directly');
    return true;
  }
  
  console.log('No suitable textarea found for direct injection');
  return false;
}

// Function to be injected into the page
function pasteToChat(content, images = {}) {
  console.log('Attempting to paste content:', content.substring(0, 100) + '...');
  console.log('Images to paste:', Object.keys(images));
  
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
      // Create a document fragment to build the content
      const fragment = document.createDocumentFragment();
      
      // Split content by image placeholders and process each part
      const parts = content.split(/(<img[^>]*>)/g);
      
      parts.forEach(part => {
        if (part.startsWith('<img')) {
          console.log('Processing img tag:', part);
          // Extract image URL from img tag
          const urlMatch = part.match(/src="([^"]+)"/);
          if (urlMatch) {
            const imageUrl = urlMatch[1];
            console.log('Found image URL:', imageUrl);
            // Create actual image element
            const img = document.createElement('img');
            img.src = imageUrl;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.border = '1px solid #ccc';
            img.style.margin = '10px 0';
            img.style.display = 'block';
            fragment.appendChild(img);
            console.log('Image element created and added to fragment');
          } else {
            console.log('No URL match found in img tag');
          }
        } else if (part.trim()) {
          // Create text node
          const textNode = document.createTextNode(part);
          fragment.appendChild(textNode);
        }
      });
      
      // Append the fragment to the textarea
      textarea.appendChild(fragment);
      
    } else if (textarea.tagName === 'TEXTAREA') {
      // For regular textareas, just set the text content
      textarea.value = content;
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
