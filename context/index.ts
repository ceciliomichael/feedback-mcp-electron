#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { promises as fs } from "fs";
import { existsSync } from "fs";

// Get current directory to find the feedback app path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define a type for feedback data
interface FeedbackData {
  text: string;
  hasImages: boolean;
  imageCount?: number;
  images?: Array<{
    path: string;
    type: string;
  }>;
  // Keep backward compatibility with old format
  hasImage?: boolean;
  imagePath?: string;
  imageType?: string;
  actionType?: string; // New field for action type: "submit", "approve", or "reject"
  timestamp: string;
}

// Helper function to wait for a specific amount of time
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to check if a file exists and is readable with retries
async function checkFileWithRetry(filePath: string, maxRetries = 10, delayMs = 300): Promise<boolean> {
  console.error(`Checking for file at: ${filePath}`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fs.access(filePath);
      
      // Try to read the file to make sure it's fully written
      const content = await fs.readFile(filePath, 'utf8');
      if (content.trim().length > 0) {
        console.error(`File found and readable on attempt ${attempt}`);
        return true;
      }
      console.error(`File exists but is empty, waiting for content... (attempt ${attempt})`);
    } catch (error) {
      console.error(`File not accessible yet, retrying... (attempt ${attempt})`);
    }
    
    await sleep(delayMs);
  }
  
  console.error(`File not found or not readable after ${maxRetries} attempts`);
  return false;
}

