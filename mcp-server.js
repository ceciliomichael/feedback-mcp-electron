#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

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

// Keep track of the running Electron app process
let appProcess = null;
let appPort = 8080; // Port for HTTP communication with the Electron app

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
      // Launch the Electron app if it's not running
      if (!appProcess) {
        console.error("Launching Electron app...");
        
        // Pass parameters to the Electron app
        const env = { ...process.env, MCP_SERVER_PORT: appPort.toString() };
        
        appProcess = spawn(electronAppPath, [], { 
          env,
          detached: false, // Keep attached to this process
          windowsHide: false // Show the window
        });
        
        appProcess.on("error", (err) => {
          console.error("Failed to start Electron app:", err);
        });
        
        appProcess.on("exit", (code) => {
          console.error(`Electron app exited with code ${code}`);
          appProcess = null;
        });
        
        // Wait a bit for the app to start
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Send the request to the Electron app and wait for feedback
      const feedback = await sendRequestToApp({
        prompt,
        title,
        time_format,
        timezone
      });
      
      return {
        content: [{ type: "text", text: feedback }]
      };
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
async function sendRequestToApp(options) {
  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify(options);
    
    const req = http.request({
      hostname: "localhost",
      port: appPort,
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
  if (appProcess) {
    console.error("Shutting down Electron app...");
    appProcess.kill();
  }
  process.exit(0);
}); 