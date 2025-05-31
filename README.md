# Feedback Collector MCP Tool

Collect user feedback with text and image support through an Electron app.

## Quick Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Build the application**:
```bash
npm run make
```

3. **Run the MCP server**:
```bash
npm run start-mcp
```

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