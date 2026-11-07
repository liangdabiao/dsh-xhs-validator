// 小红书商业验证 · Host 半边。
// 工具：xhs_search / xhs_comments（TikHub API，token 走 Config）。
// 技能：xhs-business-validator（5 阶段方法论）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createSkillProvider } from '../lib/skills.js'
import { searchNotes, getNoteComments, engagementScore, TikHubError } from '../lib/tikhub.js'
import { registerApi } from '../lib/api.js'

export const name = 'xhs-validator'

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  tikhubToken: Schema.string().default('').description('TikHub API token（https://www.tikhub.io 注册，敏感）'),
  scraperPages: Schema.number().min(1).max(5).default(2).description('每个关键词搜索页数'),
  commentsPerNote: Schema.number().min(5).max(50).default(20).description('每篇笔记抓取评论数'),
})

const configRef = { config: Config }

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object', additionalProperties: false, required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string' },
      data: { type: 'string', description: 'JSON 结果' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

function sortAndFormat(notes) {
  const sorted = notes
    .map((n) => ({ ...n, engagement: engagementScore(n) }))
    .sort((a, b) => b.engagement - a.engagement)
  return sorted
}

export const xhsSearchTool = {
  name: 'xhs_search',
  description:
    '搜索小红书笔记（TikHub API）。商业验证流程的数据采集工具：按关键词搜索笔记，返回标题/互动量/作者等，按互动评分排序。' +
    '配合 xhs-business-validator 技能的 5 阶段流程使用。需在 Configuration 填入 tikhubToken。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['keyword'],
    properties: {
      keyword: str('搜索关键词（如「新会陈皮」「陈皮怎么选」）'),
      page: num('页码，默认 1'),
      sort: str('排序：general 综合 / time 最新 / hot 热门', { enum: ['general', 'time', 'hot'] }),
      limit: num('返回条数上限（默认 20）'),
    },
  },
  timeoutMs: 60_000,
  output: OUTPUT,
  async execute(args) {
    const rt = configRef.rt
    try {
      const notes = await searchNotes(rt, args.keyword, { page: args.page || 1, sort: args.sort || 'general' })
      if (notes.length === 0) {
        return result(true, `「${args.keyword}」没有搜到笔记。这不是错误：换关键词或减少筛选条件再试。`)
      }
      const sorted = sortAndFormat(notes).slice(0, args.limit || 20)
      return result(
        true,
        `「${args.keyword}」搜到 ${notes.length} 篇笔记（按互动评分排序，互动 = 点赞+收藏×2+分享×3+评论）。`,
        JSON.stringify(sorted.map((n) => ({ noteId: n.noteId, title: n.title, engagement: n.engagement, liked: n.likedCount, comments: n.commentCount, author: n.author })), null, 1),
      )
    } catch (err) {
      if (err instanceof TikHubError) return result(false, `小红书数据获取失败：${err.message}`)
      throw err
    }
  },
}

export const xhsCommentsTool = {
  name: 'xhs_comments',
  description:
    '获取小红书笔记的评论（TikHub API）。评论是用户痛点的金矿——配合 xhs-business-validator 技能阶段 3 痛点分析使用。noteId 来自 xhs_search 的结果。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['note_id'],
    properties: {
      note_id: str('笔记 ID（xhs_search 返回的 noteId）'),
    },
  },
  timeoutMs: 60_000,
  output: OUTPUT,
  async execute(args) {
    const rt = configRef.rt
    try {
      const comments = await getNoteComments(rt, args.note_id)
      if (comments.length === 0) {
        return result(true, '这篇笔记没有评论或评论不可见。这不是错误：换互动量更高的笔记。')
      }
      return result(
        true,
        `获取到 ${comments.length} 条评论。痛点分析时优先看高赞评论和带 IP 属地的具体问题。`,
        JSON.stringify(comments, null, 1),
      )
    } catch (err) {
      if (err instanceof TikHubError) return result(false, `评论获取失败：${err.message}`)
      throw err
    }
  },
}

export function apply(ctx, config) {
  const rt = {
    ...config,
    dataDir: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'xhs-validator'),
  }
  configRef.config = config
  configRef.rt = rt

  ctx.skills.registerProvider(() => createSkillProvider([join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]))
  ctx.tools.register(xhsSearchTool)
  ctx.tools.register(xhsCommentsTool)
  ctx.effect(() => registerApi(ctx, rt), `${name}: routes`)
}

// 供测试
export const TOOLS = [xhsSearchTool, xhsCommentsTool]
