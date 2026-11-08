// TikHub 小红书 API 客户端：搜索笔记 / 获取评论，带 429 限流重试与指数退避。
// 移植自 XHS_Business_Idea_Validator 的 mcp_servers/xhs_server.py（上游无 LICENSE，作者 liangdabiao）。
// Token 走插件 Config（tikhubToken），绝不硬编码/回显。上游 env.example 里的明文 token 已泄露，不要复用。
import { setTimeout as sleep } from 'node:timers/promises'

const BASE_URL = 'https://api.tikhub.io'
const HEADERS = { Accept: 'application/json' }

export class TikHubError extends Error {}

function requireToken(config) {
  if (!config?.tikhubToken) {
    throw new TikHubError('TikHub token 未配置：在本面板「⚙️ 设置」标签粘贴即可（https://www.tikhub.io 注册）')
  }
  return config.tikhubToken
}

function headers(config) {
  return { ...HEADERS, Authorization: `Bearer ${requireToken(config)}` }
}

/** 单次 GET（带重试与 429 处理）。maxRetries 次，429 按 Retry-After 等待，网络错误指数退避。 */
async function getWithRetry(config, url, params, { maxRetries = 3, fetchImpl = fetch } = {}) {
  // 先解析 token：配置缺失是配置错误，不该进重试循环、更不该被包成「网络失败」
  // （0.3.0 之前 headers(config) 写在 try 里，缺 token 会被当网络错误重试 3 次、白等 3 秒）
  const authHeaders = headers(config)
  const query = new URLSearchParams(params).toString()
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let res
    try {
      res = await fetchImpl(`${url}?${query}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      if (err instanceof TikHubError) throw err // 语义错误直接冒泡，不重试
      if (attempt < maxRetries - 1) {
        await sleep(2 ** attempt * 1000) // 指数退避
        continue
      }
      throw new TikHubError(`TikHub 请求失败（网络）：${err.message}。检查网络/代理，或稍后重试。`)
    }
    // 429 限流：按 Retry-After 等待后重试
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') || 5) + 1
      if (attempt < maxRetries - 1) {
        await sleep(retryAfter * 1000)
        continue
      }
      throw new TikHubError('TikHub 限流（429），已达最大重试次数——稍后再试或降低请求频率')
    }
    if (res.status === 401 || res.status === 403) {
      throw new TikHubError('TikHub 认证失败（401/403）：token 无效或过期，请到本面板「⚙️ 设置」重新粘贴')
    }
    if (!res.ok) throw new TikHubError(`TikHub HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`)
    return res.json()
  }
}

/** 搜索小红书笔记。返回标准化笔记数组 */
export async function searchNotes(config, keyword, { page = 1, sort = 'general', fetchImpl = fetch } = {}) {
  const data = await getWithRetry(config, `${BASE_URL}/api/v1/xiaohongshu/web/search_notes`, {
    keyword, page, sort, noteType: '_0',
  }, { fetchImpl })
  // TikHub 响应结构：data.data.notes 或 data.data.items（两个版本兼容）
  const items = data?.data?.data?.notes || data?.data?.data?.items || data?.data?.notes || []
  return items.map((n) => ({
    noteId: n.note_id || n.id,
    title: String(n.title || n.display_title || '').slice(0, 120),
    likedCount: Number(n.liked_count || 0),
    collectedCount: Number(n.collected_count || 0),
    commentCount: Number(n.comment_count || 0),
    shareCount: Number(n.share_count || 0),
    author: String(n.nickname || n.author?.nickname || ''),
    type: n.type || 'note',
  })).filter((n) => n.noteId)
}

/** 获取笔记评论。返回标准化评论数组 */
export async function getNoteComments(config, noteId, { fetchImpl = fetch } = {}) {
  const data = await getWithRetry(config, `${BASE_URL}/api/v1/xiaohongshu/web/get_note_comments`, {
    note_id: noteId,
  }, { fetchImpl })
  const comments = data?.data?.data?.comments || data?.data?.comments || []
  return comments.map((c) => ({
    commentId: c.id || c.comment_id,
    content: String(c.content || '').slice(0, 500),
    likedCount: Number(c.like_count || c.liked_count || 0),
    author: String(c.nickname || c.author?.nickname || ''),
    ipLocation: String(c.ip_location || ''),
    subComments: Number(c.sub_comment_count || 0),
  }))
}

/** 互动评分（原项目公式：liked + collected*2 + shared*3 + comments） */
export function engagementScore(note) {
  return (note.likedCount || 0) + (note.collectedCount || 0) * 2 + (note.shareCount || 0) * 3 + (note.commentCount || 0)
}
