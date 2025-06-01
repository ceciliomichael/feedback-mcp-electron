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

// Timer elements
const timerDisplay = document.getElementById('timer-seconds');
const timerToggle = document.getElementById('timer-toggle');
const pauseIcon = document.getElementById('pause-icon');
const playIcon = document.getElementById('play-icon');

// Timer variables
let timerSeconds = 30;
let timerInterval = null;
let timerPaused = false;

// Snippet elements
const snippetList = document.getElementById('snippet-list');
const snippetDropdownBtn = document.getElementById('snippet-dropdown-btn');
const snippetDropdown = document.getElementById('snippet-dropdown');
const dropdownArrow = snippetDropdownBtn.querySelector('.dropdown-arrow');
const createSnippetBtn = document.getElementById('create-snippet-btn');
const snippetModal = document.getElementById('snippet-modal');
const modalTitle = document.getElementById('modal-title');
const snippetNameInput = document.getElementById('snippet-name');
const snippetContentInput = document.getElementById('snippet-content');
const saveSnippetBtn = document.getElementById('save-snippet-btn');
const cancelSnippetBtn = document.getElementById('cancel-snippet-btn');
const closeModalBtn = document.querySelector('.close-modal');

// Delete confirmation modal elements
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const snippetToDeleteName = document.querySelector('.snippet-to-delete-name');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const closeDeleteModalBtn = document.querySelector('[data-modal="delete-confirm-modal"]');

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

// Snippet management variables
let snippets = [];
let editingSnippetId = null;
let isDropdownOpen = false;
let snippetToDeleteId = null;

// Get electron IPC renderer and markdown library
const { ipcRenderer } = require('electron');
const marked = require('marked');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get app path for storing snippets
let snippetsFilePath;
try {
  // Try to get the app path
  let appPath;
  try {
    // First try with electron remote
    const remote = require('@electron/remote');
    appPath = remote.app.getAppPath();
  } catch (remoteError) {
    // Fallback to a known location if remote is not available
    console.error('Error getting remote app:', remoteError);
    appPath = path.join(os.homedir(), '.feedback-app');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(appPath)) {
      fs.mkdirSync(appPath, { recursive: true });
    }
  }
  
  snippetsFilePath = path.join(appPath, 'snippets.json');
} catch (error) {
  console.error('Error setting up snippets file path:', error);
  // Fallback to temp directory
  snippetsFilePath = path.join(os.tmpdir(), 'feedback-app-snippets.json');
}

// Configure marked for security
marked.setOptions({
  sanitize: true,
  gfm: true,
  breaks: true
});

