# Feedback Collector MCP Tool

Collect user feedback with text and image support through an Electron app.

## Quick Setup

1. **Clone repository**:
```bash
git clone https://github.com/ceciliomichael/feedback-js.git
cd feedbackjs-mcp
```

2. **Install dependencies**:
```bash
npm install
```

3. **Build the application**:
```bash
npm run make
```

## Cross-Platform Building

The app can be built for Windows, macOS, and Linux platforms:

```bash
# Build for the current platform only
npm run make

# Build for specific platforms
npm run make:win    # Windows only
npm run make:mac    # macOS only
npm run make:linux  # Linux only

# Build for all platforms
npm run make:all
```

> **Note:** Building for macOS from Windows or Linux requires additional setup:
> - For code signing, you need an Apple Developer account
> - For proper macOS builds from non-macOS platforms, consider using a CI service like GitHub Actions

## MCP Configuration

Add to your AI tool configuration (works with Claude Desktop, Cursor, and other MCP clients):

```json
{
  "mcpServers": {
    "feedback-collector": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server.js"]
    }
  }
}
```

## Tool Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `prompt` | string | Message to display | "Please provide feedback" |
| `title` | string | Window title | "AI Feedback Collection" |
| `time_format` | enum | Time format (full, iso, date, time, unix) | "full" |
| `timezone` | string | Timezone | Local timezone |

## Features

- Text feedback with markdown prompt support
- Image uploads (file selection, drag-and-drop, clipboard paste)
- Quick response buttons (Submit, Approve, Enough, Cancel)
- Detailed time information 