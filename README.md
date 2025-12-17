 Immersive Translate Assistant
> 不仅仅是翻译，更是一次 Web 交互美学的重构。
> An immersive translation tool integrating high-performance Liquid Glass shaders and SiliconFlow AI models.
> 
📖 简介 (Introduction)
沉浸翻译助手 是一款基于 Tampermonkey 的高级网页翻译工具。与市面上大多数“拼接式”脚本不同，本项目致力于解决传统翻译插件“破坏网页美感”和“交互生硬”的痛点。
v9.55 版本引入了基于 SDF (Signed Distance Fields) 的实时流体光影渲染引擎，重写了全套 iOS 风格 UI 组件，并深度集成了 SiliconFlow 的大语言模型 API，旨在为用户提供如水般顺滑、无缝的沉浸式阅读体验。
✨ 核心特性 (Features)
🎨 渲染引擎与交互 (Rendering & UX)
 * Liquid Glass Core: 复刻并改良了 Shu Ding 的液态玻璃算法。利用 SVG Filter 与 Canvas 2D 混合渲染，基于 SDF 计算鼠标距离场，实现实时的光影畸变与流体回弹效果。
 * iOS-Design Components: 彻底摒弃原生表单控件。重构了下拉菜单（Select）和模态框（Modal），采用 Portal 挂载策略，彻底解决了传统脚本在 overflow: hidden 容器中被遮挡的顽疾。
 * 物理磁吸系统: 悬浮图标具备动态物理磁吸效果，基于光标距离计算吸附力，交互符合直觉。
⚡ 模型与翻译能力 (AI Capability)
 * 多模态大模型支持: 底层接入 SiliconFlow (硅基流动) API，支持 DeepSeek-V3, Qwen 2.5 (7B/72B), GLM-4 等 SOTA 模型。
 * Context-Aware Translation:
   * 原地替换模式 (Replacement): 智能识别 DOM 结构，在保持网页布局的前提下替换文本。
   * 仅悬浮窗模式 (Tooltip Only): [v9.55 New] 针对代码块或复杂排版场景，仅显示悬浮翻译层，不修改原始 DOM。
 * 风格化输出: 支持 Prompt Engineering 级别的风格切换（日常/学术/文学阅读）。
🛠️ 技术栈 (Tech Stack)
 * Runtime: JavaScript (ES6+), Tampermonkey API
 * Rendering: HTML5 Canvas, SVG Filters (feDisplacementMap), CSS3 Transitions
 * Network: GM_xmlhttpRequest (跨域请求), RESTful API
 * State Management: GM_setValue / GM_getValue (本地持久化)
📥 安装与配置 (Installation)
1. 环境准备
确保您的浏览器已安装脚本管理器：
 * Tampermonkey (推荐 Chrome/Edge/Firefox)
2. 安装脚本
直接点击下方链接安装最新版本：
👉 Install from GitHub
3. API 配置 (必选)
本项目不内置共享 Key，需自行申请（保障隐私与稳定性）：
 * 前往 SiliconFlow 云平台 注册并获取免费 API Key。
 * 在任意网页打开脚本设置面板（点击悬浮球或右键菜单）。
 * 填入 Key 并选择偏好的模型（推荐 Qwen/Qwen2.5-72B-Instruct 以获得速度与质量的平衡）。
⌨️ 快捷键指南 (Shortcuts)
为了提高效率，建议掌握以下快捷操作：
| 快捷键 | 作用域 | 功能描述 |
|---|---|---|
| Alt + Z | 全局 | 极速翻译。选中这段文字后按下，立即执行翻译，无需点击图标。 |
| Alt + X | 全局 | 唤起/关闭面板。打开独立的手动翻译窗口（支持长文本粘贴）。 |
| Ctrl + Enter | 手动面板 | 发送翻译请求。 |
| Click | 译文节点 | (替换模式下) 点击译文可快速切换回原文对照。 |
🧩 版本更新日志 (Changelog)
v9.55 (Current)
 * [Feat] 仅悬浮窗模式: 响应开发者社区需求，新增非侵入式翻译模式，原文保持不动，译文通过 Tooltip 展示。
 * [Refactor] 自定义 UI 系统: 移除了所有原生 HTML Select 元素，使用自定义的 iOS 风格组件重写，支持毛玻璃背景与平滑动画。
 * [Fix] 样式隔离: 增强了 CSS 权重和 Shadow DOM 策略（部分），修复了在深色模式网站下输入框文字不可见的问题。
 * [Perf] Shader 优化: 优化了 Canvas 的 willReadFrequently 属性，降低高刷新率屏幕下的 GPU 占用。
⚠️ 免责声明 (Disclaimer)
 * 本项目仅供学习与技术交流使用。
 * 脚本涉及的 API Key 存储于用户本地浏览器（Tampermonkey 存储区），不会上传至任何第三方服务器。
 * 请遵守 SiliconFlow API 的使用条款。
🤝 贡献与反馈 (Contribution)
如果你对 Shader 渲染 感兴趣，或者有更好的 Prompt 调优 建议，欢迎提交 PR 或 Issue。
 * Author: WangPan
 * Github: electronicminer
 * Contact: 2013248845 (QQ)
Code with ❤️ and ☕.
