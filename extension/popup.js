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

  // Search and paste
  searchBtn.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    const k = parseInt(kInput.value) || 5;
    const apiUrl = apiUrlInput.value.trim();

    if (!query) {
      showError('Please enter a query');
      return;
    }

    if (!apiUrl) {
      showError('Please enter API URL');
      return;
    }

    await searchAndPaste(apiUrl, query, k);
  });

  function updateUI(mode) {
    studyToggle.classList.toggle('active', mode);
    querySection.classList.toggle('active', mode);
    status.textContent = `Study mode: ${mode ? 'ON' : 'OFF'}`;
  }

  async function searchAndPaste(apiUrl, query, k) {
    showLoading(true);
    hideMessages();

    try {
      // Search the API
      const response = await fetch(`${apiUrl}/search_lc?query=${encodeURIComponent(query)}&k=${k}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Debug: log the full response to see what we're getting
      console.log('=== API RESPONSE DEBUG ===');
      console.log('API URL called:', `${apiUrl}/search_lc?query=${encodeURIComponent(query)}&k=${k}`);
      console.log('Response status:', response.status);
      console.log('Full API response:', data);
      console.log('Response keys:', Object.keys(data));
      console.log('Hits:', data.hits);
      console.log('Images:', data.images);
      console.log('Image paths:', data.image_paths);
      console.log('Image paths type:', typeof data.image_paths);
      console.log('Image paths keys:', data.image_paths ? Object.keys(data.image_paths) : 'undefined');

      // Format the content for pasting
      const formattedContent = formatSearchResults(data, query);
      
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Handle images and text separately
      let imageCopySuccess = false;
      try {
        // First, copy images to clipboard if any exist
        if (data.images && Object.keys(data.images).length > 0) {
          console.log('Copying images to clipboard...');
          await copyImagesToClipboard(data.images);
          console.log('✓ Images copied to clipboard');
          imageCopySuccess = true;
        }
      } catch (imageErr) {
        console.log('Failed to copy images to clipboard:', imageErr);
        imageCopySuccess = false;
      }
      
      try {
        // Remove base64 data from the response for text content
        const textOnlyResponse = removeBase64Data(data);
        
        // Create text-only formatted content (without image tags)
        const textOnlyContent = formatTextOnlyContent(data, query);
        
        // Send the text-only content to content script for direct injection
        await chrome.tabs.sendMessage(tab.id, {
          action: 'pasteContent',
          content: textOnlyContent,
          fullResponse: textOnlyResponse, // Send text-only response
          webhookResponse: data.webhook // Include webhook response
        });
        console.log('Text-only content sent to content script for direct injection');
      } catch (err) {
        console.log('Failed to inject content directly:', err);
        // Fallback to clipboard
        try {
          const textOnlyContent = formatTextOnlyContent(data, query);
          await navigator.clipboard.writeText(textOnlyContent);
          console.log('Fallback: Text copied to clipboard');
        } catch (textErr) {
          console.log('Failed to copy text to clipboard:', textErr);
        }
      }

      // Debug: log what we're sending to content script
      console.log('=== SENDING TO CONTENT SCRIPT ===');
      console.log('Formatted content length:', formattedContent.length);
      console.log('Formatted content preview:', formattedContent.substring(0, 200) + '...');
      console.log('Formatted content contains <img>:', formattedContent.includes('<img'));
      console.log('Number of <img> tags:', (formattedContent.match(/<img/g) || []).length);
      console.log('Full formatted content:', formattedContent);
      console.log('Images data:', data.images || {});
      console.log('Image paths data:', data.image_paths || {});

      // Don't inject content script - just copy images to clipboard
      // User can manually paste with Ctrl+V
      
      const imageCount = data.images ? Object.keys(data.images).length : 0;
      if (imageCount > 0) {
        if (imageCopySuccess) {
          showSuccess(`Retrieved ${data.hits?.length || 0} results. Text pasted to chat. ${imageCount} images copied to clipboard - use Ctrl+V to paste them.`);
        } else {
          showSuccess(`Retrieved ${data.hits?.length || 0} results. Text pasted to chat. Failed to copy images to clipboard.`);
        }
      } else {
        showSuccess(`Retrieved ${data.hits?.length || 0} results. Content pasted to chat.`);
      }
      
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      showLoading(false);
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
    
    // Convert base64 images to Blob objects
    const imageBlobs = [];
    
    for (const [imageId, base64Data] of Object.entries(images)) {
      try {
        console.log(`Converting ${imageId}...`);
        const response = await fetch(`data:image/png;base64,${base64Data}`);
        const blob = await response.blob();
        imageBlobs.push(blob);
        console.log(`✓ Converted ${imageId} to blob:`, blob.size, 'bytes');
      } catch (err) {
        console.log(`✗ Failed to convert ${imageId}:`, err);
      }
    }
    
    if (imageBlobs.length > 0) {
      try {
        // Create clipboard items with both text and images
        const clipboardItems = [];
        
        // Add text as first item
        clipboardItems.push(new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' })
        }));
        
        // Add all images
        imageBlobs.forEach(blob => {
          clipboardItems.push(new ClipboardItem({
            'image/png': blob
          }));
        });
        
        await navigator.clipboard.write(clipboardItems);
        console.log(`✓ Successfully copied text and ${imageBlobs.length} images to clipboard as single context`);
      } catch (err) {
        console.log('✗ Failed to copy text and images to clipboard:', err);
        throw err;
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

  function formatSearchResults(data, query) {
    console.log('=== FORMAT SEARCH RESULTS DEBUG ===');
    console.log('Data received:', data);
    console.log('Data keys:', Object.keys(data));
    console.log('Data.image_paths:', data.image_paths);
    console.log('Data.image_paths type:', typeof data.image_paths);
    console.log('Data.image_paths keys:', data.image_paths ? Object.keys(data.image_paths) : 'undefined');
    
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
});

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
