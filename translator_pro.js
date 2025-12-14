// ==UserScript==
// @name        沉浸翻译助手
// @namespace   http://tampermonkey.net/
// @version     9.16
// @description 智能划词翻译，原地替换。支持：Alt+点击自动翻译、iPadOS 风格交互。
// @author      WangPan
// @match       *://*/*
// @connect     api.siliconflow.cn
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_unregisterMenuCommand
// @grant       GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    // --- ⚙️ 配置中心 ---
    const DEFAULTS = {
        MODEL: "Qwen/Qwen2.5-7B-Instruct",
        API_URL: "https://api.siliconflow.cn/v1/chat/completions",
        TARGET_LANG: "简体中文",
        TRANS_STYLE: "daily",
        ICON_OFFSET_X: 10,
        ICON_OFFSET_Y: 10,
        MAX_CONCURRENT: 2,
        REQUEST_INTERVAL: 350
    };

    // --- 📝 提示词模板库 ---
    const PROMPT_STYLES = {
        daily: "Translate accurately and idiomatically. Use natural, everyday language. Maintain the tone of the original text.",
        academic: "Translate using formal academic language. Ensure technical terminology is accurate and precise. Maintain a professional, objective tone. Avoid colloquialisms.",
        reading: "Translate for a smooth, immersive reading experience. Prioritize narrative flow, literary beauty, and readability over strict literalness. Suitable for novels and long articles."
    };

    let config = {
        model: GM_getValue("SF_MODEL", DEFAULTS.MODEL),
        targetLang: GM_getValue("SF_TARGET_LANG", DEFAULTS.TARGET_LANG),
        transStyle: GM_getValue("SF_TRANS_STYLE", DEFAULTS.TRANS_STYLE),
        apiKey: GM_getValue("SF_API_KEY", "")
    };

    // --- 🎨 样式注入 (Apple Motion & Glass Design) ---
    const styles = `
        /* --- CSS 变量系统 --- */
        :root {
            --sf-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --sf-primary: #007AFF;
            --sf-primary-hover: #0062cc;
            --sf-success: #34C759;
            --sf-error: #FF3B30;

            /* 物理曲线 */
            --sf-ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
            --sf-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

            /* Light Mode */
            --sf-glass-bg: rgba(255, 255, 255, 0.85);
            --sf-glass-border: rgba(255, 255, 255, 0.65);
            --sf-glass-shadow: 0 20px 40px -8px rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.06);
            --sf-text-main: #1d1d1f;
            --sf-text-sub: #86868b;
            --sf-input-bg: rgba(118, 118, 128, 0.12);
            --sf-input-focus-bg: rgba(255, 255, 255, 1);
            --sf-icon-bg: rgba(255, 255, 255, 0.95);
            --sf-tooltip-bg: rgba(255, 255, 255, 0.88);
            --sf-tooltip-text: #1d1d1f;
            --sf-option-bg: #ffffff;
            --sf-shimmer-bg: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                /* Dark Mode */
                --sf-glass-bg: rgba(30, 30, 30, 0.80);
                --sf-glass-border: rgba(255, 255, 255, 0.12);
                --sf-glass-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                --sf-text-main: #f5f5f7;
                --sf-text-sub: #a1a1a6;
                --sf-input-bg: rgba(118, 118, 128, 0.24);
                --sf-input-focus-bg: rgba(0, 0, 0, 0.3);
                --sf-icon-bg: rgba(44, 44, 46, 0.95);
                --sf-tooltip-bg: rgba(30, 30, 30, 0.88);
                --sf-tooltip-text: #f5f5f7;
                --sf-option-bg: #2c2c2e;
                --sf-shimmer-bg: linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.18) 37%, rgba(255,255,255,0.1) 63%);
            }
        }

        /* --- 1. 智能跟随图标 --- */
        #sf-smart-icon {
            position: absolute;
            width: 38px; height: 38px;
            background: var(--sf-icon-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            cursor: pointer;
            z-index: 2147483647;
            display: none;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--sf-glass-border);
            user-select: none;
            transform-origin: center center;
            transition: opacity 0.2s, transform 0.2s var(--sf-ease-out-expo), box-shadow 0.2s;
            will-change: transform, left, top;
        }

        #sf-smart-icon.sf-pop-in {
            animation: sf-spring-in 0.6s var(--sf-ease-spring) forwards;
        }

        #sf-smart-icon.sf-pop-out {
            animation: sf-pop-out 0.25s var(--sf-ease-out-expo) forwards;
            pointer-events: none;
        }

        /* 核心优化：SVG 动态描边 */
        #sf-smart-icon svg {
            stroke: var(--sf-primary); fill: none; width: 20px; height: 20px;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        /* 描边动画 Class */
        #sf-smart-icon.sf-pop-in svg path {
            stroke-dasharray: 20;
            stroke-dashoffset: 20;
            animation: sf-draw-stroke 0.8s ease-out forwards;
        }

        #sf-smart-icon:hover {
            box-shadow: 0 12px 24px rgba(0,0,0,0.15);
            background: var(--sf-option-bg);
        }
        #sf-smart-icon:active { transform: scale(0.92) !important; }

        /* --- 2. 翻译结果 --- */
        .sf-translated-node {
            background-color: transparent;
            border-bottom: 1.5px dashed var(--sf-primary);
            cursor: pointer;
            border-radius: 4px;
            padding: 0 2px;
            display: inline;
            transition: all 0.2s;
            position: relative;
            -webkit-font-smoothing: antialiased;
        }

        .sf-translated-node[data-state="translated"] {
            animation: sf-type-settle 0.7s var(--sf-ease-out-expo) forwards, sf-highlight-flash 1s ease-out;
        }

        .sf-translated-node.sf-switching { opacity: 0; transform: scale(0.96) blur(2px); }
        .sf-translated-node:hover { background-color: rgba(0, 122, 255, 0.1); border-bottom-style: solid; }

        .sf-translated-node.sf-show-original {
            border-bottom: 1.5px dotted var(--sf-text-sub);
            filter: grayscale(1);
            color: var(--sf-text-sub);
        }

        .sf-translated-node.sf-loading {
            color: transparent !important;
            background: var(--sf-shimmer-bg);
            background-size: 400% 100%;
            animation: sf-shimmer-wave 1.4s infinite cubic-bezier(0.23, 1, 0.32, 1);
            border-radius: 6px;
            pointer-events: none;
            border: none;
        }

        .sf-translated-node.sf-error {
            color: var(--sf-error) !important;
            border-bottom: 1.5px solid var(--sf-error);
            background: rgba(255, 59, 48, 0.08);
        }

        /* --- 设置面板 --- */
        #sf-settings-modal {
            position: fixed; top: 50%; left: 50%;
            width: 360px;
            background: var(--sf-glass-bg);
            backdrop-filter: blur(60px) saturate(180%);
            -webkit-backdrop-filter: blur(60px) saturate(180%);
            border: 1px solid var(--sf-glass-border);
            box-shadow: var(--sf-glass-shadow);
            color: var(--sf-text-main);
            padding: 24px 28px;
            border-radius: 20px;
            z-index: 2147483647;
            font-family: var(--sf-font);
            opacity: 0;
            transform: translate(-50%, -45%) scale(0.96);
            pointer-events: none;
            transition: opacity 0.3s ease, transform 0.4s var(--sf-ease-out-expo);
            -webkit-font-smoothing: antialiased;
        }
        #sf-settings-modal.sf-open { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }

        #sf-settings-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.15);
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
            z-index: 2147483646;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.4s ease;
        }
        #sf-settings-overlay.sf-open { opacity: 1; pointer-events: auto; }

        .sf-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; cursor: grab; }
        .sf-title { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.4px; color: var(--sf-text-main) !important; }
        .sf-greeting { font-size: 13px; color: var(--sf-text-sub); font-weight: 400; margin-top: 2px; }
        .sf-label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 13px; color: var(--sf-text-sub); letter-spacing: -0.2px; }

        .sf-input, .sf-select {
            width: 100%; padding: 12px 14px; border: none;
            background: var(--sf-input-bg); color: var(--sf-text-main);
            border-radius: 10px; font-size: 15px; outline: none;
            transition: all 0.2s; font-family: var(--sf-font);
        }
        .sf-input:focus, .sf-select:focus {
            background: var(--sf-input-focus-bg);
            box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.2);
            transform: scale(1.01);
        }
        .sf-select option { background-color: var(--sf-option-bg); }

        .sf-btn {
            width: 100%; padding: 12px; border: none; border-radius: 12px;
            cursor: pointer; font-weight: 600; font-size: 16px; font-family: var(--sf-font);
            transition: all 0.2s var(--sf-ease-out-expo);
            position: relative; overflow: hidden;
        }
        .sf-btn-primary { background: var(--sf-primary); color: white; }
        .sf-btn-primary::after {
            content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
            background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%);
            transform: skewX(-25deg); transition: none;
        }
        .sf-btn-primary:hover::after { animation: sf-shine-pass 0.75s ease-in-out; }
        .sf-btn-primary:hover { opacity: 0.95; transform: scale(1.02); }
        .sf-btn-primary:active { transform: scale(0.96); opacity: 0.9; }

        .sf-close {
            cursor: pointer; width: 28px; height: 28px; border-radius: 50%;
            background: rgba(142, 142, 147, 0.15); color: var(--sf-text-sub);
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; transition: all 0.2s; font-weight: bold;
        }
        .sf-close:hover { background: rgba(142, 142, 147, 0.3); color: var(--sf-text-main); transform: rotate(90deg); }

        /* --- Tooltip --- */
        .sf-tooltip {
            position: fixed; background: var(--sf-tooltip-bg);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            color: var(--sf-tooltip-text); padding: 12px 16px; border-radius: 14px;
            font-size: 13px; line-height: 1.5; max-width: 300px;
            z-index: 2147483647;
            box-shadow: 0 20px 50px rgba(0,0,0,0.25);
            font-family: var(--sf-font); border: 1px solid rgba(128,128,128,0.1);
            opacity: 0; transform: scale(0.8);
            pointer-events: none;
            transition: opacity 0.2s, transform 0.4s var(--sf-ease-spring);
            -webkit-font-smoothing: antialiased;
        }
        .sf-tooltip.sf-show { opacity: 1; transform: scale(1) translateY(0) !important; pointer-events: auto; }

        .sf-tooltip-arrow {
            position: absolute; width: 12px; height: 12px; background: var(--sf-tooltip-bg);
            transform: rotate(45deg); border-radius: 2px;
        }
        .sf-tooltip.sf-top .sf-tooltip-arrow { bottom: -6px; left: 16px; border-bottom: 1px solid rgba(128,128,128,0.1); border-right: 1px solid rgba(128,128,128,0.1); }
        .sf-tooltip.sf-bottom .sf-tooltip-arrow { top: -6px; left: 16px; border-top: 1px solid rgba(128,128,128,0.1); border-left: 1px solid rgba(128,128,128,0.1); }

        .sf-action-btn {
            margin-top: 8px; width: 100%;
            background: rgba(128,128,128,0.15); border: none; color: var(--sf-tooltip-text);
            padding: 8px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
            transition: background 0.2s;
        }
        .sf-action-btn:hover { background: rgba(128,128,128,0.25); }
        .sf-action-btn:active { background: rgba(128,128,128,0.1); transform: scale(0.96); }

        /* --- Toast 通知 --- */
        .sf-toast {
            background: var(--sf-glass-bg);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--sf-glass-border);
            color: var(--sf-text-main); padding: 12px 24px; border-radius: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            font-size: 14px; font-weight: 600;
            display: flex; align-items: center; gap: 10px;
            opacity: 0; transform: translateY(-30px) scale(0.9);
            transition: all 0.5s var(--sf-ease-spring);
            -webkit-font-smoothing: antialiased;
        }
        .sf-toast.sf-show { opacity: 1; transform: translateY(0) scale(1); }
        .sf-toast.sf-shake { animation: sf-shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }


        /* --- 动画关键帧 --- */
        @keyframes sf-draw-stroke {
            from { stroke-dashoffset: 20; }
            to { stroke-dashoffset: 0; }
        }
        @keyframes sf-spring-in { 0% { opacity: 0; transform: scale(0.3); } 50% { transform: scale(1.15); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes sf-pop-out { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.5); } }
        @keyframes sf-type-settle { 0% { opacity: 0; filter: blur(6px); transform: translateY(3px) scale(0.98); letter-spacing: -0.3px; } 100% { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); letter-spacing: 0; } }
        @keyframes sf-highlight-flash { 0% { background-color: rgba(0, 122, 255, 0.3); } 100% { background-color: transparent; } }
        @keyframes sf-shimmer-wave { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes sf-shine-pass { 0% { left: -100%; opacity: 0; } 50% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
        @keyframes sf-shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-3px, 0, 0); } 40%, 60% { transform: translate3d(3px, 0, 0); } }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- 🧩 DOM 元素构建 ---

    const smartIcon = document.createElement("div");
    smartIcon.id = "sf-smart-icon";
    // 关键修复：确保 path 有 stroke-dasharray 以支持描边动画
    smartIcon.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"></path><path d="M4 14l6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="M22 22l-5-10-5 10"></path><path d="M14 18h6"></path></svg>`;
    document.body.appendChild(smartIcon);

    const tooltip = document.createElement("div");
    tooltip.className = "sf-tooltip";
    document.body.appendChild(tooltip);

    const toastContainer = document.createElement("div");
    toastContainer.id = "sf-toast-container";
    toastContainer.style.cssText = "position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483648; pointer-events: none; display: flex; flex-direction: column; gap: 10px; align-items: center;";
    document.body.appendChild(toastContainer);

    const overlay = document.createElement("div");
    overlay.id = "sf-settings-overlay";
    document.body.appendChild(overlay);

    const settingsModal = document.createElement("div");
    settingsModal.id = "sf-settings-modal";
    settingsModal.innerHTML = `
        <div class="sf-header-row" id="sf-drag-handle">
            <div>
                <h3 class="sf-title">翻译助手</h3>
                <div id="sf-greeting-text" class="sf-greeting">Setting</div>
            </div>
            <div class="sf-close">×</div>
        </div>

        <div style="margin-bottom: 20px;">
            <label class="sf-label">SiliconFlow API Key</label>
            <input type="password" id="sf-cfg-key" class="sf-input" placeholder="sk-..." value="${config.apiKey}">
        </div>

        <div style="display:flex; gap:12px; margin-bottom: 20px;">
            <div style="flex:1;">
                <label class="sf-label">目标语言</label>
                <select id="sf-cfg-lang" class="sf-select">
                    <option value="简体中文">简体中文</option>
                    <option value="English">English</option>
                    <option value="日本語">日本語</option>
                    <option value="한국어">한국어</option>
                    <option value="Français">Français</option>
                    <option value="Deutsch">Deutsch</option>
                </select>
            </div>
            <div style="flex:1;">
                <label class="sf-label">风格</label>
                <select id="sf-cfg-style" class="sf-select">
                    <option value="daily">☕ 日常</option>
                    <option value="academic">🎓 学术</option>
                    <option value="reading">📖 阅读</option>
                </select>
            </div>
        </div>

        <div style="margin-bottom: 24px;">
            <label class="sf-label">模型选择</label>
            <input type="text" id="sf-cfg-model" class="sf-input" list="sf-model-list" value="${config.model}" placeholder="选择或输入模型">
            <datalist id="sf-model-list">
                <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 2.5 7B (极速)</option>
                <option value="Qwen/Qwen2.5-72B-Instruct">Qwen 2.5 72B (推荐)</option>
                <option value="deepseek-ai/DeepSeek-V3">DeepSeek V3 (最强)</option>
                <option value="THUDM/glm-4-9b-chat">GLM-4 9B</option>
            </datalist>
        </div>

        <button id="sf-save-btn" class="sf-btn sf-btn-primary">保存更改</button>
        <div style="margin-top:16px; text-align:center;">
            <a href="https://cloud.siliconflow.cn/" target="_blank" style="color:var(--sf-primary); font-size:12px; text-decoration:none; opacity:0.8;">获取免费 API Key</a>
        </div>
    `;
    document.body.appendChild(settingsModal);

    // --- 🎮 交互逻辑 ---

    function showToast(message, type = 'info') {
        const toast = document.createElement("div");
        toast.className = "sf-toast";
        if (type === 'error') toast.classList.add('sf-shake');

        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'copy' ? '📋' : '✨';
        toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("sf-show"));
        setTimeout(() => {
            toast.classList.remove("sf-show");
            setTimeout(() => toast.remove(), 500);
        }, 2500);
    }

    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 5) return "夜深了，注意休息 🌙";
        if (hour < 9) return "早上好，新的一天 ☀️";
        if (hour < 12) return "上午好 ☕";
        if (hour < 18) return "下午好，保持专注 💪";
        return "晚上好，享受生活 🌃";
    }

    document.getElementById("sf-cfg-lang").value = config.targetLang;
    document.getElementById("sf-cfg-style").value = config.transStyle;

    // --- 磁吸逻辑 (iPadOS Style) ---
    // 只有当图标显示时才激活磁吸计算
    let iconBaseX = 0;
    let iconBaseY = 0;
    let isIconVisible = false;

    document.addEventListener("mousemove", (e) => {
        if (!isIconVisible || isDragging || smartIcon.classList.contains('sf-pop-out')) return;

        const range = 60; // 磁吸感应范围 (px)
        const strength = 0.3; // 磁吸强度 (0-1)

        // 计算鼠标距离图标中心的距离
        const centerX = iconBaseX + 19; // 38/2
        const centerY = iconBaseY + 19;

        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < range) {
            // 在范围内，计算偏移
            const moveX = dx * strength;
            const moveY = dy * strength;
            smartIcon.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.1)`; // 保持放大状态
        } else {
            // 超出范围，复位
            // 注意：这里我们只重置 translate，保留 scale 动画由 hover css 控制
            // 如果鼠标不在元素上，hover css 会失效，自动变回 scale(1)
             smartIcon.style.transform = `translate(0px, 0px)`;
        }
    });


    // --- 拖拽逻辑 ---
    let isDragging = false;
    let dragOffsetX = 0, dragOffsetY = 0;
    const dragHandle = document.getElementById("sf-drag-handle");

    dragHandle.addEventListener("mousedown", (e) => {
        if (e.target.classList.contains("sf-close")) return;
        isDragging = true;
        isDragging = true;
        const rect = settingsModal.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        settingsModal.style.transform = "scale(1)";
        settingsModal.style.left = rect.left + "px";
        settingsModal.style.top = rect.top + "px";
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        let x = e.clientX - dragOffsetX;
        let y = e.clientY - dragOffsetY;
        if(x < 0) x = 0; if(y < 0) y = 0;
        settingsModal.style.left = x + "px";
        settingsModal.style.top = y + "px";
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        document.body.style.userSelect = "";
    });

    // --- 设置面板开关 (含滚动锁定) ---
    function toggleSettings(show) {
        if (show) {
            document.getElementById("sf-greeting-text").innerText = getGreeting();
            settingsModal.classList.add("sf-open");
            overlay.classList.add("sf-open");

            // 锁定背景滚动
            document.body.style.overflow = "hidden";

            if (!settingsModal.style.left) {
                 settingsModal.style.left = "50%";
                 settingsModal.style.top = "50%";
            }
            document.getElementById("sf-cfg-key").value = config.apiKey;
        } else {
            settingsModal.classList.remove("sf-open");
            overlay.classList.remove("sf-open");

            // 解锁滚动
            document.body.style.overflow = "";
        }
    }

    GM_registerMenuCommand("⚙️ 打开设置", () => toggleSettings(true));

    document.getElementById("sf-save-btn").onclick = () => {
        const newKey = document.getElementById("sf-cfg-key").value.trim();
        config.apiKey = newKey;
        config.targetLang = document.getElementById("sf-cfg-lang").value;
        config.transStyle = document.getElementById("sf-cfg-style").value;
        config.model = document.getElementById("sf-cfg-model").value.trim();

        GM_setValue("SF_API_KEY", config.apiKey);
        GM_setValue("SF_TARGET_LANG", config.targetLang);
        GM_setValue("SF_TRANS_STYLE", config.transStyle);
        GM_setValue("SF_MODEL", config.model);

        toggleSettings(false);
        showToast("配置已更新", "success");
    };

    document.querySelector(".sf-close").onclick = () => toggleSettings(false);
    overlay.onclick = () => toggleSettings(false);

    // --- 选词与图标逻辑 ---
    let selectedRange = null;
    let selectedText = "";

    // ⭐ 新增功能：Alt + 点击 自动选中并弹出图标
    document.addEventListener("click", (e) => {
        if (e.altKey && !isDragging && !settingsModal.contains(e.target)) {
            const target = e.target;
            // 简单判断是不是文本节点或者包含文本的容器
            if (target.innerText && target.innerText.trim().length > 0) {
                e.preventDefault();
                e.stopPropagation();

                // 编程式选中该元素的所有文本
                const range = document.createRange();
                range.selectNodeContents(target);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                // 触发后续逻辑
                processSelection(selection);
                showToast("已自动选中段落", "success");
            }
        }
    });

    function processSelection(selection) {
        const text = selection.toString().trim();

        if (text && text.length > 0) {
            selectedText = text;
            selectedRange = selection.getRangeAt(0);
            const rect = selectedRange.getBoundingClientRect();
            let top = rect.bottom + window.scrollY + DEFAULTS.ICON_OFFSET_Y;
            let left = rect.right + window.scrollX + DEFAULTS.ICON_OFFSET_X;
            if (left + 40 > document.body.scrollWidth) left = document.body.scrollWidth - 50;

            // 记录基准位置供磁吸使用
            iconBaseX = left;
            iconBaseY = top;

            smartIcon.style.top = `${top}px`;
            smartIcon.style.left = `${left}px`;
            smartIcon.style.transform = `translate(0,0)`; // 重置磁吸偏移

            // 重置动画
            smartIcon.style.display = "flex";
            isIconVisible = true;

            smartIcon.classList.remove("sf-pop-in");
            smartIcon.classList.remove("sf-pop-out");
            void smartIcon.offsetWidth;
            smartIcon.classList.add("sf-pop-in");
        }
    }

    document.addEventListener("mouseup", (e) => {
        if (isDragging) return;
        if (tooltip.contains(e.target)) return;
        if (smartIcon.contains(e.target) || settingsModal.contains(e.target)) return;

        // 如果按下了Alt键，交给 click 事件处理，避免冲突
        if (e.altKey) return;

        setTimeout(() => {
            const selection = window.getSelection();
            if (selection.toString().trim().length > 0) {
                processSelection(selection);
            } else {
                 if (smartIcon.style.display !== "none" && !smartIcon.classList.contains("sf-pop-out")) {
                      smartIcon.style.display = "none";
                      isIconVisible = false;
                 }
            }
        }, 10);
    });

    document.addEventListener("mousedown", (e) => {
        if (tooltip.contains(e.target)) return;
        if (!smartIcon.contains(e.target) && !settingsModal.contains(e.target)) {
            setTimeout(() => {
                if (!window.getSelection().toString().trim()) {
                    smartIcon.style.display = "none";
                    isIconVisible = false;
                }
            }, 100);
        }
    });

    // --- 核心翻译逻辑 ---
    smartIcon.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();

        // 1. 播放退场动画
        smartIcon.classList.add("sf-pop-out");

        // 2. 稍等片刻让动画播放
        await new Promise(r => setTimeout(r, 200));
        smartIcon.style.display = "none";
        isIconVisible = false;
        smartIcon.classList.remove("sf-pop-out");

        if (!config.apiKey) return toggleSettings(true);
        if (!selectedRange) return;

        const span = document.createElement("span");
        span.className = "sf-translated-node sf-loading";
        span.innerText = selectedText;
        span.setAttribute("data-original", selectedText);
        span.setAttribute("data-state", "loading");

        try {
            selectedRange.deleteContents();
            selectedRange.insertNode(span);
            window.getSelection().removeAllRanges();
        } catch (err) {
            console.error(err);
            return showToast("无法替换文本", "error");
        }

        doTranslation(selectedText, span);
    };

    function doTranslation(text, spanElement) {
        const styleInstruction = PROMPT_STYLES[config.transStyle] || PROMPT_STYLES.daily;

        GM_xmlhttpRequest({
            method: "POST",
            url: DEFAULTS.API_URL,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.apiKey}`
            },
            data: JSON.stringify({
                model: config.model,
                messages: [
                    { role: "system", content: `You are a translator. Target: ${config.targetLang}. Style: ${styleInstruction}. Rule: Output ONLY the translated text. No markdown.` },
                    { role: "user", content: text }
                ],
                stream: false,
                max_tokens: 2048,
                temperature: 0.7
            }),
            onload: function(res) {
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        let result = data.choices[0].message.content.trim();
                        updateUISuccess(spanElement, result);
                    } catch (e) {
                        updateUIError(spanElement, "解析错误");
                    }
                } else {
                    updateUIError(spanElement, `Error ${res.status}`);
                }
            },
            onerror: () => updateUIError(spanElement, "网络错误")
        });
    }

    function updateUISuccess(span, text) {
        span.classList.remove("sf-loading");

        span.innerText = text;
        span.setAttribute("data-translated", text);
        span.setAttribute("data-state", "translated");

        span.onmouseenter = (e) => {
            if (span.getAttribute("data-state") === "translated") {
                showTooltip(e, span.getAttribute("data-original"), text);
            }
        };
        span.onmouseleave = () => setTimeout(() => { if (!tooltip.matches(':hover')) hideTooltip(); }, 100);

        span.onclick = async (e) => {
            e.stopPropagation();
            hideTooltip();

            span.classList.add('sf-switching');
            await new Promise(r => setTimeout(r, 200));

            const isTrans = span.getAttribute("data-state") === "translated";

            if (isTrans) {
                span.innerText = span.getAttribute("data-original");
                span.setAttribute("data-state", "original");
                span.classList.add("sf-show-original");
            } else {
                span.innerText = span.getAttribute("data-translated");
                span.setAttribute("data-state", "translated");
                span.classList.remove("sf-show-original");
            }

            span.classList.remove('sf-switching');
        };
    }

    function updateUIError(span, msg) {
        span.classList.remove("sf-loading");
        span.classList.add("sf-error");
        span.innerText = `[${msg}]`;
        showToast("翻译请求失败", "error");
        span.onclick = (e) => {
            e.stopPropagation();
            span.innerText = span.getAttribute("data-original");
            span.className = "";
        };
    }

    // --- 智能 Tooltip 显示 (避让边缘) ---
    function showTooltip(e, original, translated) {
        tooltip.innerHTML = `
            <div class="sf-tooltip-arrow"></div>
            <div style="opacity:0.6; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Original</div>
            <div style="font-weight:400; font-size:14px; margin-bottom:12px; line-height:1.4;">${original}</div>
            <button class="sf-action-btn" id="sf-btn-copy">复制译文</button>
        `;

        const rect = tooltip.getBoundingClientRect();
        let left = e.clientX - 20;

        const spaceBelow = window.innerHeight - e.clientY;
        const tooltipHeight = 150;

        let top;
        if (spaceBelow < tooltipHeight + 20) {
            top = e.clientY - rect.height - 10;
            if (top < 10) top = e.clientY + 20;
            else {
                tooltip.classList.remove('sf-bottom');
                tooltip.classList.add('sf-top');
                tooltip.style.transformOrigin = "bottom left";
                top = e.clientY - 160;
            }
        } else {
            top = e.clientY + 24;
            tooltip.classList.remove('sf-top');
            tooltip.classList.add('sf-bottom');
            tooltip.style.transformOrigin = "top left";
        }

        if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 10;

        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
        tooltip.classList.add("sf-show");

        document.getElementById("sf-btn-copy").onclick = (evt) => {
            evt.stopPropagation();
            GM_setClipboard(translated);
            showToast("已复制", "copy");
            hideTooltip();
        };
    }

    function hideTooltip() {
        tooltip.classList.remove("sf-show");
    }

    tooltip.addEventListener('mouseleave', hideTooltip);

})();
