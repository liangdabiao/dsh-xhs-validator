// ============================================================================
// 小红书商业验证 · 浏览器半边（最小面板）。
// 两块：📖 5 阶段流程 + 数据源状态。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'xhs-validator'
const BASE = 'xhs-validator'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#c9302c' }),
    h('text', { x: 12, y: 12.5, 'font-size': 7, 'font-weight': 'bold', fill: '#fff', 'text-anchor': 'middle' }, '红书'),
    h('path', { d: 'M7 17h10', stroke: '#ffd24a', 'stroke-width': 1.4, 'stroke-linecap': 'round' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

const STAGES = [
  ['🔑 关键词生成', '围绕验证主题生成 3~5 组搜索词（产品词/场景词/痛点词/地域词）'],
  ['📥 数据抓取', 'xhs_search 按关键词搜笔记 → 取互动量 Top 5-10 → xhs_comments 拉评论'],
  ['🔍 痛点分析', '高频痛点 / 未满足需求 / 负面反馈 / 用户画像（从 IP 属地+语气推断）'],
  ['⚔️ 竞争分析', '供给端笔记数量与质量 / 定价线索 / 差异化机会 / 进入壁垒'],
  ['📄 验证报告', '🟢🟡🔴 结论 + 需求 + 竞争 + 执行建议，输出到工作区 reports/'],
]

function GuideTab() {
  const [health, setHealth] = useState(null)
  useEffect(() => {
    fetchJson('/api/health').then(setHealth).catch(() => setHealth({ tikhub: false }))
  }, [])
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么验证一个商业创意'),
      h('div', { style: styles.stepList },
        '在对话里一句话即可：',
        h('div', { style: styles.quote }, '「验证一下在深圳开自习室的市场」'),
        h('div', { style: styles.quote }, '「在天津卖新会陈皮有市场吗」'),
        '模型按 5 阶段流程抓取真实笔记与评论 → 分析痛点与竞争 → 产出验证报告。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '5 阶段流程'),
      h('div', { style: styles.stageList },
        STAGES.map(([title, desc], i) => h('div', { key: title, style: styles.stageRow },
          h('span', { style: styles.stageNum }, `${i + 1}`),
          h('div', null, h('div', { style: styles.viewTitle }, title), h('div', { style: styles.muted }, desc)))))),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '数据源'),
      h('div', { style: styles.muted },
        'TikHub API：', health?.tikhub ? '✓ 已配置' : '未配置（插件 → dsh-xhs-validator → Configuration 填入 tikhubToken）',
        h('br'), '未配置时模型会用网络搜索或请你粘贴笔记内容，数据缺口在报告中标注。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚠️ 免责声明'),
      h('div', { style: styles.muted }, '本框架输出分析，不构成商业决策依据。数据来自小红书公开内容，请遵守平台规则。')))
}

function Panel() {
  const [tab, setTab] = useState('guide')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.row },
      h('button', { style: styles.tabActive }, '📖 验证流程')),
    h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#c9302c', color: '#fff', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #c9302c', borderRadius: 8, background: '#f9eae8', color: '#7a1f15', fontWeight: 600, fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6 },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#f9eae8', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#7a1f15' },
  stageList: { display: 'grid', gap: 8 },
  stageRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  stageNum: { width: 22, height: 22, borderRadius: '50%', background: '#c9302c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  viewTitle: { fontWeight: 600 },
  muted: { color: '#8a8a92' },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 17, label: () => '小红书验证' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
