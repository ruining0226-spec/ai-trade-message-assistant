# AI 外贸开发信助手

面向 B2B 空压机海外客户开发的工具。用户可以上传 LinkedIn、Facebook、公司主页、官网或搜索结果截图，通过豆包/火山方舟视觉模型提取客户资料，人工确认后生成、编辑、复制和优化个性化开发信。

## 当前完成的功能

- 专业 SaaS 后台布局、工作台统计与最近任务
- 多图点击/拖拽上传、本地预览、格式和大小校验
- 豆包/火山方舟多图视觉分析、运行时结构校验及完整的人工确认表单
- 未配置视觉模型时自动使用演示分析；真实调用失败时由用户明确选择是否使用演示结果
- 渠道、目的、客户类型、语气、长度、语言和产品配置
- 根据客户、公司、职位、行业和产品动态生成中英文内容
- 在线编辑、四种复制方式、AI文案优化和重新生成
- 单一当前结果；保存、优化和重新生成直接覆盖当前结果
- localStorage 持久化任务、公司资料和产品资料
- 历史任务搜索筛选、详情、状态、跟进日期、备注、归档和删除
- 从历史任务继续编辑；客户按姓名与公司聚合去重

> 当前客户截图识别、资料提取、需求分析和初始开发信由一次火山方舟请求完成，文案优化使用独立的轻量请求。任务、公司资料和产品资料仍保存在浏览器 localStorage，未接入登录、数据库或云端文件存储。

## 配置火山方舟视觉 AI

复制 `.env.example` 为 `.env.local`，在火山方舟控制台创建 API Key，并填写支持图片理解的模型 ID 或推理接入点 ID：

```env
ARK_API_KEY=你的服务端API密钥
ARK_MODEL_ID=控制台提供的模型ID或推理接入点ID
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

- `ARK_API_KEY` 只由 Next.js 服务端 Route 读取，不得改为 `NEXT_PUBLIC_` 变量。
- `ARK_MODEL_ID` 不在代码中写死，请以控制台实际提供、且支持图片理解的调用参数为准。
- `ARK_BASE_URL` 可覆盖，默认使用北京地域 `/api/v3` 地址。
- `.env.local` 已被 `.gitignore` 的 `.env.*` 规则忽略；`.env.example` 不含秘密，可以提交。
- 修改环境变量后需要重新启动开发服务器。

同时配置 Key 和模型 ID 时默认显示“真实 AI 模式”；缺少任意一项时显示“尚未配置豆包/火山引擎API，当前使用演示分析。”真实请求失败不会暗中替换为演示数据，页面会显示安全错误，并提供“使用演示结果继续”。任务记录使用 `volcengine`、`mock` 或旧数据兼容标记 `legacy` 区分来源。

支持 JPEG、PNG、WebP，原图单张不超过 10MB，一次最多 5 张。浏览器会先转换为适合文字识别的 WebP 并按需缩小尺寸；压缩后单张不超过 1.5MB、整批图片不超过 3MB。服务端继续检查文件签名、尺寸和内容。图片只在本次请求的浏览器和服务端内存中处理，任务仅保存文件名、格式和大小，不把原图写入项目目录或 localStorage。

常见问题：

- “鉴权失败”：检查 `ARK_API_KEY` 是否有效，并确认修改后已重启服务。
- “模型不存在、未开通”：检查 `ARK_MODEL_ID` 是否支持视觉理解以及账号是否已开通该模型。
- “余额或额度不足”：前往火山方舟控制台检查账户额度。
- “分析超时/网络失败”：稍后重试；系统只对临时网络或上游服务错误自动重试一次。
- “模型未返回可用结构”：重新上传清晰截图并重试，或明确选择演示结果后人工填写。

不要在截图、浏览器日志、工单或源代码中粘贴 API Key；不要提交 `.env.local`。

## 本地运行

要求 Node.js 20.9 或更高版本，并使用 pnpm 11.9（项目声明版本为 `pnpm@11.9.0`）。

```bash
pnpm install
pnpm dev
```

默认访问地址：[http://localhost:3000](http://localhost:3000)

本地环境变量：复制 `.env.example` 为 `.env.local`，然后只在本机填写 `ARK_API_KEY`、`ARK_MODEL_ID`；如需覆盖默认接口地址，再填写 `ARK_BASE_URL`。`.env.local` 不得提交。

## Vercel 小范围试用部署

1. 将代码仓库导入 Vercel，Framework Preset 使用 Next.js，包管理器使用 pnpm。
2. 在 Vercel Project Settings → Environment Variables 中配置 `ARK_API_KEY` 和 `ARK_MODEL_ID`；`ARK_BASE_URL` 为可选项。变量名不得添加 `NEXT_PUBLIC_` 前缀，也不要把真实值写进仓库。
3. 部署后使用小于页面所示限制的真实截图完成一次端到端验证，并设置火山方舟和 Vercel 的费用告警。

当前任务、客户资料、公司资料和生成结果仅保存在使用者浏览器的 localStorage；截图只用于本次分析请求，不长期保存。该版本适合受控的小范围试用，不具备账号体系、多用户权限、跨设备同步或云端数据备份能力，不应直接作为公开生产系统。

质量检查：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 目录结构

```text
app/                 Next.js App Router 页面与全局样式
components/layout/   后台导航和页面壳层
components/providers/本地数据状态提供器
components/task/     新建任务四步工作流
components/ui/       通用页面组件
lib/mock/            演示分析数据与本地开发信生成逻辑
lib/vision/          图片校验预处理、火山方舟调用与响应 Schema
lib/storage/         localStorage 访问封装
lib/utils/           ID、日期与样式工具
types/               核心 TypeScript 数据类型
docs/                产品需求与架构说明
prompts/             重大开发任务记录
```

## 后续计划

当前开发信生成、改短、调整语气和重新生成仍是本地模拟功能。下一阶段可在不改变人工确认边界的前提下，为开发信生成建立独立的服务端 Schema 与事实护栏；Supabase、登录和云端图片存储应继续作为后续独立阶段处理。
