// 离线自检：工具 + 技能 + 泄露密钥扫描 + 面板 API。零真实网络（TikHub 用注入 fetch 测试）。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { searchNotes } = await import('../lib/tikhub.js')
const { createSkillProvider } = await import('../lib/skills.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try {
    await fn()
    console.log('ok')
  } catch (err) {
    failed++
    console.log('失败')
    console.error(`  ${err.message}`)
  }
}

await step('快照完整（SKILL.md 5 阶段方法论）', () => {
  if (!existsSync(join(ROOT, 'skills', 'xhs-business-validator', 'SKILL.md'))) throw new Error('缺 SKILL.md')
  const text = readFileSync(join(ROOT, 'skills', 'xhs-business-validator', 'SKILL.md'), 'utf8')
  for (const keyword of ['关键词生成', '数据抓取', '痛点分析', '竞争分析', '验证报告']) {
    if (!text.includes(keyword)) throw new Error(`缺阶段「${keyword}」`)
  }
})

const provider = createSkillProvider([join(ROOT, 'skills')])
let candidates
await step('provider 注册 + addendum', async () => {
  candidates = await provider.list()
  if (candidates.length !== 1) throw new Error(`候选 ${candidates.length} ≠ 1`)
  const skill = await provider.get(candidates[0])
  if (!skill.content.includes('不构成商业决策依据')) throw new Error('缺免责')
})

await step('上游泄露 token 全局扫描（不入任何文件）', () => {
  // 泄露 token 前缀（打乱写避免自匹配）：vZdf + XsQa
  const LEAKED = 'vZdf' + 'XsQa'
  function* walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) yield* walk(p)
      else yield p
    }
  }
  for (const dir of ['src', 'lib', 'skills', 'scripts', 'test']) {
    for (const file of walk(join(ROOT, dir))) {
      if (file === import.meta.filename) continue // 排除自身
      const text = readFileSync(file, 'utf8')
      if (text.includes(LEAKED)) throw new Error(`泄露 token 出现在 ${file}`)
    }
  }
})

await step('TikHub 客户端：注入 fetch 搜索+标准化', async () => {
  const impl = async () => ({
    ok: true, status: 200,
    json: async () => ({ data: { data: { notes: [{ note_id: 'n1', title: '测试', liked_count: 5 }] } } }),
  })
  const notes = await searchNotes({ tikhubToken: 't' }, 'kw', { fetchImpl: impl })
  if (notes.length !== 1 || notes[0].noteId !== 'n1') throw new Error('标准化失败')
})

await step('未配置 token 报配置指引', async () => {
  try {
    await searchNotes({}, 'kw', { fetchImpl: async () => { throw new Error('不应发起') } })
    throw new Error('不应成功')
  } catch (err) {
    if (!err.message.includes('⚙️ 设置')) throw new Error(`错误信息不明确：${err.message}`)
    if (/网络/.test(err.message)) throw new Error(`配置缺失被当成网络错误：${err.message}`)
  }
})

await step('面板 API 健康（内存 ctx 模拟）', async () => {
  const { registerApi } = await import('../lib/api.js')
  const captured = []
  const fakeRes = { writeHead() { return this }, end(chunk) { captured.push(String(chunk)) } }
  const fakeCtx = {
    get: () => ({ requestRejection: () => false }),
    webServer: { register: async ({ handler }) => { globalThis.__xhsHandler = handler } },
  }
  await registerApi(fakeCtx, { tikhubToken: '' })
  const handler = globalThis.__xhsHandler
  if (!handler) throw new Error('路由未注册')
  await handler({ method: 'GET', url: '/xhs-validator/api/health', headers: {} }, fakeRes)
  const health = JSON.parse(captured.at(-1))
  if (health.ok !== true || health.tikhub !== false) throw new Error('health 语义错误')
})

if (failed > 0) {
  console.error(`\n自检失败 ${failed} 项`)
  process.exit(1)
}
console.log('\n全部通过。')
