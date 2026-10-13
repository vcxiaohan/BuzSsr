# BuzSsr

基于 Next.js（App Router）的前端学习项目，主要练习这几件事：

- 防重复提交：`useLockFn`
- 用 fetch 读取 SSE 流式响应，逐段显示大模型的输出
- 流式输出中边生成边解析结构化卡片（AI 生成商品评价）
- 全局悬浮的 AI 数据助手：多轮对话、ECharts 图表卡片、异步导出 Excel 并轮询进度

## 技术栈

- Next.js 16（App Router）、React 19、TypeScript
- Tailwind CSS 4
- ECharts 6（按需引入）

> Next.js 16 和以前的版本差异较大，改代码前先看 `node_modules/next/dist/docs/` 里的文档，详见 `AGENTS.md`。

## 快速开始

需要 Node.js 20 以上、Yarn 1.x。

```bash
yarn install
yarn dev
```

打开 <http://localhost:3000>，首页有所有演示页的入口。

| 命令 | 说明 |
| --- | --- |
| `yarn dev` | 启动开发服务器 |
| `yarn build` | 生产构建 |
| `yarn start` | 运行生产构建 |
| `yarn lint` | ESLint 检查 |

### 依赖的后端

除了防重复提交演示，其他功能都要调用 pyfast（FastAPI 项目，本地路径 `~/Documents/pyproject/pyfast`）。pyfast 需要在 `127.0.0.1:8000` 运行，`next.config.ts` 会把 `/py/*` 的请求转发过去：

```ts
{ source: "/py/:path*", destination: "http://127.0.0.1:8000/:path*" }
```

浏览器看到的都是同源请求，不需要处理跨域。

## 页面和功能

| 路径 | 功能 | 需要 pyfast |
| --- | --- | --- |
| `/` | 首页，所有演示的入口 | 否 |
| `/lock-demo` | 防重复提交演示 | 否 |
| `/chat-basic` | 流式对话最简版，只用 fetch 读流，不封装 Hook | 是 |
| `/chat-demo` | 流式对话完整版，基于 `useSSEStream`，支持停止生成、统计首段耗时和总耗时 | 是 |
| `/review` | AI 生成商品评价，多轮对话，边生成边渲染卡片 | 是 |
| `/api/order` | 模拟下单接口（Route Handler），GET 查列表，POST 下单 | 否 |
| 右下角悬浮按钮 | AI 数据助手，所有页面都有 | 是 |

### 防重复提交（`/lock-demo`）

`/api/order` 的 POST 故意延迟 2 秒返回。在 2 秒内连点“不加锁”会生成多个订单，连点“加锁”只会生成一个。

`useLockFn(fn, timeout = 10000)` 用 `useRef` 保存锁状态，请求进行中再次调用会直接忽略；同时返回 `loading` 用于按钮显示。如果 Promise 一直不结束，超时后也会强制解锁。

订单只存在内存里，重启开发服务器后就清空了。

### 流式对话（`/chat-basic`、`/chat-demo`）

请求 `POST /py/chat/stream`，后端按 SSE 格式返回：

```
data: {"message_id": "...", "data": "一段文字"}

: ping

data: [DONE]
```

读流时有几点要注意，代码里都有处理：

- `TextDecoder.decode` 要加 `{ stream: true }`，否则一个中文字的字节被拆到两次 `read` 里会出乱码。
- 一次 `read` 可能只读到半条消息，按 `\n\n` 切分后，最后一段不完整的要留到下次拼接。
- 冒号开头的是 SSE 注释行（后端空闲 15 秒发一次 `: ping` 心跳），不是数据。

`useSSEStream`（`src/hooks/use-sse-stream.ts`）在此基础上增加了：

- `isWaiting` / `isStreaming` 两个状态，区分“等待首段数据”和“输出中”。
- 连接超时（从发出请求到收到响应头）自动重试，最多 3 次，间隔 2s、4s、8s。
- 用户主动停止不会触发重试。

### AI 生成商品评价（`/review`）

请求 `POST /py/review/stream`，模型的输出约定为：

