import Anthropic from '@anthropic-ai/sdk'
import arxiv from 'arxiv-api-query'
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

const PAPER_DIR = path.join(__dirname, '../../papers')

// 工具函数
async function searchPapers(topic, maxResults = 5) {
  /**
   * 根据主题搜索arXiv上的论文并存储其信息
   * @param {string} topic - 要搜索的主题
   * @param {number} maxResults - 要检索的最大结果数（默认：5）
   * @returns {Array<string>} - 搜索到的论文ID列表
   */

  try {
    // 如果论文目录不存在，则创建
    await fs.mkdir(PAPER_DIR, { recursive: true })

    // 使用arxiv API搜索论文
    const searchQuery = {
      searchQuery: topic,
      start: 0,
      maxResults: maxResults,
      sortBy: 'relevance'
    }

    const papers = await arxiv.search(searchQuery)

    if (!papers || papers.length === 0) {
      console.log('No papers found for the topic:', topic)
      return []
    }

    // 创建该主题的目录
    const topicDir = topic.toLowerCase().replace(/ /g, '_')
    const topicPath = path.join(PAPER_DIR, topicDir)
    await fs.mkdir(topicPath, { recursive: true })

    const filePath = path.join(topicPath, 'papers_info.json')

    // 尝试加载已有的论文信息
    let papersInfo = {}
    try {
      const existingData = await fs.readFile(filePath, 'utf-8')
      papersInfo = JSON.parse(existingData)
    } catch (error) {
      // 文件不存在或无效，重新开始
      papersInfo = {}
    }

    // 处理每个论文并添加到papers_info
    const paperIds = []
    for (const paper of papers) {
      const paperId = paper.id.split('/').pop().split('v')[0]
      paperIds.push(paperId)

      papersInfo[paperId] = {
        title: paper.title.trim(),
        authors: paper.authors || [],
        summary: paper.summary.trim(),
        pdf_url: paper.pdf || paper.id.replace('abs', 'pdf'),
        published: paper.published || new Date().toISOString().split('T')[0]
      }
    }

    // 将更新后的papers_info保存到json文件
    await fs.writeFile(filePath, JSON.stringify(papersInfo, null, 2))

    console.log(`Results are saved in: ${filePath}`)

    return paperIds
  } catch (error) {
    console.error('Error searching papers:', error)
    throw new Error(`Failed to search papers: ${error.message}`)
  }
}

async function extractInfo(paperId) {
  /**
   * 在所有主题目录中搜索特定论文的信息
   * @param {string} paperId - 要查找的论文ID
   * @returns {string} - 如果找到，则返回包含论文信息的JSON字符串；否则返回错误消息
   */

  try {
    // 确保论文目录存在
    await fs.mkdir(PAPER_DIR, { recursive: true })

    const topics = await fs.readdir(PAPER_DIR)

    for (const topic of topics) {
      const topicPath = path.join(PAPER_DIR, topic)
      const stat = await fs.stat(topicPath)

      if (stat.isDirectory()) {
        const filePath = path.join(topicPath, 'papers_info.json')

        try {
          const data = await fs.readFile(filePath, 'utf-8')
          const papersInfo = JSON.parse(data)

          if (paperId in papersInfo) {
            return JSON.stringify(papersInfo[paperId], null, 2)
          }
        } catch (error) {
          // 如果文件不存在或无效，则继续下一个目录
          console.log(`Error reading file ${filePath}: ${error.message}`)
          continue
        }
      }
    }

    return `There's no saved information related to paper ${paperId}.`
  } catch (error) {
    console.error('Error extracting info:', error)
    return `Error searching for paper: ${error.message}`
  }
}

// 工具模式
const tools = [
  {
    name: "search_papers",
    description: "Search for papers on arXiv based on a topic and store their information.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic to search for"
        },
        max_results: {
          type: "integer",
          description: "Maximum number of results to retrieve",
          default: 5
        }
      },
      required: ["topic"]
    }
  },
  {
    name: "extract_info",
    description: "Search for information about a specific paper across all topic directories.",
    input_schema: {
      type: "object",
      properties: {
        paper_id: {
          type: "string",
          description: "The ID of the paper to look for"
        }
      },
      required: ["paper_id"]
    }
  }
]

// 工具映射
const toolMapping = {
  search_papers: searchPapers,
  extract_info: extractInfo
}

async function executeTool(toolName, toolArgs) {
  const toolFunction = toolMapping[toolName]
  if (!toolFunction) {
    throw new Error(`Tool ${toolName} not found`)
  }

  // 将蛇形命名参数转换为JavaScript的驼峰命名
  const jsArgs = {}
  for (const [key, value] of Object.entries(toolArgs)) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
    jsArgs[camelKey] = value
  }

  let result
  if (toolName === 'search_papers') {
    result = await toolFunction(jsArgs.topic, jsArgs.maxResults)
  } else if (toolName === 'extract_info') {
    result = await toolFunction(jsArgs.paperId)
  }

  if (result === null || result === undefined) {
    result = "The operation completed but didn't return any results."
  } else if (Array.isArray(result)) {
    result = result.length > 0 ? result.join(', ') : "No results found."
  } else if (typeof result === 'object') {
    result = JSON.stringify(result, null, 2)
  } else {
    result = String(result)
  }

  return result
}

// 聊天机器人代码
async function processQuery(anthropic, query) {
  const messages = [{ role: 'user', content: query }]

  let response = await anthropic.messages.create({
    max_tokens: 2024,
    model: 'claude-3-7-sonnet-20250219',
    tools: tools,
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

        console.log(`\nCalling tool ${toolName} with args ${JSON.stringify(toolArgs)}`)

        try {
          const result = await executeTool(toolName, toolArgs)

          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolId,
                content: result
              }
            ]
          })

          response = await anthropic.messages.create({
            max_tokens: 2024,
            model: 'claude-3-7-sonnet-20250219',
            tools: tools,
            messages: messages
          })

          if (response.content.length === 1 && response.content[0].type === 'text') {
            console.log(response.content[0].text)
            continueProcessing = false
          }
        } catch (error) {
          console.error('Error executing tool:', error)
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolId,
                content: `Error: ${error.message}`
              }
            ]
          })
          continueProcessing = false
        }
      }
    }
  }
}

// 聊天循环
function chatLoop() {
  // 检查API密钥
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not found in environment variables.')
    console.error('Please set it in your .env file.')
    process.exit(1)
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  console.log("🤖 AI Research Assistant")
  console.log("========================")
  console.log("I can help you search for academic papers on arXiv.")
  console.log("Type your queries or 'quit' to exit.\n")

  const askQuestion = () => {
    rl.question('\nQuery: ', async (query) => {
      query = query.trim()

      if (query.toLowerCase() === 'quit') {
        console.log('\nGoodbye! 👋')
        rl.close()
        return
      }

      try {
        await processQuery(anthropic, query)
        console.log('\n' + '─'.repeat(50))
      } catch (error) {
        console.error(`\nError: ${error.message}`)
        if (error.message.includes('API key')) {
          console.error('Please check your ANTHROPIC_API_KEY in the .env file.')
        }
      }

      askQuestion()
    })
  }

  askQuestion()
}

// 主执行
if (import.meta.url === `file://${process.argv[1]}`) {
  chatLoop()
}

export { searchPapers, extractInfo, processQuery } 