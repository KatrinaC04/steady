# Steady：Teams Mock Interview 实时回答助手 PRD

**文档状态：** 可交接开发  
**版本：** v1.0  
**日期：** 2026-10-18  
**适用范围：** 经参与者知情同意的 Mock Interview、个人练习和演示

## 1. 产品概述

在用户通过 Microsoft Teams 进行 Mock Interview 时，Steady 获取用户主动共享的会议音频，实时转录面试官的问题，并从 Steady 已选定的 Best Answers 中找出最相关的内容。系统先快速显示可扫读的回答要点，再根据需要整合为口语化示范答案。

本功能的核心不是让模型凭空生成经历，而是让用户已审核、已选为 Best Answer 的真实内容能够在新问题下被快速找回、重组和练习。

### 核心价值

- 戴耳机进行 Teams Mock Interview 时仍可获得面试官语音转录。
- 将措辞不同但意图相近的问题匹配到已有 Best Answers。
- 在问题结束后的数秒内显示高置信度、可追溯的回答提示。
- 保留用户原有事实、项目、指标和个人表达，不混合互相矛盾的经历。

## 2. 背景与现有基础

现有项目位于 `Interview_prep_ai`，产品名为 Steady，技术栈为 Next.js 15、React 19 和 TypeScript。

已经具备：

- Behavioral Question Bank 和 77 道 canonical questions。
- Question Map，将问题归入 motivation、leadership、conflict、ambiguity、data、technical 等 mother themes。
- 多次回答尝试、手动答案录入和 Best Answer 选择。
- OpenAI Realtime WebRTC 连接及实时语音转录基础。
- 本地 JSON Session 存储和 Library API。

当前 Best Answer 存储方式：

- `data/preferences/best-answers.json` 保存 `questionId -> { sessionId, createdAt }`。
- 具体答案仍位于 `data/{sessionId}.json` 的 `answers[]` 内。
- `GET /api/library` 会解析上述引用并返回 `bestAttempt`。

因此开发第一步必须建立一个稳定的 Best Answer 读取与索引层，不能把 preferences 文件误当作答案正文。

## 3. 用户与使用场景

### 目标用户

- 正在准备 behavioral interview 的候选人。
- 与朋友、导师或 AI 面试官进行 Teams Mock Interview 的用户。
- 已经在 Steady Question Bank 中维护 Best Answers 的用户。

### 主流程

1. 用户进入 Steady 的 Live Mock Companion 页面。
2. 用户选择语言和音频来源，并明确点击“开始共享音频”。
3. Steady 展示实时字幕。
4. 系统检测面试官的一轮提问基本结束。
5. 系统用稳定后的问题文本检索 Best Answers。
6. 页面立即显示最相关的答案卡片和来源。
7. 系统流式生成简短回答提纲；用户可展开口语化完整答案。
8. 后续追问到来时，系统更新问题上下文并重新检索。
9. Mock 结束后，用户可以查看问题、匹配结果和延迟记录；默认不保存原始会议音频。

## 4. 产品边界

### MVP 包含

- 用户主动授权的系统/标签页音频捕获。
- 英文优先，兼容中文及中英混合转录。
- 流式字幕与问题结束检测。
- 只检索已选择的 Best Answers。
- Top 3 匹配结果、置信度、原始问题及答案来源。
- 基于 Best Answers 的要点整合和可选完整示范答案。
- 手动“现在检索”按钮，作为自动断句失败时的兜底。
- 用户随时暂停、恢复和停止捕获。

### MVP 不包含

- 未经同意的录音、隐藏运行或规避会议平台检测。
- 自动替用户在 Teams 中发言。
- 凭空创造个人经历、项目数据或成就。
- 通用互联网搜索。
- 把所有历史 attempts 当作高质量来源；MVP 只使用 Best Answers。
- 对真实招聘面试提供隐蔽辅助。

## 5. 功能需求

### FR-1：Best Answer 解析与标准化

