import Anthropic from '@anthropic-ai/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import readline from 'readline'
import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

class MCPChatBot {
  constructor() {
    this.session = null
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    })
    this.availableTools = []
  }

  async processQuery(query) {
    const messages = [{ role: 'user', content: query }]

    let response = await this.anthropic.messages.create({
      max_tokens: 2024,
      model: 'claude-3-7-sonnet-20250219',
      tools: this.availableTools,
      messages: messages
    })

    let continueProcessing = true
    while (continueProcessing) {
      const assistantContent = []

      for (const content of response.content) {
        if (content.type === 'text') {
          console.log(content.text)
          assistantContent.push(content)

          if (response.content.length === 1) {
            continueProcessing = false
          }
        } else if (content.type === 'tool_use') {
          assistantContent.push(content)
          messages.push({ role: 'assistant', content: assistantContent })

          const toolId = content.id
          const toolArgs = content.input
          const toolName = content.name

          console.log(`Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}`)

          try {
            // 通过MCP会话调用工具
            const result = await this.session.callTool(toolName, toolArgs)

            messages.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolId,
                  content: result.content[0].text
                }
              ]
            })

            response = await this.anthropic.messages.create({
              max_tokens: 2024,
              model: 'claude-3-7-sonnet-20250219',
              tools: this.availableTools,
              messages: messages
            })

            if (response.content.length === 1 && response.content[0].type === 'text') {
              console.log(response.content[0].text)
              continueProcessing = false
            }
          } catch (error) {
            console.error('Error calling tool:', error)
            continueProcessing = false
          }
        }
      }
    }
  }

  async chatLoop() {
    console.log('\nMCP Chatbot Started!')
    console.log('Type your queries or "quit" to exit.')

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const askQuestion = () => {
      rl.question('\nQuery: ', async (query) => {
        query = query.trim()

        if (query.toLowerCase() === 'quit') {
          rl.close()
          return
        }

        try {
          await this.processQuery(query)
          console.log('\n')
        } catch (error) {
          console.error(`\nError: ${error.message}`)
        }

        askQuestion()
      })
    }

    askQuestion()
  }

  async connectToServerAndRun() {
    // 创建客户端和传输
    const client = new Client({
      name: 'mcp-chatbot',
      version: '1.0.0',
    }, {
      capabilities: {}
    })

    // 创建stdio传输以连接到服务器
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/lesson4/research-server.js'],
      env: process.env
    })

    // 连接到服务器
    await client.connect(transport)

    // 创建会话
    this.session = client

    // 初始化连接
    console.log('Connecting to MCP server...')

    // 列出可用工具
    const response = await this.session.listTools()
    const tools = response.tools

    console.log('\nConnected to server with tools:', tools.map(t => t.name))

    // 将MCP工具转换为Anthropic工具格式
    this.availableTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }))

    // 启动聊天循环
    await this.chatLoop()

    // 清理
    await client.close()
  }
}

// 主执行
async function main() {
  const chatbot = new MCPChatBot()
  try {
    await chatbot.connectToServerAndRun()
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export default MCPChatBot 