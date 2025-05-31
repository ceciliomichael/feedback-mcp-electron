// DOM Elements
const submitButton = document.querySelector('.btn-submit');
const approveButton = document.querySelector('.btn-approve');
const enoughButton = document.querySelector('.btn-enough');
const cancelButton = document.querySelector('.btn-cancel');
const feedbackTextarea = document.querySelector('textarea');
const markdownPrompt = document.getElementById('markdown-prompt');
const headerTitle = document.querySelector('.feedback-header h2');
const promptContainer = document.querySelector('.prompt-container');
const textareaContainer = document.querySelector('.textarea-container');

// Image upload elements
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image');

// Variables to store image data
let selectedImage = null;
let selectedImageType = null;
let selectedImagePath = null;

// Track if the user has manually resized the window
let userHasManuallyResized = false;

// Get electron IPC renderer and markdown library
const { ipcRenderer } = require('electron');
const marked = require('marked');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configure marked for security
marked.setOptions({
  sanitize: true,
  gfm: true,
  breaks: true
});

// Image handling functions
imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    handleImageFile(file);
  }
});

// Function to process an image file
function handleImageFile(file) {
  if (file && file.type.startsWith('image/')) {
    // Store image information
    selectedImageType = file.type;
    
    // Create a temporary path for the image
    const tempDir = path.join(os.tmpdir(), 'feedback-app');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    selectedImagePath = path.join(tempDir, `image-${Date.now()}.${file.name.split('.').pop() || 'png'}`);
    
    // Read the file and save it to the temp location
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = Buffer.from(e.target.result);
      fs.writeFileSync(selectedImagePath, buffer);
      
      // Set the image preview
      imagePreview.src = URL.createObjectURL(file);
      imagePreviewContainer.style.display = 'block';
      
      // Adjust UI
      adjustUIForContent();
    };
    reader.readAsArrayBuffer(file);
  }
}

// Add clipboard paste support
document.addEventListener('paste', (event) => {
  if (event.clipboardData && event.clipboardData.items) {
    // Check if there are any items in the clipboard
    const items = event.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        // We found an image
        const file = items[i].getAsFile();
        handleImageFile(file);
        event.preventDefault();
        break;
      }
    }
  }
});

// Add drag and drop support
const dropZone = document.querySelector('.feedback-container');

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.remove('drag-over');
  
  if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
    const file = event.dataTransfer.files[0];
    if (file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  }
});

// Remove image button
removeImageButton.addEventListener('click', () => {
  clearImageSelection();
  adjustUIForContent();
});

// Clear image selection
function clearImageSelection() {
  selectedImage = null;
  selectedImageType = null;
  if (selectedImagePath && fs.existsSync(selectedImagePath)) {
    try {
      fs.unlinkSync(selectedImagePath);
    } catch (error) {
      console.error('Error removing temporary image:', error);
    }
  }
  selectedImagePath = null;
  imageInput.value = '';
  imagePreview.src = '';
  imagePreviewContainer.style.display = 'none';
}

// Function to adjust UI based on content size
function adjustUIForContent() {
  const MAX_VISIBLE_LINES = 15; // Approximate number of lines before scrolling
  const LINE_HEIGHT = 20; // Approximate line height in pixels
  
  // Calculate approximate content height in lines
  const promptHeight = markdownPrompt.scrollHeight;
  const windowHeight = window.innerHeight;
  const approximateLines = promptHeight / LINE_HEIGHT;
  
  // Set a maximum height for the prompt container based on line count
  if (approximateLines > MAX_VISIBLE_LINES) {
    // Make it scrollable after MAX_VISIBLE_LINES
    promptContainer.style.maxHeight = `${MAX_VISIBLE_LINES * LINE_HEIGHT}px`;
  } else {
    // For smaller content, let it expand naturally up to a point
    promptContainer.style.maxHeight = '';
  }
  
  // Always ensure textarea has adequate space
  textareaContainer.style.minHeight = '150px';
  
  // Only auto-resize window if user hasn't manually resized it
  if (!userHasManuallyResized) {
    requestWindowResize();
  }
}

// Function to request main process to resize window
function requestWindowResize() {
  const MAX_VISIBLE_LINES = 15; // Should match the value in adjustUIForContent
  const LINE_HEIGHT = 20; // Approximate line height in pixels
  const textareaMinHeight = 150; // Minimum height for textarea
  const actionsHeight = 70; // Estimated height for action buttons
  const headerHeight = 60; // Estimated header height
  const imageAreaHeight = imagePreviewContainer.style.display === 'none' ? 50 : 250; // Height for image area
  const padding = 80; // Additional padding
  
  // Calculate prompt height, but cap it at MAX_VISIBLE_LINES
  const rawPromptHeight = markdownPrompt.scrollHeight;
  const promptHeight = Math.min(rawPromptHeight, MAX_VISIBLE_LINES * LINE_HEIGHT);
  
  // Calculate ideal height based on content with limits
  let idealHeight = promptHeight + textareaMinHeight + actionsHeight + headerHeight + imageAreaHeight + padding;
  
  // Cap at reasonable minimum and maximum
  idealHeight = Math.min(Math.max(idealHeight, 500), 900);
  
  // Request resize from main process
  ipcRenderer.send('resize-window', 650, idealHeight);
  
  // Adjust textarea size to ensure it's always visible
  const remainingHeight = window.innerHeight - (promptHeight + headerHeight + actionsHeight + imageAreaHeight + padding);
  const textareaHeight = Math.max(remainingHeight, textareaMinHeight);
  
  textareaContainer.style.height = `${textareaHeight}px`;
}

