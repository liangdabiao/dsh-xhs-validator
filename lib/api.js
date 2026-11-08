// 面板数据面：/xhs-validator 前缀路由（健康 + 数据源状态）。
import { maskSettings, saveSettings, clearSettings, resolveToken } from './settings.js'

const BASE = '/xhs-validator'

function readJson(req, max = 512 * 1024) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') return reject(Object.assign(new Error('只接受 POST'), { status: 405 }))
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return reject(Object.assign(new Error('要 application/json'), { status: 415 }))
    }
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > max) { reject(Object.assign(new Error('请求体过大'), { status: 413 })); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(Object.assign(new Error('JSON 解析失败'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}

export function registerApi(ctx, rt) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'

        if (path === '/api/health' && req.method === 'GET') {
          // token 只报告是否已配置（面板 settings/Config/env 任一来源），绝不回显
          return json(res, 200, { ok: true, tikhub: Boolean(resolveToken()), credentials: maskSettings() })
        }
        if (path === '/api/config' && req.method === 'GET') {
          return json(res, 200, maskSettings())
        }
        if (path === '/api/config' && req.method === 'POST') {
          const body = await readJson(req)
          return json(res, 200, { ok: true, credentials: saveSettings(body) })
        }
        if (path === '/api/config' && req.method === 'DELETE') {
          clearSettings()
          return json(res, 200, { ok: true, credentials: maskSettings() })
        }
        json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: err?.message || '内部错误' })
      }
    },
  })
}
