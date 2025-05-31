const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const http = require('http');
const url = require('url');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Keep a reference to the current feedback request and callback
let currentFeedbackRequest = null;
let currentFeedbackCallback = null;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 650,
    height: 500,
    minWidth: 650,
    minHeight: 500,
    resizable: true,
    frame: true,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Uncomment to open DevTools (for debugging)
  // mainWindow.webContents.openDevTools();
  
  // When window closes, reset the current feedback request
  mainWindow.on('closed', () => {
    if (currentFeedbackCallback) {
      // If there's a pending request when the window closes, return an error
      currentFeedbackCallback({
        error: 'Window closed without providing feedback'
      });
      currentFeedbackRequest = null;
      currentFeedbackCallback = null;
    }
  });
  
  return mainWindow;
};

// Create HTTP server for MCP communication
const createServer = (port) => {
  const server = http.createServer(async (req, res) => {
    // Handle only POST requests to /feedback
    if (req.method === 'POST' && req.url === '/feedback') {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const requestData = JSON.parse(body);
          
          // Estimate window size based on prompt length
          if (requestData.prompt) {
            const promptLength = requestData.prompt.length;
            // For longer prompts, start with a larger window
            const estimatedHeight = Math.min(800, 400 + Math.floor(promptLength / 20));
            
            // Set initial window size in requestData to pass to renderer
            requestData.initialHeight = estimatedHeight;
          }
          
          // Store the current request and create a callback promise
          const feedbackPromise = new Promise((resolve) => {
            currentFeedbackRequest = requestData;
            currentFeedbackCallback = resolve;
          });
          
          // Make sure window is open
          let mainWindow = BrowserWindow.getAllWindows()[0];
          if (!mainWindow) {
            mainWindow = createWindow();
            
            // If we have a prompt length estimate, set window size
            if (requestData.initialHeight) {
              mainWindow.setSize(650, requestData.initialHeight);
            }
          } else {
            mainWindow.show();
            mainWindow.focus();
            
            // If we have a prompt length estimate, set window size
            if (requestData.initialHeight) {
              mainWindow.setSize(650, requestData.initialHeight);
            }
          }
          
          // Send request data to renderer
          mainWindow.webContents.send('show-feedback-prompt', requestData);
          
          // Wait for the feedback
          const result = await feedbackPromise;
          
          // Reset the current feedback request
          currentFeedbackRequest = null;
          currentFeedbackCallback = null;
          
          // Return the feedback or error
          if (result.error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: result.error }));
          } else {
            res.statusCode = 200;
            res.end(JSON.stringify({ feedback: result.feedback }));
          }
        } catch (error) {
          console.error('Error processing feedback request:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    } else {
      // Not found
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  
  server.listen(port, 'localhost', () => {
    console.log(`HTTP server listening on port ${port}`);
  });
  
  return server;
};

// Listen for resize request from renderer
ipcMain.on('resize-window', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    // Get current size
    const [currentWidth, currentHeight] = win.getSize();
    
    // Only resize if there's a significant difference (avoids flicker)
    if (Math.abs(currentHeight - height) > 30) {
      // Mark that we're starting an auto-resize
      win.webContents.send('resize-starting');
      
      // Use setContentSize instead of setSize for more accurate sizing
      win.setContentSize(width, height, true);
      
      // Center the window after resize
      win.center();
      
      // Notify renderer that auto-resize is complete
      setTimeout(() => {
        win.webContents.send('resize-complete');
      }, 100);
    }
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Get port from environment variable or use default
  const port = process.env.MCP_SERVER_PORT ? parseInt(process.env.MCP_SERVER_PORT, 10) : 8080;
  
  // Create HTTP server
  const server = createServer(port);
  
  // Create window only when needed (when a request comes in)
  // Don't create window here, as it's better to only show it when needed
  
  // Handle IPC from renderer process
  ipcMain.on('submit-feedback', (event, feedback) => {
    if (currentFeedbackCallback) {
      currentFeedbackCallback({ feedback });
    }
  });
  
  ipcMain.on('cancel-feedback', (event, cancelMessage) => {
    if (currentFeedbackCallback) {
      currentFeedbackCallback({ error: cancelMessage || 'Feedback cancelled by user' });
    }
  });

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      // Only create a window if needed
      // Don't create window here
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