新增服务函数，例如 `getResolvedBestAnswers()`，完成：

1. 读取 Best Answer selections。
2. 按 `sessionId` 加载 Session。
3. 按 `createdAt` 精确定位对应 `InterviewAnswer`。
4. 从 Question Bank 补充 canonical prompt、category 和 source。
5. 从 Question Map 补充 mother theme 和 question twist。
6. 选择正文时按以下优先级：
   - `polishedAnswer`
   - `repairedTranscript`
   - `transcript`
7. 忽略悬空引用、空答案和无法加载的 Session，并记录可诊断 warning。

标准化结构建议：

```ts
type ResolvedBestAnswer = {
  questionId: string;
  canonicalQuestion: string;
  attemptedQuestion: string;
  category: string;
  motherId: string;
  twist: string;
  answerText: string;
  sessionId: string;
  answerCreatedAt: string;
  updatedAt: string;
};
```

### FR-2：可检索索引

每次 Best Answer 被新增、修改、取消选择或答案正文发生变化时，使索引失效并重建相关条目。

MVP 采用混合排序：

- Canonical question 文本相似度。
- Attempted question 文本相似度。
- Mother theme 命中。
- Question twist 命中。
- Category 命中。
- Answer 正文中的关键实体和技能命中。

推荐评分逻辑：

```text
finalScore =
  0.55 * semanticSimilarity
  + 0.20 * canonicalQuestionSimilarity
  + 0.15 * motherThemeMatch
  + 0.10 * keywordEntityOverlap
```

如果暂时不引入 embedding，先实现 BM25/词项重合 + `inferMotherId()` 的确定性基线，但接口必须允许后续替换为 embedding。索引只存本地或受控后端，不把完整题库暴露给浏览器日志。

### FR-3：会议音频捕获

支持两种实施路径：

#### 路径 A：Web MVP

- 使用 `getDisplayMedia()` 让用户主动选择带音频的共享来源。
- UI 必须检测返回的 MediaStream 是否真正包含 audio track。
- 若当前浏览器/系统无法共享 Teams 桌面应用音频，给出明确提示，并允许用户切换到 Teams Web 标签页或使用麦克风兜底。

#### 路径 B：可靠桌面版本

- 使用 Electron/Tauri 加原生音频能力捕获指定应用或系统输出。
- macOS 使用系统提供并经用户授权的屏幕与系统音频捕获能力。
- Windows 使用 WASAPI loopback。
- 桌面版本作为 Web MVP 验证之后的阶段，不应阻塞检索与 UI 开发。

捕获必须是显式、可见和可停止的。默认不保存原始音频。

### FR-4：流式转录

- 复用或抽取 `useRealtimeInterview` 中的 Realtime WebRTC 能力。
- 新增对“会议输入流”的支持，不能假定输入一定来自 microphone track。
- 展示 partial transcript 和 final transcript。
- 保存当前 utterance、最近 2–3 个 interviewer turns 和时间戳。
- 出错时允许重连，并保留屏幕上最近的稳定字幕。

### FR-5：问题结束检测

自动触发必须综合：

- 服务端/客户端 VAD 的语音结束事件。
- 至少约 700–1200 ms 的静音窗口，可配置。
- 文本语义是否像完整问题或指令。
- 最短有效文本长度。
- 对 “and…”, “also…”, “one more thing…” 等未完成句降低结束置信度。

交互规则：

- partial transcript 可用于预取检索，但不能直接替换正式结果。
- stable/final transcript 触发正式排序。
- 新增语音到来时取消仍未完成的旧生成请求。
- 提供“现在检索”“重新检索”和“这不是问题”按钮。

### FR-6：答案检索与展示

首次正式检索返回 Top 3：

- 原始 canonical/attempted question。
- mother theme/category。
- 匹配置信度。
- Answer 前若干行预览。
- “查看原始 Best Answer”操作。

低置信度行为：

