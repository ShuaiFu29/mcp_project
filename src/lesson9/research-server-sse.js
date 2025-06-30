import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import express from 'express'
import cors from 'cors'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import arxiv from 'arxiv-api'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
// 加载环境变量
dotenv.config()

// 获取当前文件的文件名和目录名
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PAPER_DIR = path.join(__dirname, '../../papers')
const PORT = process.env.MCP_SERVER_PORT || 8001
// 创建Express应用
const app = express()
app.use(cors())
app.use(express.json())
// 创建MCP服务器
const server = new Server(
  {
    name: 'research-server-sse',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    },
  }
)
// 工具实现（重用自lesson 7）
async function searchPapers({ topic, max_results = 5 }) {
  try {
    const papers = await arxiv.search({
      query: topic,
      maxResults: max_results,
      sortBy: 'relevance'
    })

    const topicDir = topic.toLowerCase().replace(/ /g, '_')
    const topicPath = path.join(PAPER_DIR, topicDir)
    await fs.mkdir(topicPath, { recursive: true })

    const filePath = path.join(topicPath, 'papers_info.json')

    let papersInfo = {}
    try {
      const existingData = await fs.readFile(filePath, 'utf-8')
      papersInfo = JSON.parse(existingData)
    } catch (error) {
      papersInfo = {}
    }

    const paperIds = []
    for (const paper of papers) {
      const paperId = paper.id.split('/').pop()
      paperIds.push(paperId)

      papersInfo[paperId] = {
        title: paper.title,
        authors: paper.authors.map(author => author.name),
        summary: paper.summary,
        pdf_url: paper.pdf,
        published: paper.published.toISOString().split('T')[0]
      }
    }

    await fs.writeFile(filePath, JSON.stringify(papersInfo, null, 2))
    console.log(`Results are saved in: ${filePath}`)

    return paperIds
  } catch (error) {
    console.error('Error searching papers:', error)
    throw error
  }
}

async function extractInfo({ paper_id }) {
  try {
    const topics = await fs.readdir(PAPER_DIR).catch(() => [])

    for (const topic of topics) {
      const topicPath = path.join(PAPER_DIR, topic)
      const stat = await fs.stat(topicPath).catch(() => null)

      if (stat && stat.isDirectory()) {
        const filePath = path.join(topicPath, 'papers_info.json')

        try {
          const data = await fs.readFile(filePath, 'utf-8')
          const papersInfo = JSON.parse(data)

          if (paper_id in papersInfo) {
            return JSON.stringify(papersInfo[paper_id], null, 2)
          }
        } catch (error) {
          continue
        }
      }
    }

    return `There's no saved information related to paper ${paper_id}.`
  } catch (error) {
    console.error('Error extracting info:', error)
    return `Error searching for paper: ${error.message}`
  }
}
// 资源实现
async function getAvailableFolders() {
  const folders = []

  try {
    await fs.mkdir(PAPER_DIR, { recursive: true })
    const items = await fs.readdir(PAPER_DIR)

    for (const item of items) {
      const itemPath = path.join(PAPER_DIR, item)
      const stat = await fs.stat(itemPath)

      if (stat.isDirectory()) {
        const papersFile = path.join(itemPath, 'papers_info.json')
        try {
          await fs.access(papersFile)
          folders.push(item)
        } catch {
          // 这个目录存在但没有papers_info.json文件，说明还没有搜索过相关论文
          console.log(`Skipping directory ${item}: no papers_info.json found`)
        }
      }
    }
  } catch (error) {
    console.error('Error reading folders:', error)
  }

  let content = '# Available Topics\n\n'
  if (folders.length > 0) {
    for (const folder of folders) {
      content += `- ${folder}\n`
    }
    content += `\nUse @${folders[0]} to access papers in that topic.\n`
  } else {
    content += 'No topics found.\n'
  }

  return content
}

