# AIhub Enhenced AI对话导出增强插件

🚀 一键导出 Google Gemini 网页端的聊天对话记录，支持多种格式（TXT/JSON/Markdown），并提供智能导航目录。

**当前版本：v1.1.1**

> **推荐使用 Chrome 插件版** 🔥  
> 我们推出了功能更强大的 **Chrome 插件版本**，支持：
>
> - **多平台支持**：Gemini、GPT、Grok 等主流 AI 聊天平台
> - **对话目录增强**：智能提取对话结构，快速导航定位，支持拖拽移动
> - **一键导出**：更稳定的导出体验，支持批量操作
> - **持续更新**：更快的功能迭代和问题修复
>
> 👉 [前往 AIhubEnhenced 仓库下载插件](https://github.com/Sxuan-Coder/AIhubEnhenced/releases)（支持 Chrome、Edge 等浏览器）

---

## ✨ 主要功能

- **智能对话目录**：新增右侧独立目录面板，自动提取用户提问，点击即可快速跳转定位对话位置。
- **深浅色主题同步**：智能感应 Gemini 官方网页主题变化，UI 界面实时同步切换深色/浅色模式。
- **自动滚动导出**：智能滚动整个聊天界面，完整捕获所有对话记录，支持长对话完整导出。
- **Canvas 内容导出**：单独导出代码块、文档等网页内 Canvas/侧边栏内容。
- **组合导出功能**：一键同时导出聊天对话和 Canvas 内容，数据结构统一。
- **多格式支持**：支持 TXT、JSON、Markdown 三种导出格式。
- **可视化格式选择**：直观的格式切换开关，一键设定导出目标格式。
- **现代化界面**：采用专业商务配色，无 Emoji 设计，保持界面纯净专业。
- **安全可靠**：遵循 TrustedHTML 安全策略，兼容最新版 Chrome/Edge 浏览器。

## 🛠️ 安装方法

### Chrome 插件版（推荐）

1. 下载 [chrome插件](https://github.com/Sxuan-Coder/AIhubEnhenced/releases) 插件包
2. 打开浏览器扩展管理页面（Chrome: `chrome://extensions/` | Edge: `edge://extensions/`）
3. 开启右上角的"开发者模式"
4. 将下载的 ZIP 压缩包直接拖拽到扩展管理页面即可完成安装

### 用户脚本版

1. 安装浏览器扩展管理器（如 [Tampermonkey](https://www.tampermonkey.net/)）
2. 下载并复制 [gemini_chat_export.user.js](https://raw.githubusercontent.com/Sxuan-Coder/gemini_chat_export/main/gemini_chat_export.user.js) 脚本内容
3. 在 Tampermonkey 中创建新脚本并粘贴代码
4. 保存并启用脚本

## 📖 使用教程

### 基础使用

1. 打开 [Google Gemini](https://gemini.google.com/app) 聊天页面
2. 在页面右侧点击 **"<"** 按钮展开导出面板。
3. **格式选择**：在面板顶部点击切换 TXT / JSON / MD 格式。
4. **功能选择**：
   - **滚动导出对话**：自动滚动并捕获所有聊天记录。
   - **导出 Canvas**：仅导出当前页面的代码块和文档。
   - **一键导出对话+Canvas**：最完整的备份方案，包含对话和所有附件内容。

### 进阶功能：对话目录

- **实时索引**：脚本会自动分析当前对话，提取用户提问并显示在右侧独立的目录面板中。
- **快速跳转**：点击目录中的条目，页面将自动滚动到对应的对话位置。
- **独立显示**：目录面板独立于导出按钮侧边栏，即使隐藏了侧边栏，目录依然可以保持显示（如果需要）。

### 主题同步

- 脚本会自动检测 Gemini 官方页面的背景色亮度。
- 当你在 Gemini 设置中切换主题时，导出面板和目录的颜色会自动跟随调整。

## 📁 导出格式说明

- **Markdown (推荐)**：结构最清晰。
- **JSON**：标准结构化数据，适合导入到其他工具或进行数据分析。
- **TXT**：最通用的纯文本格式，包含清晰的分隔线。

## 🔧 故障排除

- **导出不完整**：建议在开始导出前，手动向上滚动一段距离，或调整 `SCROLL_DELAY_MS` 为更高值（如 1500）。
- **按钮没出现**：请确保 Tampermonkey 脚本已启用，并刷新页面。
- **目录未更新**：如果对话内容较多，目录可能存在短暂延迟（约 200ms），稍等即可。

## 📄 许可证

本项目基于 Apache 2.0 许可证开源。

开源地址：[https://github.com/Sxuan-Coder/gemini_chat_export](https://github.com/Sxuan-Coder/gemini_chat_export)

---

💡 **提示**：本脚本旨在方便用户备份个人聊天记录，请勿用于非法抓取他人隐私数据。