// Timer functions
function startTimer() {
  // Clear any existing timer
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  timerInterval = setInterval(() => {
    if (!timerPaused) {
      timerSeconds--;
      updateTimerDisplay();
      
      if (timerSeconds <= 5) {
        timerDisplay.parentElement.classList.add('warning');
      }
      
      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        submitAutoFeedback();
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  timerDisplay.textContent = timerSeconds;
}

function toggleTimer() {
  timerPaused = !timerPaused;
  
  if (timerPaused) {
    // Show play icon
    pauseIcon.style.display = 'none';
    playIcon.style.display = 'block';
  } else {
    // Show pause icon
    pauseIcon.style.display = 'block';
    playIcon.style.display = 'none';
  }
}

function resetTimer() {
  timerSeconds = 15;
  timerPaused = false;
  updateTimerDisplay();
  timerDisplay.parentElement.classList.remove('warning');
  pauseIcon.style.display = 'block';
  playIcon.style.display = 'none';
  
  // Restart the timer
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  startTimer();
}

function submitAutoFeedback() {
  // Get the current text from the textarea
  const feedback = feedbackTextarea.value.trim();
  
  // Use appropriate message based on whether input is blank
  const responseText = feedback || "AFK: User is away from keyboard. Proceed as you see fit within the request scope.";
  
  // Prepare response object with feedback and image if present
  const response = {
    text: responseText,
    hasImage: !!selectedImagePath,
    imagePath: selectedImagePath || null,
    imageType: selectedImageType || null,
    autoSubmitted: true
  };
  
  // Send to main process
  ipcRenderer.send('submit-feedback', response);
  
  // Close the window
  window.close();
}

// Toggle snippet dropdown
function toggleSnippetDropdown() {
  if (isDropdownOpen) {
    closeSnippetDropdown();
  } else {
    openSnippetDropdown();
  }
}

// Open snippet dropdown
function openSnippetDropdown() {
  snippetDropdown.classList.add('show');
  dropdownArrow.classList.add('open');
  isDropdownOpen = true;
}

// Close snippet dropdown
function closeSnippetDropdown() {
  snippetDropdown.classList.remove('show');
  dropdownArrow.classList.remove('open');
  isDropdownOpen = false;
}

// Load snippets from file
function loadSnippets() {
  try {
    // Check if file exists
    if (fs.existsSync(snippetsFilePath)) {
      const data = fs.readFileSync(snippetsFilePath, 'utf8');
      snippets = JSON.parse(data);
    } else {
      // Create empty snippets file if it doesn't exist
      snippets = [];
      fs.writeFileSync(snippetsFilePath, JSON.stringify(snippets, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error loading snippets:', error);
    snippets = [];
  }
  renderSnippetList();
}

// Save snippets to file
function saveSnippets() {
  try {
    fs.writeFileSync(snippetsFilePath, JSON.stringify(snippets, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving snippets:', error);
    // Fallback to localStorage if file write fails
    try {
      localStorage.setItem('feedback-snippets', JSON.stringify(snippets));
    } catch (localStorageError) {
      console.error('Error saving to localStorage:', localStorageError);
    }
  }
}

// Render the snippet list
function renderSnippetList() {
  // Clear the list
  snippetList.innerHTML = '';
  
  if (snippets.length === 0) {
    // Show "No snippets" message if there are no snippets
    const noSnippetsMessage = document.createElement('div');
    noSnippetsMessage.className = 'no-snippets-message';
    noSnippetsMessage.textContent = 'No snippets yet';
    snippetList.appendChild(noSnippetsMessage);
    return;
  }
  
  // Add each snippet to the list
  snippets.forEach(snippet => {
    const snippetItem = document.createElement('div');
    snippetItem.className = 'snippet-item';
    snippetItem.innerHTML = `
      <span class="snippet-item-name">${snippet.name}</span>
      <div class="snippet-item-actions">
        <button class="snippet-action edit-snippet" title="Edit">✎</button>
        <button class="snippet-action delete-snippet" title="Delete">×</button>
      </div>
    `;
    
    // Add click event to use the snippet
    snippetItem.addEventListener('click', (e) => {
      // Only trigger if not clicking on action buttons
      if (!e.target.closest('.snippet-item-actions')) {
        useSnippet(snippet);
      }
    });
    
    // Add edit button event
    const editBtn = snippetItem.querySelector('.edit-snippet');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditSnippetModal(snippet);
    });
    
    // Add delete button event
    const deleteBtn = snippetItem.querySelector('.delete-snippet');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSnippet(snippet.id);
    });
    
    snippetList.appendChild(snippetItem);
  });
  
  // Apply scrollable class if more than 5 snippets
  if (snippets.length > 5) {
    snippetList.classList.add('scrollable');
  } else {
    snippetList.classList.remove('scrollable');
  }
}

// Function to ensure focus on textarea
function ensureFocus() {
  // Force focus on the textarea
  feedbackTextarea.focus();
  
  // If focus didn't work, try again with a delay
  setTimeout(() => {
    if (document.activeElement !== feedbackTextarea) {
      feedbackTextarea.focus();
    }
  }, 100);
}

// Use a snippet (insert its content into the textarea)
function useSnippet(snippet) {
  feedbackTextarea.value = snippet.content;
  closeSnippetDropdown();
  
  // Focus and set cursor at the end of the content
  ensureFocus();
  feedbackTextarea.selectionStart = feedbackTextarea.value.length;
  feedbackTextarea.selectionEnd = feedbackTextarea.value.length;
}

// Create a new snippet
function createSnippet(name, content) {
  const newSnippet = {
    id: Date.now().toString(),
    name: name,
    content: content,
    createdAt: new Date().toISOString()
  };
  
  snippets.push(newSnippet);
  saveSnippets();
  renderSnippetList();
}

// Update an existing snippet
function updateSnippet(id, name, content) {
  const index = snippets.findIndex(s => s.id === id);
  if (index !== -1) {
    snippets[index].name = name;
    snippets[index].content = content;
    snippets[index].updatedAt = new Date().toISOString();
    saveSnippets();
    renderSnippetList();
  }
}

// Delete a snippet
function deleteSnippet(id) {
  // Find the snippet to delete
  const snippetToDelete = snippets.find(s => s.id === id);
  if (!snippetToDelete) return;
  
  // Set the snippet ID to delete and show the confirmation modal
  snippetToDeleteId = id;
  snippetToDeleteName.textContent = `"${snippetToDelete.name}"`;
  deleteConfirmModal.style.display = 'block';
}

// Confirm deletion of a snippet
function confirmDeleteSnippet() {
  if (snippetToDeleteId) {
    // Remove the snippet from the array
    snippets = snippets.filter(s => s.id !== snippetToDeleteId);
    
    // Save to file and update the UI
    saveSnippets();
    renderSnippetList();
    
    // Close the modal
    closeDeleteConfirmModal();
  }
}

// Close the delete confirmation modal
function closeDeleteConfirmModal() {
  deleteConfirmModal.style.display = 'none';
  snippetToDeleteId = null;
  
  // Focus back to the textarea
  ensureFocus();
}

// Open modal to create a new snippet
function openCreateSnippetModal() {
  modalTitle.textContent = 'Create Snippet';
  snippetNameInput.value = '';
  snippetContentInput.value = feedbackTextarea.value || '';
  editingSnippetId = null;
  snippetModal.style.display = 'block';
  snippetNameInput.focus();
  closeSnippetDropdown();
}

// Open modal to edit an existing snippet
function openEditSnippetModal(snippet) {
  modalTitle.textContent = 'Edit Snippet';
  snippetNameInput.value = snippet.name;
  snippetContentInput.value = snippet.content;
  editingSnippetId = snippet.id;
  snippetModal.style.display = 'block';
  snippetNameInput.focus();
}

// Close the snippet modal
function closeSnippetModal() {
  snippetModal.style.display = 'none';
  editingSnippetId = null;
  
  // Focus back to the textarea
  ensureFocus();
}

// Save the current snippet (create or update)
function saveSnippet() {
  const name = snippetNameInput.value.trim();
  const content = snippetContentInput.value.trim();
  
  if (!name) {
    alert('Please enter a name for the snippet');
    return;
  }
  
  if (!content) {
    alert('Please enter content for the snippet');
    return;
  }
  
  if (editingSnippetId) {
    updateSnippet(editingSnippetId, name, content);
  } else {
    createSnippet(name, content);
  }
  
  closeSnippetModal();
}

// Event listeners for snippet functionality
snippetDropdownBtn.addEventListener('click', toggleSnippetDropdown);
createSnippetBtn.addEventListener('click', openCreateSnippetModal);
saveSnippetBtn.addEventListener('click', saveSnippet);
cancelSnippetBtn.addEventListener('click', closeSnippetModal);
closeModalBtn.addEventListener('click', closeSnippetModal);

// Event listeners for delete confirmation modal
confirmDeleteBtn.addEventListener('click', confirmDeleteSnippet);
cancelDeleteBtn.addEventListener('click', closeDeleteConfirmModal);
closeDeleteModalBtn.addEventListener('click', closeDeleteConfirmModal);

// Close modals when clicking outside
document.addEventListener('click', (e) => {
  // Close dropdown when clicking outside
  if (isDropdownOpen && !e.target.closest('.snippet-dropdown') && !e.target.closest('#snippet-dropdown-btn')) {
    closeSnippetDropdown();
  }
  
  // Close snippet modal when clicking outside
  if (e.target === snippetModal) {
    closeSnippetModal();
  }
  
  // Close delete confirmation modal when clicking outside
  if (e.target === deleteConfirmModal) {
    closeDeleteConfirmModal();
  }
});

// Add keyboard shortcut for saving snippet (Ctrl+Enter in modal)
snippetContentInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    saveSnippet();
  }
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
  console.log('Received data from main process:', data);
  
  // Reset manual resize flag when showing new content
  userHasManuallyResized = false;
  
  // Clear any previous image selection
  clearImageSelection();
  
  // Validate data with defaults
  const validatedData = {
    title: "AI Feedback Collection",
    prompt: "Please provide your feedback or describe your issue:",
    ...data
  };
  
  // Update UI with the data
  if (validatedData.title) {
    headerTitle.textContent = validatedData.title;
    document.title = validatedData.title;
  }
  
  if (validatedData.prompt) {
    try {
      // Render the prompt as markdown
      markdownPrompt.innerHTML = marked.parse(validatedData.prompt);
    } catch (error) {
      console.error("Error parsing markdown:", error);
      // Fallback to plain text if markdown parsing fails
      markdownPrompt.textContent = validatedData.prompt;
    }
    
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
  ensureFocus();
  
  // Start the timer
  resetTimer();
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
window.addEventListener('DOMContentLoaded', () => {
  ensureFocus();
});

// Add keyboard shortcut for submit (Ctrl+Enter)
feedbackTextarea.addEventListener('keydown', (event) => {
  // Check if Ctrl+Enter was pressed (or Cmd+Enter on Mac)
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault(); // Prevent newline insertion
    
    // Simulate click on submit button
    submitButton.click();
  }
});

// Initialize snippets when the app loads
loadSnippets();

// Event listeners for timer
timerToggle.addEventListener('click', toggleTimer); 