- Top 1 低于阈值时，不伪装成确定答案。
- 展示“未找到高置信度匹配”，保留 Top 3 候选供用户选择。
- 用户选择某个候选后，可继续执行整合。

### FR-7：受约束的答案整合

生成器只允许使用检索出的 Best Answers，并接收当前问题和候选答案的明确来源标识。

输出分两层：

1. **Quick Outline**：4–6 个短要点，优先在问题结束后 2 秒内开始显示。
2. **Full Practice Answer**：可展开、口语化、约 60–120 秒的示范回答。

生成规则：

- 不得新增来源中不存在的数字、公司、角色、工具或成果。
- 多个答案事实冲突时不得自行融合；优先使用 Top 1，或显式提示用户选择经历。
- Behavioral question 默认采用自然的 Situation → Action → Result → Learning 结构，但不要机械显示 STAR 标签。
- 针对问题 twist 调整重心，而不是机械复制原答案。
- 在 UI 中列出使用了哪些 Best Answers。

### FR-8：会话与隐私

- 开始前展示用途、音频来源和保存策略。
- 默认不保存音频；字幕和匹配记录也默认仅保留在当前页面生命周期。
- 若用户选择保存 Mock 复盘，保存问题、稳定转录、选中来源、生成结果和延迟指标。
- API 日志不得打印完整 Best Answer、音频内容或 Realtime token。
- 页面始终显示捕获中/已暂停/已停止状态。

## 6. 页面设计

建议新增路由：`/live-companion`。

### Setup 状态

- 音频来源选择与权限说明。
- 语言选择。
- Best Answer 索引状态：数量、最近更新时间、无效引用数量。
- “测试音频”及实时电平。
- “开始 Mock Companion”按钮。

### Live 状态

三栏或响应式双栏布局：

- 顶部：捕获状态、转录状态、总延迟、暂停/停止。
- 左侧：实时字幕与已识别的问题。
- 中间：Quick Outline 和可展开完整答案。
- 右侧：Top 3 Best Answer 来源卡片。

默认突出 Quick Outline，完整长答案折叠，避免长文本成为主要视觉负担。

### Error/Empty 状态

- 没有 audio track。
- Realtime API 未配置或连接失败。
- 尚未选择任何 Best Answer。
- 找不到高置信度匹配。
- macOS/浏览器不支持当前 Teams 音频来源。

每种状态都必须提供下一步操作，不能只显示错误代码。

## 7. API 建议

### `GET /api/best-answers/index`

返回索引摘要和可选的标准化条目。默认不要把所有完整答案发给前端。

```json
{
  "count": 42,
  "updatedAt": "2026-10-18T20:00:00.000Z",
  "warnings": []
}
```

### `POST /api/best-answers/search`

```json
{
  "query": "Tell me about a time you disagreed with a stakeholder",
  "language": "English",
  "limit": 3,
  "conversationContext": []
}
```

返回匹配项、各评分分量及是否达到置信度阈值。

### `POST /api/live-companion/compose`

输入当前问题和服务端可验证的 candidate IDs。服务端重新解析原始 Best Answers，不能信任浏览器传回的答案正文。响应采用流式输出。

## 8. 非功能需求

### 延迟目标

从面试官停止说话开始计时：

- 稳定问题文本：P50 ≤ 1.2 秒，P95 ≤ 2.5 秒。
- Top 3 检索结果：稳定文本产生后 P50 ≤ 300 ms，P95 ≤ 800 ms。
- Quick Outline 首 token：稳定文本产生后 P50 ≤ 2.0 秒，P95 ≤ 4.0 秒。
- 用户手动点击“现在检索”后，Top 3 P95 ≤ 1 秒。

### 准确性目标

- 在一组至少 50 条真实/改写 behavioral prompts 上，正确 mother theme 的 Recall@3 ≥ 90%。
- 已有对应 Best Answer 的问题，人工标注正确答案 Recall@3 ≥ 85%。
- 不存在可靠匹配时，应宁可显示低置信度提示，不强行生成。
- 事实保真测试中不得产生来源之外的硬事实。