// Handle feedback prompt from main process
ipcRenderer.on('show-feedback-prompt', (event, data) => {
  // Reset manual resize flag when showing new content
  userHasManuallyResized = false;
  
  // Clear any previous image selection
  clearImageSelection();
  
  // Update UI with the data
  if (data.title) {
    headerTitle.textContent = data.title;
    document.title = data.title;
  }
  
  if (data.prompt) {
    // Render the prompt as markdown
    markdownPrompt.innerHTML = marked.parse(data.prompt);
    
    // Adjust UI based on content size with a small delay for rendering
    setTimeout(() => {
      adjustUIForContent();
    }, 100);
  } else {
    // Set default prompt if none provided
    markdownPrompt.innerHTML = '<p>Please provide your feedback or describe your issue:</p>';
  }
  
  // Clear any previous text and focus
  feedbackTextarea.value = '';
  feedbackTextarea.focus();
});

// Handle window resize events - detect manual resizing
let resizeTimeout;
window.addEventListener('resize', () => {
  // Clear previous timeout
  clearTimeout(resizeTimeout);
  
  // Detect if this is a manual resize from the user (not triggered by our code)
  if (!window.isAutoResizing) {
    userHasManuallyResized = true;
  }
  
  // Update layout with debounce
  resizeTimeout = setTimeout(() => {
    // Always adjust the internal layout, but don't trigger window resize
    const promptHeight = Math.min(markdownPrompt.scrollHeight, 15 * 20); // MAX_VISIBLE_LINES * LINE_HEIGHT
    const headerHeight = 60;
    const actionsHeight = 70;
    const imageAreaHeight = imagePreviewContainer.style.display === 'none' ? 50 : 250; // Height for image area
    const padding = 80;
    
    const remainingHeight = window.innerHeight - (promptHeight + headerHeight + actionsHeight + imageAreaHeight + padding);
    const textareaHeight = Math.max(remainingHeight, 150);
    
    textareaContainer.style.height = `${textareaHeight}px`;
  }, 100);
});

// Detect when our code triggers a resize vs user manual resize
ipcRenderer.on('resize-complete', () => {
  window.isAutoResizing = false;
});

// Mark when our code is initiating a resize
ipcRenderer.on('resize-starting', () => {
  window.isAutoResizing = true;
});

// Button event handlers
submitButton.addEventListener('click', () => {
  const feedback = feedbackTextarea.value.trim();
  if (feedback) {
    // Prepare response object with feedback and image if present
    const response = {
      text: feedback,
      hasImage: !!selectedImagePath,
      imagePath: selectedImagePath || null,
      imageType: selectedImageType || null
    };
    
    // Send to main process
    ipcRenderer.send('submit-feedback', response);
    
    // Close the window
    window.close();
  } else {
    alert('Please enter feedback before submitting.');
  }
});

approveButton.addEventListener('click', () => {
  // Prepare response object with approval message and image if present
  const response = {
    text: 'APPROVED: I approve this action or information.',
    hasImage: !!selectedImagePath,
    imagePath: selectedImagePath || null,
    imageType: selectedImageType || null
  };
  
  // Send to main process
  ipcRenderer.send('submit-feedback', response);
  
  // Close the window
  window.close();
});

enoughButton.addEventListener('click', () => {
  // Prepare response object with enough message and image if present
  const response = {
    text: 'ENOUGH: The information provided is sufficient. No further details needed.',
    hasImage: !!selectedImagePath,
    imagePath: selectedImagePath || null,
    imageType: selectedImageType || null
  };
  
  // Send to main process
  ipcRenderer.send('submit-feedback', response);
  
  // Close the window
  window.close();
});

cancelButton.addEventListener('click', () => {
  // Send cancel event to main process with message
  ipcRenderer.send('cancel-feedback', 'CANCELLED: Operation cancelled by user.');
  
  // Close the window
  window.close();
});

// Listen for window close event
window.addEventListener('beforeunload', () => {
  // If the window is closed without clicking a button, send a cancel message
  ipcRenderer.send('cancel-feedback', 'CANCELLED: Window was closed without providing feedback.');
});

// Helper function to get formatted timestamp
function getCurrentTimestamp() {
  const now = new Date();
  
  // Format: YYYY-MM-DD HH:MM:SS PM
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = String(hours % 12 || 12).padStart(2, '0');
  
  return `${year}-${month}-${day} ${formattedHours}:${minutes}:${seconds} ${ampm}`;
}

// Focus the textarea when the app loads
feedbackTextarea.focus();

// Add keyboard shortcut for submit (Ctrl+Enter)
feedbackTextarea.addEventListener('keydown', (event) => {
  // Check if Ctrl+Enter was pressed (or Cmd+Enter on Mac)
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault(); // Prevent newline insertion
    
    // Simulate click on submit button
    submitButton.click();
  }
}); 