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

// Track if the user has manually resized the window
let userHasManuallyResized = false;

// Get electron IPC renderer and markdown library
const { ipcRenderer } = require('electron');
const marked = require('marked');

// Configure marked for security
marked.setOptions({
  sanitize: true,
  gfm: true,
  breaks: true
});

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
  const padding = 80; // Additional padding
  
  // Calculate prompt height, but cap it at MAX_VISIBLE_LINES
  const rawPromptHeight = markdownPrompt.scrollHeight;
  const promptHeight = Math.min(rawPromptHeight, MAX_VISIBLE_LINES * LINE_HEIGHT);
  
  // Calculate ideal height based on content with limits
  let idealHeight = promptHeight + textareaMinHeight + actionsHeight + headerHeight + padding;
  
  // Cap at reasonable minimum and maximum
  idealHeight = Math.min(Math.max(idealHeight, 500), 800);
  
  // Request resize from main process
  ipcRenderer.send('resize-window', 650, idealHeight);
  
  // Adjust textarea size to ensure it's always visible
  const remainingHeight = window.innerHeight - (promptHeight + headerHeight + actionsHeight + padding);
  const textareaHeight = Math.max(remainingHeight, textareaMinHeight);
  
  textareaContainer.style.height = `${textareaHeight}px`;
}

// Handle feedback prompt from main process
ipcRenderer.on('show-feedback-prompt', (event, data) => {
  // Reset manual resize flag when showing new content
  userHasManuallyResized = false;
  
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
    const padding = 80;
    
    const remainingHeight = window.innerHeight - (promptHeight + headerHeight + actionsHeight + padding);
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
    // Get current timestamp based on time format
    const timestamp = getCurrentTimestamp();
    
    // Format feedback with timestamp
    const formattedFeedback = `${feedback}\n\n${timestamp}`;
    
    // Send to main process
    ipcRenderer.send('submit-feedback', formattedFeedback);
    
    // Close the window
    window.close();
  } else {
    alert('Please enter feedback before submitting.');
  }
});

approveButton.addEventListener('click', () => {
  // Get current timestamp
  const timestamp = getCurrentTimestamp();
  
  // Format approval with timestamp
  const formattedFeedback = `APPROVED: I approve this action or information.\n\n${timestamp}`;
  
  // Send to main process
  ipcRenderer.send('submit-feedback', formattedFeedback);
  
  // Close the window
  window.close();
});

enoughButton.addEventListener('click', () => {
  // Get current timestamp
  const timestamp = getCurrentTimestamp();
  
  // Format enough with timestamp
  const formattedFeedback = `ENOUGH: The information provided is sufficient. No further details needed.\n\n${timestamp}`;
  
  // Send to main process
  ipcRenderer.send('submit-feedback', formattedFeedback);
  
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