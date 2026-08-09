# 用按钮取代声纹与自动断句

## 为什么

当前单麦克风时靠「声纹」猜谁在说话，靠「静音 700ms」猜一句话说完了没有——两者都不可靠：会把没说完的话切断，也会把说完的话憋着不发给 AI。改成由你手动控制说话人和断句，识别与触发时机就完全确定。

## 交互设计（两种模式，设置里可切换）

**模式 A：按住说话（默认）**

底部两个大按钮：

```text
[  按住 = 对方在说  ]   [  按住 = 我在说  ]
```

- 按住时才录音，松手 = 这句结束，立即转写。
- 「对方」那句转写完成后立刻发给 AI 出思路。
- 「我」那句只记入对话记录，并取消正在生成的思路。
- 支持鼠标、触屏，长按不会误触发系统菜单；也保留空格键按住说话（桌面端）。

**模式 B：持续录音 + 手动求思路**

- 持续录音自动转写（保留现有的静音切段，只用来切转写片段，不再触发 AI）。
- 顶部一个「当前说话人：我 / 对方」分段切换，转写结果按该选择归属。
- 底部一个「给我思路」按钮，只有点它才把当前对话发给 AI。

两种模式都保留：暂停/结束、实时转写气泡、翻译、流式思路、重试。

## 声纹彻底删除

- 删除设置页的声纹卡片、录入引导、例句朗读界面与首页的「先录入声纹」提示条。
- 删除声纹的本机存储数据与相关代码（嵌入、分类、质心更新）。
- 音频来源仍保留「麦克风 / 系统音频 / 两者」：选「两者」时麦克风=我、系统音频=对方，此时按钮只作为断句用（可选按住覆盖）。

## 技术改动

- `src/lib/kibo/types.ts`：`Prefs` 新增 `captureMode: "push" | "continuous"`，默认 `"push"`；默认值同步到 `store.tsx` 的迁移逻辑。
- `src/lib/kibo/use-transcriber.ts`：移除 `voiceprint` 相关引用与 `resolveSpeaker`；新增 `beginTurn(speaker)` / `endTurn()` 手动分段 API；VAD 自动 flush 仅在 continuous 模式启用；push 模式下按住期间仍按现有节奏出实时 partial。
- `src/components/kibo/session-workbench.tsx`：底部控制栏按模式渲染按住按钮或说话人切换 + 「给我思路」；`handleFinal` 不再自动对 `other` 触发 AI（push 模式由松手触发，continuous 模式由按钮触发）；移除声纹提示条与 `loadVoiceprint` 引用。
- `src/components/kibo/settings-sheet.tsx`：移除声纹卡片，新增「输入方式」分段控件（按住说话 / 持续录音）。
- 删除文件：`src/lib/kibo/voiceprint.ts`、`src/components/kibo/voiceprint-card.tsx`、`src/components/kibo/voiceprint-step.tsx`、`src/lib/kibo/sample-lines.ts`；清理 `onboarding.tsx`、`dict.ts`、`routes/index.tsx` 中的声纹文案与步骤。
- `dict.ts` 增加三语新文案（按住说话、我在说、对方在说、给我思路、输入方式等）。
- 按钮沿用现有触感反馈与玻璃质感样式，手机端底部安全区不变。
