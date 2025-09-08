# Google Gemini 聊天记录导出器

🚀 一键导出 Google Gemini 网页端的聊天对话记录，支持多种格式（TXT/JSON/Markdown）

## ✨ 主要功能

- **自动滚动导出**：智能滚动整个聊天界面，完整捕获所有对话记录
- **多格式支持**：支持 TXT、JSON、Markdown 三种导出格式
- **智能内容识别**：自动识别用户提问、AI 思维链和回答内容
- **断点续传**：支持手动停止滚动，随时中断导出过程
- **界面友好**：左下角浮动按钮，可隐藏/显示，不影响正常使用

## 🛠️ 安装方法

1. 安装浏览器扩展管理器（如 [Tampermonkey](https://www.tampermonkey.net/)）
2. 复制 `gemini_chat_export.js` 脚本内容
3. 在 Tampermonkey 中创建新脚本并粘贴代码
4. 保存并启用脚本

## 📖 使用教程

### 基础使用

1. 打开 [Google Gemini](https://gemini.google.com/app) 聊天页面
2. 在页面左下角会看到 **"滚动导出 TXT"** 按钮和眼睛图标 👁️
3. 点击 **"滚动导出 TXT"** 开始自动导出
4. 脚本会自动滚动到顶部，然后向下滚动收集所有对话
5. 导出完成后会自动下载 TXT 文件

### 高级功能

#### 切换导出格式

在浏览器控制台（F12）中输入以下命令可切换导出格式：

```javascript
// 导出为 TXT 格式（默认）
window.__GEMINI_EXPORT_FORMAT = "txt";

// 导出为 JSON 格式
window.__GEMINI_EXPORT_FORMAT = "json";

// 导出为 Markdown 格式
window.__GEMINI_EXPORT_FORMAT = "md";
```

#### 格式说明

- **TXT 格式**：结构清晰的文本格式，包含分隔线，易于阅读
- **JSON 格式**：标准 JSON 数组，格式为 `[{role, content, id}]`
- **Markdown 格式**：支持折叠显示思维链，适合文档展示

### 操作技巧

- **隐藏/显示按钮**：点击 👁️ 图标可隐藏导出按钮
- **停止滚动**：导出过程中可点击 **"停止滚动"** 按钮中断
- **最佳实践**：建议在开始导出前手动滚动到对话顶部，确保完整性

## 📁 导出文件命名

文件命名格式：`项目名_scroll_时间戳.扩展名`

例如：`Gemini_编程问题讨论_scroll_20250909_143022.txt`

## ⚙️ 配置参数

可在脚本中调整以下参数来优化导出效果：

```javascript
const SCROLL_DELAY_MS = 1000; // 滚动间隔时间（毫秒）
const MAX_SCROLL_ATTEMPTS = 300; // 最大滚动次数
const SCROLL_INCREMENT_FACTOR = 0.85; // 滚动增量因子
```

## 🔧 故障排除

### 常见问题

**Q: 导出的内容不完整怎么办？**
A: 尝试增加 `SCROLL_DELAY_MS` 的值，给页面更多加载时间

**Q: 脚本按钮不显示？**
A: 确认已正确安装 Tampermonkey 并启用脚本，刷新页面重试

**Q: 滚动卡住不动？**
A: 点击"停止滚动"按钮，然后重新尝试导出

**Q: 遇到 TrustedHTML 错误？**
A: 当前版本（v1.0.4）已修复此问题，请更新到最新版本

### 技术支持

如果遇到页面结构更新导致的兼容性问题，可能需要：

1. 检查浏览器控制台的错误信息
2. 更新脚本中的 CSS 选择器
3. 调整滚动参数以适应新的页面结构

## 📄 许可证

本项目基于 Apache 2.0 许可证开源, 您可以在遵守许可证条款的前提下自由使用、修改和分发本项目的代码。

开源地址：[https://github.com/Sxuan-Coder/gemini_chat_export](https://github.com/Sxuan-Coder/gemini_chat_export)

## 🎯 版本信息

当前版本：v1.0.4

- 删除了 SDK 导出功能，专注于滚动导出
- 优化了用户界面，按钮移至左下角
- 增加了隐藏/显示功能
- 修复了兼容性问题

---

💡 **提示**：首次使用建议先在测试对话中尝试，确保导出效果符合预期后再用于重要对话的备份。
