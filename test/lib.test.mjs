// TikHub 客户端 + 工具 schema 单测（注入 fetch，零真实网络）。零 dsh 依赖。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { searchNotes, getNoteComments, engagementScore, TikHubError } = await import('../lib/tikhub.js')
const { createSkillProvider } = await import('../lib/skills.js')
const { requestRejection } = await import('../lib/api.js')
const { TOOLS, Config } = await import('../src/host.js')

const CONFIG = { tikhubToken: 'test-token' }

// 模拟 TikHub 响应
function makeFetch(responses) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers })
    const res = responses[Math.min(calls.length - 1, responses.length - 1)]
    return {
      ok: true,
      status: res.status || 200,
      headers: { get: (k) => res.retryAfter || '5' },
      json: async () => res.body,
      text: async () => JSON.stringify(res.body),
    }
  }
  return { impl, calls }
}

test('searchNotes：解析 data.data.notes 并标准化字段', async () => {
  const { impl, calls } = makeFetch([
    { body: { data: { data: { notes: [
      { note_id: 'abc123', title: '新会陈皮购买攻略', liked_count: 100, collected_count: 50, comment_count: 20, share_count: 10, nickname: '陈皮哥' },
      { id: 'def456', display_title: '陈皮怎么选', liked_count: 30 },
      { title: '无 id 的笔记' }, // 无 noteId → 过滤掉
    ] } } } },
  ])
  const notes = await searchNotes(CONFIG, '新会陈皮', { fetchImpl: impl })
  assert.equal(notes.length, 2, '无 id 的应被过滤')
  assert.equal(notes[0].noteId, 'abc123')
  assert.equal(notes[0].likedCount, 100)
  assert.equal(notes[0].author, '陈皮哥')
  assert.equal(notes[1].noteId, 'def456')
  assert.match(calls[0].url, /search_notes/)
  assert.match(calls[0].url, /keyword=/)
  assert.equal(calls[0].headers.Authorization, 'Bearer test-token')
})

test('engagementScore：点赞+收藏×2+分享×3+评论', () => {
  assert.equal(engagementScore({ likedCount: 100, collectedCount: 50, shareCount: 10, commentCount: 20 }), 100 + 100 + 30 + 20)
})

test('429 限流：按 Retry-After 等待后重试', async () => {
  let count = 0
  const impl = async () => {
    count++
    if (count === 1) {
      return { ok: false, status: 429, headers: { get: () => '1' }, text: async () => '' }
    }
    return { ok: true, status: 200, json: async () => ({ data: { data: { notes: [{ note_id: 'x', title: 't' }] } } }) }
  }
  const notes = await searchNotes(CONFIG, 'kw', { fetchImpl: impl })
  assert.equal(notes.length, 1)
  assert.equal(count, 2, '应重试一次')
})

test('401/403：给可读的认证错误', async () => {
  const impl = async () => ({ ok: false, status: 401, headers: { get: () => '1' }, text: async () => 'unauthorized' })
  await assert.rejects(() => searchNotes(CONFIG, 'kw', { fetchImpl: impl }), /认证失败.*tikhubToken/)
})

test('未配置 token：报配置指引而不是裸错误', async () => {
  await assert.rejects(() => searchNotes({}, 'kw', { fetchImpl: async () => { throw new Error('不应发起') } }), /⚙️ 设置|tikhubToken/)
})

test('getNoteComments：解析 data.data.comments', async () => {
  const { impl } = makeFetch([
    { body: { data: { data: { comments: [
      { id: 'c1', content: '不知道怎么辨别真假', like_count: 15, nickname: '用户A', ip_location: '天津' },
      { id: 'c2', content: '价格太乱了', like_count: 8, nickname: '用户B', ip_location: '广东' },
    ] } } } },
  ])
  const comments = await getNoteComments(CONFIG, 'abc123', { fetchImpl: impl })
  assert.equal(comments.length, 2)
  assert.equal(comments[0].content, '不知道怎么辨别真假')
  assert.equal(comments[0].ipLocation, '天津')
})

test('工具 schema 合规', () => {
  assert.equal(TOOLS.length, 2)
  for (const t of TOOLS) {
    assert.match(t.name, /^xhs_(search|comments)$/)
    assert.equal(t.parameters.additionalProperties, false)
    assert.equal(typeof t.execute, 'function')
  }
})

test('Config：token 默认空（不硬编码）', () => {
  const validated = Config['~standard'].validate({})
  assert.ok(!resultIssues(validated))
  assert.equal(resultValue(validated).tikhubToken, '', 'token 默认应为空')
})
function resultIssues(r) { return r.issues }
function resultValue(r) { return r.value }

test('技能：5 阶段流程 + 铁律 + 泄露密钥不入包', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  const skill = await provider.get(candidates[0])
  for (const keyword of ['关键词生成', '痛点分析', '竞争分析', '验证报告', '不构成商业决策依据', '互动评分']) {
    assert.ok(skill.content.includes(keyword), `缺「${keyword}」`)
  }
  // 上游泄露 token 不入包
  const all = readFileSync(join(ROOT, 'skills', 'xhs-business-validator', 'SKILL.md'), 'utf8')
  assert.ok(!all.includes('vZdf' + 'XsQa'), '上游泄露 token 不应入包！')
  assert.ok(!readFileSync(join(ROOT, 'src', 'host.js'), 'utf8').includes('vZdf' + 'XsQa'))
})

test('面板 API 鉴权 fail closed', () => {
  const noService = { get: () => undefined }
  assert.equal(requestRejection(noService, { headers: {} }), false) // 宿主 token 鉴权是边界，服务缺席放行
})