// Helper function to get formatted time information
function getTimeInfo(format: string = 'full', timezone?: string): { formattedTime: string, additionalInfo: Record<string, any> } {
  const now = new Date();
  let formattedTime: string;
  let additionalInfo: Record<string, any> = {};
  
  // Apply timezone if specified
  let timeString: string;
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

// Create an MCP server
const server = new McpServer({
  name: "ClaudeFlow",
  version: "1.1.0"
});

// Check if FeedbackApp.exe exists before launching
const appPath = resolve(__dirname, "../FeedbackApp/bin/Release/net8.0-windows/FeedbackApp.exe");
if (!existsSync(appPath)) {
  console.error(`WARNING: FeedbackApp.exe not found at: ${appPath}`);
  console.error(`Make sure to build the WPF application first using "dotnet build FeedbackApp -c Release"`);
}

// Tool to collect user feedback with optional image upload and time information
server.tool(
  "collect_feedback", 
  { 
    title: z.string().optional().default("AI Feedback Collection").describe("The title of the feedback window."),
    prompt: z.string().optional().default("Please provide your feedback or describe your issue:").describe("The message displayed to the user in the feedback window."),
    timeFormat: z.string().optional().default("full").describe("The format for the time information (e.g., 'full', 'iso', 'date', 'time', 'unix')."),
    timezone: z.string().optional().describe("The timezone to use for the time information (e.g., 'America/New_York'). Defaults to local.")
  },
  async ({ title, prompt, timeFormat, timezone }) => {
    try {
      console.error("Starting feedback collection...");
      
      // Prepare a temporary directory for feedback data if it doesn't exist
      const feedbackDir = resolve(__dirname, "../feedback_data");
      try {
        await fs.mkdir(feedbackDir, { recursive: true });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error creating feedback directory: ${errorMessage}`);
      }
      
      // Path to the feedback file where the WPF app will save results
      const feedbackFile = resolve(feedbackDir, `feedback_${Date.now()}.json`);
      console.error(`Feedback will be saved to: ${feedbackFile}`);
      
      // Check if the application exists
      if (!existsSync(appPath)) {
        return {
          content: [{ 
            type: "text", 
            text: `Error: FeedbackApp.exe not found. Please build the WPF application first using "dotnet build FeedbackApp -c Release"` 
          }],
          isError: true
        };
      }
      
      console.error(`Launching WPF app directly: ${appPath}`);
      
      // Create a promise that resolves when the feedback data is available
      const feedbackPromise = new Promise<FeedbackData>((resolve, reject) => {
        // Launch the WPF application directly with arguments
        const process = spawn(appPath, [
          title,
          prompt,
          feedbackFile
        ]);
        
        process.stdout.on('data', (data) => {
          console.error(`WPF stdout: ${data.toString().trim()}`);
        });
        
        process.stderr.on('data', (data) => {
          console.error(`WPF stderr: ${data.toString().trim()}`);
        });
        
        process.on('close', async (code) => {
          console.error(`WPF process exited with code ${code}`);
          
          // Add a small delay after the process exits to ensure file writing is complete
          await sleep(1000);
          
          // Check if the feedback file exists with retry mechanism
          const fileExists = await checkFileWithRetry(feedbackFile, 15, 500);
              
          if (!fileExists) {
            // Try to create a minimal feedback file to prevent error
            try {
              const defaultFeedback = {
                text: "User closed the feedback window without submitting.",
                hasImages: false,
                imageCount: 0,
                images: [],
                timestamp: new Date().toISOString()
              };
              await fs.writeFile(feedbackFile, JSON.stringify(defaultFeedback, null, 2));
              console.error("Created default feedback file since user cancelled");
              resolve(defaultFeedback as FeedbackData);
              return;
            } catch (writeError) {
              console.error("Failed to create default feedback file:", writeError);
              reject(new Error("User cancelled feedback or no feedback file was created"));
              return;
            }
          }
          
          try {
            // Read the feedback data
            const content = await fs.readFile(feedbackFile, 'utf8');
            console.error(`File content length: ${content.length} bytes`);
            
            if (content.trim().length === 0) {
              reject(new Error("Feedback file was created but is empty"));
              return;
            }
            
            const feedbackData = JSON.parse(content) as FeedbackData;
            console.error(`Successfully parsed feedback data: ${JSON.stringify(feedbackData, null, 2)}`);
            resolve(feedbackData);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error reading feedback data: ${errorMessage}`);
            reject(new Error(`Error reading feedback data: ${errorMessage}`));
          }
        });
        
        process.on('error', (error) => {
          console.error(`Error launching WPF application: ${error.message}`);
          reject(new Error(`Error launching WPF application: ${error.message}`));
        });
      });
      
      // Wait for the feedback data
      const feedback = await feedbackPromise;
      
      // Get time information
      const { formattedTime, additionalInfo } = getTimeInfo(timeFormat, timezone);
      
      // Process the feedback data
      let responseContent: any[] = [
        { type: "text", text: `${feedback.text}` }
      ];
      
      // Handle multiple images (new format)
      if (feedback.hasImages && feedback.images && feedback.images.length > 0) {
        console.error(`Processing ${feedback.images.length} images`);
        
        // Process each image
        for (const image of feedback.images) {
          try {
            console.error(`Reading image from: ${image.path}`);
            const imageBuffer = await fs.readFile(image.path);
            const base64Image = imageBuffer.toString("base64");
            
            // Add the image to the response
            responseContent.push({
              type: "image",
              data: base64Image,
              mimeType: image.type || "image/png"
            });
            
            console.error(`Successfully added image of type ${image.type}`);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error processing image ${image.path}: ${errorMessage}`);
            responseContent.push({ 
              type: "text", 
              text: `Note: User attached an image (${image.path}), but it could not be processed. Error: ${errorMessage}`
            });
          }
        }
      }
      // Handle single image (old format) for backward compatibility
      else if (feedback.hasImage && feedback.imagePath) {
        try {
          const imageBuffer = await fs.readFile(feedback.imagePath);
          const base64Image = imageBuffer.toString("base64");
          
          // Add the image to the response
          responseContent.push({
            type: "image",
            data: base64Image,
            mimeType: feedback.imageType || "image/png"
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error processing image: ${errorMessage}`);
          responseContent.push({ 
            type: "text", 
            text: `Note: User attached an image, but it could not be processed. Error: ${errorMessage}`
          });
        }
      }
      
      // Add time information to the response
      responseContent.push({
        type: "text",
        text: `Current time: ${formattedTime}`
      });
      
      // Add additional time information
      const detailsText = Object.entries(additionalInfo)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      
      responseContent.push({
        type: "text",
        text: detailsText
      });
      
      return {
        content: responseContent
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Feedback collection error:", error);
      return {
        content: [{ 
          type: "text", 
          text: `Error collecting feedback: ${errorMessage}` 
        }],
        isError: true
      };
    }
  }
);

// Start the server using stdio transport
const transport = new StdioServerTransport();
server.connect(transport);
console.error("MCP server started and listening on stdio"); 