# dsh-xhs-validator · 小红书商业验证

DeepSeek Harness（dsh）插件：**小红书商业创意验证**——5 阶段流程（关键词生成 → 数据抓取 → 痛点分析 → 竞争分析 → 验证报告）+ TikHub API 工具获取真实笔记与评论数据。

方法论来自 [XHS_Business_Idea_Validator](https://github.com/liangdabiao/XHS_Business_Idea_Validator)（liangdabiao）。

 <img width="1490" height="1140" alt="image" src="https://github.com/user-attachments/assets/dd670d1e-38c8-4443-bb82-4b59f41ffa41" />

## 装上以后有什么

| 能力 | 说明 |
|---|---|
| `xhs-business-validator` 技能 | 5 阶段验证方法论：关键词生成（产品/场景/痛点/地域词）→ 数据抓取 → 痛点分析（高频痛点/用户画像）→ 竞争分析（供给/定价/差异化/壁垒）→ 验证报告（🟢🟡🔴 结论） |
| `xhs_search` 工具 | 搜索小红书笔记（TikHub API）：返回标题/互动量/作者，按互动评分排序（点赞+收藏×2+分享×3+评论） |
| `xhs_comments` 工具 | 获取笔记评论（痛点金矿——用户的具体问题都在评论区） |
| 侧栏「小红书验证」面板 | 📖 5 阶段流程速览 + 数据源状态 + ⚠️ 免责声明 |

## 配置

TikHub API token（[tikhub.io](https://www.tikhub.io) 注册）：插件 → dsh-xhs-validator → Configuration → `tikhubToken`。

**未配置也能用**：模型会用 dsh 网络搜索或请你粘贴笔记内容，数据缺口在报告中如实标注。

## 使用

对话里一句话：**「验证一下在深圳开自习室的市场」**或**「在天津卖新会陈皮有市场吗」**。

模型按 5 阶段流程执行 → 报告输出到工作区 `reports/xhs-验证-<主题>.md`。

## ⚠️ 安全提醒

上游仓库 env.example 曾含明文 TikHub token（已随 GitHub 公开）——如果你用过那个 token，请尽快到 tikhub.io 轮换。本插件**不携带任何密钥**（有全局扫描测试防泄露）。

## ⚠️ 免责声明

本框架输出分析，不构成商业决策依据。数据来自小红书公开内容，请遵守平台规则，不引导爬虫或注册小号。

## 自检

```bash
npm install && npm test && npm run selftest && npm run build
```

- `npm test`：10 个单测（搜索解析/互动评分/429 重试/401 认证/token 缺失指引/评论解析/工具 schema/Config 不硬编码/技能 5 阶段/泄露扫描/面板鉴权），TikHub 用注入 fetch 零真实网络
- `npm run selftest`：快照+泄露扫描+客户端+面板 API
- `npm run build`：打包 dist/client.js + 三大自检


## 安装

```bash
dsh plugin --profile web add github:liangdabiao/dsh-xhs-validator
```

## 许可

MIT（liangdabiao）