### 可靠性与可观察性

记录但不包含敏感正文的指标：

- ASR 首字延迟和 final 延迟。
- 问题结束检测延迟。
- Search latency、Top 1 score 和用户改选率。
- Compose time-to-first-token。
- 取消请求数量、重连次数和错误类型。

## 9. 测试要求

### 单元测试

- Best Answer 引用成功解析。
- Session 不存在、createdAt 不匹配和空文本的处理。
- 正文优先级 `polishedAnswer > repairedTranscript > transcript`。
- mother theme 和 twist 元数据补全。
- 排序稳定、limit 生效、低置信度判断。
- 事实约束 prompt 和候选 ID 服务端验证。

### 集成测试

- 新增/取消 Best Answer 后索引更新。
- 流式字幕从 partial 到 final 后只触发一次正式 compose。
- 新问题到来会取消上一条未完成生成。
- Realtime 断开后可恢复。
- 没有 audio track 时不会进入假监听状态。

### 人工验收

- Teams Web + 耳机。
- Teams 桌面应用 + 支持的系统音频路径。
- 英文、中文和中英混合问题。
- 连续追问、长停顿、自我修正和半句话停顿。
- 问题措辞与 canonical question 完全不同但意图相同。

## 10. 实施顺序

### Phase 1：检索核心

- 实现 `getResolvedBestAnswers()`。
- 建立确定性检索基线和测试语料。
- 新增 search API。
- 用命令行或简单测试页验证 Recall@3。

### Phase 2：Live Companion Web MVP

- 新增 `/live-companion`。
- 接入用户授权的共享音频流。
- 抽取并复用 Realtime transcription。
- 实现字幕、断句、Top 3 和手动触发。

### Phase 3：答案整合

- 增加受约束的流式 compose API。
- 实现 Quick Outline、Full Answer 和来源展示。
- 加入请求取消、低置信度和事实保真保护。

### Phase 4：质量与桌面可靠性

- 用标注集调优混合排序与阈值。
- 加入 embedding 索引（若基线不达标）。
- 验证 macOS/Windows Teams 桌面音频；必要时实现桌面 companion。
- 完成延迟、隐私和错误恢复验收。

## 11. MVP 验收标准

以下条件全部满足才视为完成：

1. 用户戴耳机并通过受支持的音频共享路径进行 Teams Mock 时，页面能显示面试官实时字幕。
2. 系统只从已选定的 Best Answers 检索，不把普通 attempts 混入结果。
3. 对测试集问题，正确答案 Recall@3 达到 85% 以上。
4. 问题结束后 P95 800 ms 内显示 Top 3，P95 4 秒内开始显示 Quick Outline。
5. 每个生成结果都能追溯到一个或多个 Best Answers。
6. 系统不会把互相矛盾的经历自动拼成一段，也不会新增来源外硬事实。
7. 用户可随时暂停或停止捕获，且默认不保存原始音频。
8. 不支持的浏览器/音频来源有明确错误说明和可执行的替代方案。
9. 新增功能通过 TypeScript build，关键解析、检索与状态转换具有自动化测试。

## 12. Claude 开发交接提示

开始编码前请先阅读：

- `README.md`
- `lib/types.ts`
- `lib/store.ts`
- `lib/question-map.ts`
- `lib/interviewer.ts`
- `app/api/library/route.ts`
- `app/api/library/answers/route.ts`
- `hooks/useRealtimeInterview.ts`
- `data/preferences/best-answers.json`

注意当前工作区可能已有未提交修改。不要覆盖或回退与本功能无关的用户改动。建议严格按 Phase 1 → Phase 2 → Phase 3 推进，每一阶段都先运行 build 和相关测试，再进入下一阶段。

最优先交付不是完整 UI，而是一个经过测试的 `ResolvedBestAnswer[]` 数据层和能够对改写问题稳定返回 Top 3 的 search API。音频和生成层都依赖这个基础。
