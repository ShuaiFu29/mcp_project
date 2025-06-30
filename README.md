# MCP Project - JavaScript Version

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/) [![MCP SDK](https://img.shields.io/badge/MCP-SDK-blue)](https://modelcontextprotocol.io/)

A comprehensive JavaScript implementation of building AI applications using Model Context Protocol (MCP). This project demonstrates how to create MCP servers and clients, integrate with LLMs, and build powerful AI-driven applications.

## 🌟 Features

- **MCP Server Creation**: Build servers that expose tools, resources, and prompts
- **MCP Client Integration**: Connect to multiple MCP servers from a single client
- **ArXiv Paper Search**: Search and manage academic papers using the ArXiv API
- **Multi-Server Support**: Connect to filesystem, fetch, and custom servers
- **Remote Server Deployment**: Support for SSE and HTTP transports
- **Anthropic Claude Integration**: Seamless integration with Claude AI

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Anthropic API key
- Basic understanding of JavaScript/TypeScript

## 🚀 Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/mcp_project.git
   cd mcp_project
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

4. **Run the examples**

   ```bash
   # Run the basic chatbot
   npm run lesson3
   
   # Start the MCP server
   npm run server
   
   # Run the MCP client
   npm run client
   ```

## 📚 Project Structure

```
mcp_project/
├── src/
│   ├── lesson3/           # Basic chatbot implementation
│   ├── lesson4/           # MCP server creation
│   ├── lesson5/           # MCP client implementation
│   ├── lesson6/           # Multi-server connection
│   ├── lesson7/           # Resources and prompts
│   ├── lesson9/           # Remote server deployment
│   └── shared/            # Shared utilities
├── config/
│   └── server-config.json # Server configuration
├── papers/                # Storage for paper data
├── docs/                  # Additional documentation
├── tests/                 # Test files
├── package.json
├── .env.example
└── README.md
```

## 🎓 Lessons Overview

### Lesson 3: Basic Chatbot

Learn the fundamentals of tool calling with Anthropic's Claude API.

### Lesson 4: Creating an MCP Server

Build your first MCP server using the JavaScript SDK.

### Lesson 5: Creating an MCP Client

Implement a client that connects to your MCP server.

### Lesson 6: Connecting Multiple Servers

Extend your client to work with multiple MCP servers simultaneously.

### Lesson 7: Resources and Prompts

Add resource management and prompt templates to your server.

### Lesson 9: Remote Server Deployment

Deploy your MCP server for remote access using SSE/HTTP transports.

## 🛠️ Configuration

### Server Configuration (config/server-config.json)

```json
{
  "mcpServers": {
    "research": {
      "command": "node",
      "args": ["src/lesson4/research-server.js"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

### Environment Variables

```bash
ANTHROPIC_API_KEY=your_api_key_here
MCP_SERVER_PORT=8001
NODE_ENV=development
```

## 🔧 Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Building for Production

```bash
npm run build
```

## 🌐 Deployment

### Local Deployment

```bash
npm run start:prod
```

### Docker Deployment

```bash
docker build -t mcp-ai-apps .
docker run -p 8001:8001 mcp-ai-apps
```

### Cloud Deployment (Render.com)

See [deployment guide](https://claude.ai/chat/docs/deployment-guide.md) for detailed instructions.

## 📖 API Reference

### MCP Server API

```javascript
// Create a server
const server = new MCPServer('research', { port: 8001 });

// Add a tool
server.addTool({
  name: 'search_papers',
  description: 'Search for papers on arXiv',
  parameters: { /* ... */ },
  handler: async (params) => { /* ... */ }
});

// Add a resource
server.addResource({
  uri: 'papers://folders',
  handler: async () => { /* ... */ }
});

// Start the server
await server.start('stdio'); // or 'sse' or 'http'
```

### MCP Client API

```javascript
// Create a client
const client = new MCPChatbot();

// Connect to servers
await client.connectToServers();

// Process a query
await client.processQuery('Search for papers on AI safety');
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](https://claude.ai/chat/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](https://claude.ai/chat/LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://www.anthropic.com/) for Claude API
- [Model Context Protocol](https://modelcontextprotocol.io/) team
- Original Python course by DeepLearning.AI

## 📮 Contact

- GitHub Issues: [Create an issue](https://github.com/yourusername/mcp-ai-apps-js/issues)
- Email: your.email@example.com

## 🚦 Status

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Test Coverage](https://img.shields.io/badge/coverage-85%25-yellow)

------

Made with ❤️ by the MCP AI Apps community