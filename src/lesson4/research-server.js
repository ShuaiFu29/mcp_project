import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import arxiv from 'arxiv-api'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

// 获取当前文件的文件名和目录名
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PAPER_DIR = path.join(__dirname, '../../papers')

// 创建MCP服务器
const server = new Server(
  {
    name: 'research-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// 工具实现
async function searchPapers({ topic, max_results = 5 }) {
  try {
    // 使用arxiv API搜索论文
    const papers = await arxiv.search({
      query: topic,
      maxResults: max_results,
      sortBy: 'relevance'
    })

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
      papersInfo = {}
    }

    // 处理每个论文并添加到papers_info
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

    // 将更新后的papers_info保存到json文件
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
          console.log(`Error reading file ${filePath}: ${error.message}`)
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

// 处理列表工具请求
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

// 处理调用工具请求
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

    // 如果需要，将结果转换为字符串
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

// 启动服务器
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('MCP Research Server started on stdio')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
}) 