async function getTopicPapers(topic) {
  const topicDir = topic.toLowerCase().replace(/ /g, '_')
  const papersFile = path.join(PAPER_DIR, topicDir, 'papers_info.json')

  try {
    const data = await fs.readFile(papersFile, 'utf-8')
    const papersData = JSON.parse(data)

    let content = `# Papers on ${topic.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n`
    content += `Total papers: ${Object.keys(papersData).length}\n\n`

    for (const [paperId, paperInfo] of Object.entries(papersData)) {
      content += `## ${paperInfo.title}\n`
      content += `- **Paper ID**: ${paperId}\n`
      content += `- **Authors**: ${paperInfo.authors.join(', ')}\n`
      content += `- **Published**: ${paperInfo.published}\n`
      content += `- **PDF URL**: [${paperInfo.pdf_url}](${paperInfo.pdf_url})\n\n`
      content += `### Summary\n${paperInfo.summary.substring(0, 500)}...\n\n`
      content += '---\n\n'
    }

    return content
  } catch (error) {
    return `# No papers found for topic: ${topic}\n\nTry searching for papers on this topic first.`
  }
}
// 提示实现
function generateSearchPrompt({ topic, num_papers = 5 }) {
  return `Search for ${num_papers} academic papers about '${topic}' using the search_papers tool. Follow these instructions:
    1. First, search for papers using search_papers(topic='${topic}', max_results=${num_papers})
    2. For each paper found, extract and organize the following information:
       - Paper title
       - Authors
       - Publication date
       - Brief summary of the key findings
       - Main contributions or innovations
       - Methodologies used
       - Relevance to the topic '${topic}'
    
    3. Provide a comprehensive summary that includes:
       - Overview of the current state of research in '${topic}'
       - Common themes and trends across the papers
       - Key research gaps or areas for future investigation
       - Most impactful or influential papers in this area
    
    4. Organize your findings in a clear, structured format with headings and bullet points for easy readability.
    
    Please present both detailed information about each paper and a high-level synthesis of the research landscape in ${topic}.`
}
// 设置所有请求处理程序（与lesson 7相同）
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_papers',
        description: 'Search for papers on arXiv based on a topic and store their information.',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'The topic to search for'
            },
            max_results: {
              type: 'integer',
              description: 'Maximum number of results to retrieve',
              default: 5
            }
          },
          required: ['topic']
        }
      },
      {
        name: 'extract_info',
        description: 'Search for information about a specific paper across all topic directories.',
        inputSchema: {
          type: 'object',
          properties: {
            paper_id: {
              type: 'string',
              description: 'The ID of the paper to look for'
            }
          },
          required: ['paper_id']
        }
      }
    ]
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    let result

    switch (name) {
      case 'search_papers':
        result = await searchPapers(args)
        break
      case 'extract_info':
        result = await extractInfo(args)
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    if (Array.isArray(result)) {
      result = result.join(', ')
    } else if (typeof result === 'object') {
      result = JSON.stringify(result, null, 2)
    }

    return {
      content: [
        {
          type: 'text',
          text: String(result)
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    }
  }
})

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [
    {
      uri: 'papers://folders',
      name: 'Available Topics',
      description: 'List all available topic folders in the papers directory',
      mimeType: 'text/markdown'
    }
  ]

  try {
    const items = await fs.readdir(PAPER_DIR).catch(() => [])
    for (const item of items) {
      const itemPath = path.join(PAPER_DIR, item)
      const stat = await fs.stat(itemPath).catch(() => null)

      if (stat && stat.isDirectory()) {
        const papersFile = path.join(itemPath, 'papers_info.json')
        try {
          await fs.access(papersFile)
          resources.push({
            uri: `papers://${item}`,
            name: `Papers on ${item.replace(/_/g, ' ')}`,
            description: `Detailed information about papers on ${item}`,
            mimeType: 'text/markdown'
          })
        } catch {
          // 这个目录存在但没有papers_info.json文件，说明还没有搜索过相关论文
          console.log(`Skipping directory ${item} for resources: no papers_info.json found`)
        }
      }
    }
  } catch (error) {
    console.error('Error listing resources:', error)
  }

  return { resources }
})

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params

  if (uri === 'papers://folders') {
    const content = await getAvailableFolders()
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content
        }
      ]
    }
  } else if (uri.startsWith('papers://')) {
    const topic = uri.replace('papers://', '')
    const content = await getTopicPapers(topic)
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content
        }
      ]
    }
  }

  throw new Error(`Unknown resource: ${uri}`)
})

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'generate_search_prompt',
        description: 'Generate a prompt for Claude to find and discuss academic papers on a specific topic',
        arguments: [
          {
            name: 'topic',
            description: 'The research topic to search for',
            required: true
          },
          {
            name: 'num_papers',
            description: 'Number of papers to search for',
            required: false
          }
        ]
      }
    ]
  }
})

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'generate_search_prompt') {
    const prompt = generateSearchPrompt(args)
    return {
      description: 'Research paper search and analysis prompt',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ]
    }
  }

  throw new Error(`Unknown prompt: ${name}`)
})
// 创建SSE端点
app.get('/sse', async (req, res) => {
  console.log('SSE client connected')
  // 设置SSE头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })
  // 创建SSE传输  
  const transport = new SSEServerTransport('/sse', res)
  await server.connect(transport)
  // 处理客户端断开连接 
  req.on('close', () => {
    console.log('SSE client disconnected')
  })
})
// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'research-server-sse' })
})
// 启动服务器
app.listen(PORT, () => {
  console.log(`SSE Server running at http://localhost:${PORT}/sse`)
  console.log(`Health check at http://localhost:${PORT}/health`)
}) 