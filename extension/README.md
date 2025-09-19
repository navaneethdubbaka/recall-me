# Recall Me Browser Extension

A Chrome extension that integrates with your Recall Me PDF retrieval API to automatically paste retrieved content into ChatGPT or Perplexity for study assistance.

## Features

- **Study Mode Toggle**: Enable/disable the extension functionality
- **Query Interface**: Search your uploaded PDFs directly from the extension popup
- **Auto-Paste**: Automatically formats and pastes retrieved content into ChatGPT/Perplexity
- **Visual Indicator**: Shows "Study Mode" indicator when active
- **Configurable API**: Set your Recall Me API URL (default: localhost:5000)

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the `extension` folder
4. The extension icon should appear in your toolbar

## Usage

1. **Enable Study Mode**: Click the extension icon and toggle "Study Mode" ON
2. **Set API URL**: Enter your Recall Me API URL (e.g., `http://localhost:5000` or your ngrok URL)
3. **Query Your PDFs**: 
   - Enter a search query (e.g., "What does the document say about machine learning?")
   - Set the number of results (k=1-10)
   - Click "Search & Paste"
4. **Automatic Pasting**: The extension will:
   - Search your PDFs using the Recall Me API
   - Format the results with context and page numbers
   - Automatically paste into ChatGPT or Perplexity
   - Optionally auto-submit the message

## Supported Sites

- ChatGPT (chat.openai.com)
- Perplexity (perplexity.ai)

## API Integration

The extension calls your Recall Me API endpoints:
- `GET /search_lc?query={query}&k={k}` - Retrieves text and image results
- Returns JSON with `hits` array and `images` base64 map

## Content Format

When pasted, results are formatted as:
```
**Study Context for: "your query"**

Found X relevant results:

**1. Text (Page 5)**
[Retrieved text content]

**2. Image (Page 3)**
[Image data available - page_3_img_1]

---
*Retrieved from your documents using Recall Me*
```

## Configuration

- **API URL**: Set in popup (saved to Chrome storage)
- **Study Mode**: Toggle on/off (saved to Chrome storage)
- **Results Count**: Adjust k parameter (1-10)

## Development

To modify the extension:
1. Edit files in the `extension/` folder
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Recall Me extension
4. Test your changes

## Permissions

- `activeTab`: Access current tab for pasting
- `storage`: Save user preferences
- `scripting`: Inject content into ChatGPT/Perplexity
- `host_permissions`: Access your API and target sites
