# Turn token usage

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的聊天界面增加一行常驻的
token 消耗显示：每轮回答结束后，在回复下方展示本轮与整个会话的计费用量，点击展开完整明细。

A DSH plugin that shows per-turn and session token usage under every completed Chat turn.

## 中文说明

在每轮对话结束时，于回答下方常驻显示一行：

```
本轮 12.3K tok · 累计 58.1K tok
```

- **本轮** = provider 实际上报的该轮总量（prompt + completion，跨该轮所有模型尝试累加）
- **累计** = 整个会话的计费用量（来自会话的 `tokenUsage` 投影，翻页或压缩都不会改变）

**点击这行**展开完整明细：

- 未缓存输入 / 已缓存输入 / 缓存写入 / 输出，以及其中的推理（reasoning）子集
- 缓存命中率，以及该轮实际计费的 provider / model 路由
- 会话累计的同样四个桶

**悬停**显示一行摘要。`Esc` 或点击面板外关闭。

### 行为与限制

- 这行在轮次结束后出现，位于回答下方、消息操作图标上方；**始终可见**，不依赖「性能与用量」
  设置，也不需要悬停。
- 本轮的数值来自已安装 Chat 包自身的轮次核算（即内置「Turn usage」背后的数据）。历史未完全
  加载、或 provider 未上报精确用量时，本轮数值显示为不可用，但会话累计仍正常显示。
- 会话累计覆盖整个会话日志，所以翻页或上下文压缩不影响它。
- **不发任何模型请求，也不向外发送任何数据** —— 插件只渲染客户端已经持有的值。
- 停用插件即移除该行；会话事件与内置「Turn usage」界面不受影响。

### 中文界面

包内同时带中英文案，跟随应用语言切换。

---

## English

Shows a persistent line under every completed turn in the Chat view:

```
本轮 12.3K tok · 累计 58.1K tok
```

The number after `本轮` is the exact provider-reported total for that turn (prompt plus
completion, across every model attempt in the turn). The number after `累计` is the whole
session's billed usage from the session's `tokenUsage` projection (it stays the same under
every turn and grows as the session runs).

Click the line to expand the full breakdown:

- uncached input, cached input, cache write, output, and the reasoning subset for the turn
- cache hit rate and the provider/model routes that billed the turn
- the session cumulative total with the same four buckets

Hover the line for a one-line text summary. Escape or a click outside closes the expanded
panel.

## Behavior and limits

- The line appears after a turn ends, below the assistant reply and above the message
  action icons. It is always visible; it does not depend on the **Performance & usage**
  setting or on hovering the turn.
- The turn figure comes from the installed Chat package's own turn accounting (the data
  behind **Turn usage**). When history is not fully loaded or the provider reported no
  exact usage, the turn figure is replaced by an unavailable note while the session total
  still shows.
- The session total covers the whole session log, so paging or compaction does not change
  it.
- No model requests are made and nothing is sent anywhere; the plugin only renders values
  the client already holds.
- Disabling the plugin removes the line; session events and the built-in **Turn usage**
  surface are unchanged.

## Install note

The bundle's `package.json` name is `@local/turn-usage`. If you install it into your own
profile, change the name prefix to something unique (`@yourname/turn-usage`) so it does not
collide with this local copy.

## Languages

Chinese and English copy ship with the bundle and follow the application language.

## License

MIT