```
回复文字……
[END]
json:{"type":"review","nickname":"...","score":5,"content":"..."}
json:{"type":"tags","tags":["音质好","续航长"]}
json:{"type":"tip","content":"..."}
json:{"type":"options","options":["再来 5 条","语气更口语化"]}
```

- `[END]` 之前是回复文字，之后每行是一张卡片。还没收到完整的 `[END]` 时，末尾半个标记（如 `[EN`）先不显示。
- 已经收完的行只解析一次；正在生成的那一行如果是评价，用正则把已经到达的 `nickname`、`score`、`content` 先取出来展示，实现评价内容逐字出现。
- 卡片按 `type` 在 `cardMap` 中查找组件渲染，遇到不认识的 type 直接跳过。新增卡片类型只需要写一个组件并在 `cardMap` 中注册。
- 第一次发送时前端生成 `chat_id`，之后每次请求都带上，后端据此找到之前的对话，实现多轮修改；点“新对话”会丢掉 `chat_id`。
- 点“停止”会中断 fetch，后端检测到连接断开后也会停止调用模型。
- 点击选项卡片中的选项，会把选项文字作为下一句话直接发送。

### AI 数据助手（右下角悬浮窗）

挂在 `src/app/layout.tsx` 里，所有页面都能打开。代码在 `src/components/assistant/`：

| 文件 | 内容 |
| --- | --- |
| `assistant-widget.tsx` | 悬浮窗、消息列表、读取 `POST /py/assistant/stream` 的 SSE 流 |
| `auth.ts` | 自动登录，token 存在 `localStorage`，请求返回 401 时重新登录再请求一次 |
| `cards.tsx` | 导出卡片，卡片注册表 `cardMap` |
| `chart-cards.tsx` | 折线图 / 柱状图卡片、指标概览卡片 |

还没做登录页，`auth.ts` 里固定使用演示账号 `zhangsan@test.com` / `123456`（只绑定了店铺 1），换成 `admin@test.com` 可以看全部店铺。这些账号需要先在 pyfast 中初始化好。

助手的一条回复由文字段和卡片段按到达顺序组成。SSE 消息中带 `data` 的追加到文字，带 `card` 的作为一张新卡片插入，带 `error` 的显示错误。

支持的卡片：

| type | 说明 |
| --- | --- |
| `chart` | 折线图或柱状图（支持横向柱状图做排行），后端只给数据，图表样式在前端统一配置 |
| `kpi` | 指标概览，显示数值和环比，涨红跌绿 |
| `export` | 导出订单明细。文件在后台生成，每 2 秒请求一次 `GET /py/export/tasks/{task_id}` 查询进度，完成后显示下载按钮和数据解读（逐字显示） |

下载链接 10 分钟后过期，所以点击下载时会重新查询一次任务，拿到新链接再下载。

ECharts 只引入了用到的折线图、柱状图和几个组件，卡片卸载时会销毁图表实例，并用 `ResizeObserver` 跟随容器大小变化。

## 目录结构

```
src/
├── app/
│   ├── layout.tsx              根布局，挂载 AI 数据助手
│   ├── page.tsx                首页
│   ├── globals.css
│   ├── lock-demo/page.tsx      防重复提交演示
│   ├── chat-basic/page.tsx     流式对话最简版
│   ├── chat-demo/page.tsx      流式对话演示
│   ├── review/page.tsx         AI 生成商品评价
│   └── api/order/route.ts      模拟下单接口
├── components/
│   └── assistant/              AI 数据助手
│       ├── assistant-widget.tsx
│       ├── auth.ts
│       ├── cards.tsx
│       └── chart-cards.tsx
└── hooks/
    ├── use-lock-fn.ts          useLockFn 防重复提交
    └── use-sse-stream.ts       useSSEStream 用 fetch 读取 SSE 流
```

## 注意事项

- `crypto.randomUUID()` 只能在 HTTPS 或 localhost 下使用，用局域网 IP 访问时生成 `chat_id` 会报错。
- `/py` 的转发地址写死在 `next.config.ts` 中，pyfast 换了地址或端口需要同步修改。
