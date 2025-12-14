# 🍎 沉浸翻译助手 (Immersive Translate Assistant)

> 极致优雅的 AI 划词翻译体验。原地替换，像阅读原文一样自然。

![Version](https://img.shields.io/badge/version-9.14-007AFF)
![License](https://img.shields.io/badge/license-MIT-34C759)
![Style](https://img.shields.io/badge/style-Apple%20Liquid-transparant)

## 📖 简介 (Introduction)

**沉浸翻译助手** 是一款基于 AI (SiliconFlow API) 的油猴脚本。与传统的弹窗翻译不同，它主张 **“原地替换”**——翻译结果直接替换原文，消除阅读时的割裂感。

本项目在设计上致敬 **Apple Design**，使用了大量的物理动效、毛玻璃（Liquid Glass）材质和 iPadOS 风格的交互细节，力求在 Web 端复刻原生级的丝滑体验。

## ✨ 核心特性 (Features)

### 🎨 极致 UI/UX 设计
* **💧 Liquid Glass 材质:** 深度定制的毛玻璃面板，适配浅色/深色模式，光影细腻。
* **🧲 iPadOS 磁吸感应:** 鼠标靠近悬浮图标时，图标会智能吸附并跟随光标，手感极佳。
* **⚡️ 动态图标描边:** 图标出现时伴随 SVG 路径动态描边动画 (Stroke Animation)。
* **🌊 物理动效:** 采用弹簧曲线 (Spring Bezier) 和指数衰减动画，交互自然流畅。
* **🛡 智能边缘避让:** 翻译气泡和图标会自动检测屏幕边缘，永不被遮挡。

### 🧠 强大的 AI 内核
* **🤖 多模型支持:** 接入 SiliconFlow API，支持 **Qwen 2.5 (7B/72B)**、**DeepSeek V3**、**GLM-4** 等顶尖模型。
* **🎭 场景化翻译:**
    * ☕ **日常模式:** 语言自然，口语化。
    * 🎓 **学术模式:** 严谨客观，术语精准。
    * 📖 **阅读模式:** 优美通顺，注重文学性与沉浸感。

### ⚡️ 高效交互
* **原地无缝切换:** 点击原文变成译文，再次点击瞬间还原，支持段落级对照。
* **滚动锁定:** 打开设置面板时自动锁定背景滚动，防止误触。

## 🛠️ 安装指南 (Installation)

1.  确保你的浏览器已安装 **Tampermonkey** 或 **Violentmonkey** 插件。
2.  [**点击此处安装脚本**](#) (请替换为你的发布链接，如 GreasyFork 地址)。

## ⚙️ 配置说明 (Configuration)

为了使用 AI 翻译功能，你需要配置 API Key（支持免费额度）。

1.  前往 [SiliconFlow (硅基流动)](https://cloud.siliconflow.cn/) 注册账号并获取 **API Key**。
2.  在任意网页，通过油猴菜单点击 **“⚙️ 打开设置”**。
3.  在弹出的毛玻璃面板中填入 API Key。
4.  根据喜好选择 **目标语言**、**翻译风格** 和 **AI 模型**。

> **Note:** 你的 API Key 仅保存在本地浏览器中 (`GM_setValue`)，不会上传到任何第三方服务器。

## 🚀 使用方法 (Usage)

1.  **划词:** 选中网页上的任意文本。
2.  **点击:** 鼠标移向选中区域附近，会出现一个磁吸悬浮图标，点击它。
3.  **阅读:** 文本会在原地逐渐变为译文（带有打字机高亮特效）。
4.  **还原:** 点击译文，可随时切换回原文。
5.  **查看原文:** 鼠标悬停在译文上，会显示包含原文的悬浮卡片，支持一键复制。

## 🤝 贡献 (Contributing)

如果你对 CSS 动效或 AI Prompt 有更好的想法，欢迎提交 PR 或 Issue！

1.  Fork 本仓库
2.  新建分支 (`git checkout -b feat/AmazingFeature`)
3.  提交更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feat/AmazingFeature`)
5.  提交 Pull Request

## 📄 开源协议 (License)

MIT License © WangPan

---
<p align="center">Made with ❤️ by WangPan</p>
