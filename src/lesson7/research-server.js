import Anthropic from '@anthropic-ai/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

// 获取当前文件的文件名和目录名
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 创建MCP聊天机器人
class MCPChatBot {
  constructor() {
    this.sessions = []
    this.clients = []
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    })
    this.availableTools = []
    this.toolToSession = {}
    this.availableResources = []
    this.resourceToSession = {}
    this.availablePrompts = []
    this.promptToSession = {}
  }

  async connectToServer(serverName, serverConfig) {
    try {
      console.log(`Connecting to ${serverName}...`)

      // 创建客户端
      const client = new Client({
        name: `mcp-chatbot-${serverName}`,
        version: '1.0.0',
      }, {
        capabilities: {}
      })

      // 根据服务器配置创建传输
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: process.env
      })

      // 连接到服务器
      await client.connect(transport)

      this.sessions.push(client)
      this.clients.push({ client, transport })

      // 列出可用的工具
      const toolsResponse = await client.listTools()
      const tools = toolsResponse.tools || []

      console.log(`Connected to ${serverName} with tools:`, tools.map(t => t.name))

      // 将工具映射到会话
      for (const tool of tools) {
        this.toolToSession[tool.name] = client
        this.availableTools.push({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema
        })
      }

      // 列出可用的资源
      try {
        const resourcesResponse = await client.listResources()
        const resources = resourcesResponse.resources || []

        for (const resource of resources) {
          this.resourceToSession[resource.uri] = client
          this.availableResources.push(resource)
        }

        if (resources.length > 0) {
          console.log(`Available resources:`, resources.map(r => r.uri))
        }
      } catch (error) {
        // 服务器可能不支持资源
        console.log(`No resources available for ${serverName}`)
      }

      // 列出可用的提示
      try {
        const promptsResponse = await client.listPrompts()
        const prompts = promptsResponse.prompts || []

        for (const prompt of prompts) {
          this.promptToSession[prompt.name] = client
          this.availablePrompts.push(prompt)
        }

        if (prompts.length > 0) {
          console.log(`Available prompts:`, prompts.map(p => p.name))
        }
      } catch (error) {
        // 服务器可能不支持提示
      }

    } catch (error) {
      console.error(`Failed to connect to ${serverName}:`, error)
    }
  }

  async connectToServers() {
    try {
      // 读取服务器配置
      const configPath = path.join(__dirname, '../../config/server-config.json')
      const configData = await fs.readFile(configPath, 'utf-8')
      const data = JSON.parse(configData)

      const servers = data.mcpServers || {}

      // 连接到每个服务器
      for (const [serverName, serverConfig] of Object.entries(servers)) {
        await this.connectToServer(serverName, serverConfig)
      }
    } catch (error) {
      console.error('Error loading server configuration:', error)
      throw error
    }
  }

  async getResource(resourceUri) {
    const session = this.resourceToSession[resourceUri]
    if (!session) {
      // 尝试通过模式找到匹配的资源
      for (const [uri, sess] of Object.entries(this.resourceToSession)) {
        if (resourceUri.startsWith('papers://') && uri.startsWith('papers://')) {
          const topic = resourceUri.replace('papers://', '')
          if (uri === `papers://${topic}`) {
            const result = await sess.readResource(uri)
            return result.contents[0].text
          }
        }
      }
      throw new Error(`Resource not found: ${resourceUri}`)
    }

    const result = await session.readResource(resourceUri)
    return result.contents[0].text
  }

  listPrompts() {
    console.log('\nAvailable prompts:')
    for (const prompt of this.availablePrompts) {
      console.log(`- ${prompt.name}: ${prompt.description}`)
      if (prompt.arguments && prompt.arguments.length > 0) {
        console.log(`  Arguments:`)
        for (const arg of prompt.arguments) {
          console.log(`    - ${arg.name}${arg.required ? ' (required)' : ''}: ${arg.description}`)
        }
      }
    }
  }

  async executePrompt(promptName, args) {
    const session = this.promptToSession[promptName]
    if (!session) {
      throw new Error(`Prompt not found: ${promptName}`)
    }

    const result = await session.getPrompt(promptName, args)
    return result.messages[0].content.text
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
            // 获取正确的会话
            const session = this.toolToSession[toolName]
            if (!session) {
              throw new Error(`No session found for tool ${toolName}`)
            }

            // 通过MCP会话调用工具
            const result = await session.callTool(toolName, toolArgs)

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
    console.log('Special commands:')
    console.log('  @<resource> - Access a resource (e.g., @folders, @ai_interpretability)')
    console.log('  /prompts - List available prompts')
    console.log('  /prompt <name> <args> - Execute a prompt')

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
          // 检查资源访问
          if (query.startsWith('@')) {
            const resourceName = query.substring(1)
            let resourceUri

            if (resourceName === 'folders') {
              resourceUri = 'papers://folders'
            } else {
              resourceUri = `papers://${resourceName}`
            }

            const content = await this.getResource(resourceUri)
            console.log(content)
          }
          // 检查提示命令
          else if (query === '/prompts') {
            this.listPrompts()
          }
          else if (query.startsWith('/prompt ')) {
            const parts = query.substring(8).split(' ')
            const promptName = parts[0]
            const args = {}

            // 解析参数
            for (let i = 1; i < parts.length; i++) {
              const [key, value] = parts[i].split('=')
              if (key && value) {
                args[key] = isNaN(value) ? value : parseInt(value)
              }
            }

            const promptText = await this.executePrompt(promptName, args)
            await this.processQuery(promptText)
          }
          // 常规查询
          else {
            await this.processQuery(query)
          }

          console.log('\n')
        } catch (error) {
          console.error(`\nError: ${error.message}`)
        }

        askQuestion()
      })
    }

    askQuestion()
  }

  async cleanup() {
    // 关闭所有客户端连接
    for (const { client } of this.clients) {
      try {
        await client.close()
      } catch (error) {
        console.error('Error closing client:', error)
      }
    }
  }
}

// 主执行
async function main() {
  const chatbot = new MCPChatBot()
  try {
    await chatbot.connectToServers()
    await chatbot.chatLoop()
  } catch (error) {
    console.error('Fatal error:', error)
  } finally {
    await chatbot.cleanup()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export default MCPChatBot 