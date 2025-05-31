#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import fs from "fs";
import { randomUUID } from "crypto";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Electron app executable
const electronAppPath = path.join(__dirname, "out", "my-app-win32-x64", "my-app.exe");

// Create an MCP server
const server = new McpServer({
  name: "FeedbackCollector",
  version: "1.0.0"
});

// Track multiple app instances with a Map
// Each instance will have its own process and port
const appInstances = new Map();

// Base port for HTTP communication
const basePort = 8080;
// Get an available port from a range
function getAvailablePort() {
  // Use a random port in the range 8080-8580 to minimize conflicts
  return basePort + Math.floor(Math.random() * 500);
}

// Helper function to get formatted time information
function getTimeInfo(format = 'full', timezone) {
  const now = new Date();
  let formattedTime;
  let additionalInfo = {};
  
  // Apply timezone if specified
  let timeString;
  if (timezone) {
    try {
      // Try to format with the specified timezone
      timeString = now.toLocaleString("en-US", { timeZone: timezone });
      additionalInfo.timezone = timezone;
    } catch (error) {
      console.error(`Invalid timezone: ${timezone}. Using local timezone.`);
      timeString = now.toLocaleString();
      additionalInfo.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  } else {
    // Use local timezone if not specified
    timeString = now.toLocaleString();
    additionalInfo.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  
  // Format the time according to the requested format
  switch (format.toLowerCase()) {
    case "iso":
      formattedTime = now.toISOString();
      break;
    case "date":
      formattedTime = now.toLocaleDateString();
      break;
    case "time":
      formattedTime = now.toLocaleTimeString();
      break;
    case "unix":
      formattedTime = Math.floor(now.getTime() / 1000).toString();
      additionalInfo.milliseconds = now.getTime();
      break;
    case "full":
    default:
      formattedTime = timeString;
      // Add additional date components
      additionalInfo.date = now.toLocaleDateString();
      additionalInfo.time = now.toLocaleTimeString();
      additionalInfo.iso = now.toISOString();
      additionalInfo.unix = Math.floor(now.getTime() / 1000);
  }
  
  return { formattedTime, additionalInfo };
}

// Function to launch a new Electron app instance
async function launchAppInstance() {
  const sessionId = randomUUID();
  const port = getAvailablePort();
  
  console.error(`Launching new Electron app instance (sessionId: ${sessionId}, port: ${port})...`);
  
  // Pass parameters to the Electron app
  const env = { ...process.env, MCP_SERVER_PORT: port.toString() };
  
  const appProcess = spawn(electronAppPath, [], { 
    env,
    detached: false,
    windowsHide: false
  });
  
  appProcess.on("error", (err) => {
    console.error(`Failed to start Electron app (sessionId: ${sessionId}):`, err);
    appInstances.delete(sessionId);
  });
  
  appProcess.on("exit", (code) => {
    console.error(`Electron app exited with code ${code} (sessionId: ${sessionId})`);
    appInstances.delete(sessionId);
  });
  
  // Store the instance information
  appInstances.set(sessionId, { process: appProcess, port: port });
  
  // Wait a bit for the app to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return { sessionId, port };
}

// Tool to launch the Electron app and collect feedback
server.tool(
  "collect_feedback",
  "Collect feedback from the user through an Electron app",
  {
    prompt: z.string({
      description: "The message to display to the user in the feedback window"
    }).default("Please provide your feedback or describe your issue:"),
    title: z.string({
      description: "The title of the feedback window"
    }).default("AI Feedback Collection"),
    time_format: z.enum(["full", "iso", "date", "time", "unix"], {
      description: "The format for time information"
    }).default("full"),
    timezone: z.string({
      description: "The timezone to use (defaults to local)"
    }).optional()
  },
  async ({ prompt, title, time_format, timezone }) => {
    try {
      // Launch a new Electron app instance for each request
      const { sessionId, port } = await launchAppInstance();
      
      // Send the request to the Electron app and wait for feedback
      try {
        const feedback = await sendRequestToApp({
          prompt,
          title,
          time_format,
          timezone,
          port
        });
        
        // Get time information
        const { formattedTime, additionalInfo } = getTimeInfo(time_format, timezone);
        
        // Format the time information as requested
        const timeInfo = Object.entries(additionalInfo)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        
        // Create the response content array with requested format
        let responseContent = [];
        
        // Add feedback text
        if (typeof feedback === 'string') {
          // Simple string feedback (old format)
          responseContent.push({ type: "text", text: feedback });
        } else {
          // Object with text and possibly image (new format)
          responseContent.push({ type: "text", text: feedback.text });
          
          // Add image if present
          if (feedback.hasImage && feedback.imagePath) {
            try {
              const imageBuffer = fs.readFileSync(feedback.imagePath);
              const base64Image = imageBuffer.toString('base64');
              
              // Add the image
              responseContent.push({
                type: "image",
                data: base64Image,
                mimeType: feedback.imageType || "image/png"
              });
            } catch (error) {
              console.error("Error processing image:", error.message);
              responseContent.push({ 
                type: "text", 
                text: `Note: User attached an image, but it could not be processed. Error: ${error.message}` 
              });
            }
          }
        }
        
        // Add time information
        responseContent.push({ type: "text", text: timeInfo });
        
        return {
          content: responseContent
        };
      } finally {
        // Clean up the app instance when done
        const instance = appInstances.get(sessionId);
        if (instance && instance.process) {
          try {
            instance.process.kill();
          } catch (error) {
            console.error(`Error killing app process (sessionId: ${sessionId}):`, error);
          }
          appInstances.delete(sessionId);
        }
      }
    } catch (error) {
      console.error("Error collecting feedback:", error);
      return {
        content: [{ type: "text", text: `Error collecting feedback: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Function to send a request to the Electron app and get feedback
async function sendRequestToApp({ prompt, title, time_format, timezone, port }) {
  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify({ prompt, title, time_format, timezone });
    
    const req = http.request({
      hostname: "localhost",
      port: port,
      path: "/feedback",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestData)
      }
    }, (res) => {
      let responseData = "";
      
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const jsonResponse = JSON.parse(responseData);
            resolve(jsonResponse.feedback);
          } catch (e) {
            reject(new Error("Invalid response from Electron app"));
          }
        } else {
          reject(new Error(`HTTP error ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on("error", (error) => {
      reject(error);
    });
    
    req.write(requestData);
    req.end();
  });
}

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Feedback Collector MCP server running on stdio");

// Cleanup when the server is shutting down
process.on("SIGINT", async () => {
  // Kill all running app instances
  for (const [sessionId, instance] of appInstances.entries()) {
    try {
      console.error(`Shutting down Electron app (sessionId: ${sessionId})...`);
      instance.process.kill();
    } catch (error) {
      console.error(`Error shutting down app (sessionId: ${sessionId}):`, error);
    }
  }
  process.exit(0);
}); 