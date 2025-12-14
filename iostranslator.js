// ==UserScript==
// @name        沉浸翻译助手 (iOS适配版)
// @namespace   http://tampermonkey.net/
// @version     9.15
// @description 智能划词翻译，原地替换。适配 iOS Safari + Userscripts 扩展。支持：触控拖拽、移动端UI适配、智能避让原生菜单。
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

    // --- 📱 环境检测 ---
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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
        academic: "Translate using formal academic language. Ensure technical terminology is accurate and precise. Maintain a professional, objective tone.",
        reading: "Translate for a smooth, immersive reading experience. Prioritize narrative flow, literary beauty, and readability over strict literalness."
    };

    let config = {
        model: GM_getValue("SF_MODEL", DEFAULTS.MODEL),
        targetLang: GM_getValue("SF_TARGET_LANG", DEFAULTS.TARGET_LANG),
        transStyle: GM_getValue("SF_TRANS_STYLE", DEFAULTS.TRANS_STYLE),
        apiKey: GM_getValue("SF_API_KEY", "")
    };

    // --- 🎨 样式注入 (iOS 适配) ---
    const styles = `
        :root {
            --sf-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif;
            --sf-primary: #007AFF;
            --sf-glass-bg: rgba(255, 255, 255, 0.85);
            --sf-glass-border: rgba(255, 255, 255, 0.65);
            --sf-text-main: #1d1d1f;
            --sf-text-sub: #86868b;
            --sf-input-bg: rgba(118, 118, 128, 0.12);
            --sf-icon-bg: rgba(255, 255, 255, 0.95);
            --sf-tooltip-bg: rgba(255, 255, 255, 0.95);
            --sf-shadow: 0 8px 32px rgba(0,0,0,0.12);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --sf-glass-bg: rgba(30, 30, 30, 0.85);
                --sf-glass-border: rgba(255, 255, 255, 0.15);
                --sf-text-main: #f5f5f7;
                --sf-text-sub: #a1a1a6;
                --sf-input-bg: rgba(118, 118, 128, 0.24);
                --sf-icon-bg: rgba(44, 44, 46, 0.95);
                --sf-tooltip-bg: rgba(44, 44, 46, 0.95);
            }
        }

        /* 移动端图标放大，方便触控 */
        #sf-smart-icon {
            position: absolute;
            width: ${isMobile ? '44px' : '38px'}; 
            height: ${isMobile ? '44px' : '38px'};
            background: var(--sf-icon-bg);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border-radius: 50%; /* iOS 上圆形更好看，像悬浮球 */
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            z-index: 2147483647;
            display: none; align-items: center; justify-content: center;
            border: 1px solid var(--sf-glass-border);
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
            /* 关键：防止移动端点击图标时触发背景的选区取消 */
            pointer-events: auto;
        }

        #sf-smart-icon svg {
            stroke: var(--sf-primary); fill: none; 
            width: ${isMobile ? '24px' : '20px'}; 
            height: ${isMobile ? '24px' : '20px'};
        }

        #sf-settings-modal {
            position: fixed; top: 50%; left: 50%;
            width: 90%; max-width: 360px; /* 移动端适配 */
            background: var(--sf-glass-bg);
            backdrop-filter: blur(40px) saturate(180%); -webkit-backdrop-filter: blur(40px) saturate(180%);
            border: 1px solid var(--sf-glass-border);
            box-shadow: var(--sf-shadow);
            color: var(--sf-text-main);
            padding: 24px; border-radius: 24px;
            z-index: 2147483647; font-family: var(--sf-font);
            opacity: 0; pointer-events: none;
            transform: translate(-50%, -45%) scale(0.96);
            transition: opacity 0.3s, transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
        }
        #sf-settings-modal.sf-open { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }

        /* 移动端输入框字体要大于 16px 防止 iOS 自动缩放 */
        .sf-input, .sf-select {
            width: 100%; padding: 12px; border: none; margin-bottom: 0;
            background: var(--sf-input-bg); color: var(--sf-text-main);
            border-radius: 12px; font-size: 16px; outline: none;
            font-family: var(--sf-font); appearance: none;
            box-sizing: border-box;
        }

        .sf-btn {
            width: 100%; padding: 14px; border: none; border-radius: 14px;
            cursor: pointer; font-weight: 600; font-size: 17px;
            background: var(--sf-primary); color: white;
            transition: transform 0.1s;
        }
        .sf-btn:active { transform: scale(0.96); }

        .sf-translated-node {
            border-bottom: 1.5px dashed var(--sf-primary);
            cursor: pointer;
        }
        .sf-translated-node[data-state="translated"] { background-color: rgba(0, 122, 255, 0.1); }
        .sf-translated-node.sf-loading {
             background: linear-gradient(90deg, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.1) 37%, rgba(0,0,0,0.05) 63%);
             background-size: 400% 100%;
             animation: sf-shimmer 1.4s infinite;
             color: transparent !important;
        }
        
        .sf-toast {
            position: fixed; top: 12px; left: 50%; transform: translateX(-50%) translateY(-50px);
            background: var(--sf-glass-bg); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            padding: 12px 20px; border-radius: 50px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            font-size: 14px; font-weight: 600; z-index: 2147483648;
            opacity: 0; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            color: var(--sf-text-main); display: flex; align-items: center; gap: 8px;
            border: 1px solid var(--sf-glass-border);
            white-space: nowrap;
        }
        .sf-toast.sf-show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @keyframes sf-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        
        /* 隐藏设置弹窗的滚动条 */
        #sf-settings-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.2);
            backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
            z-index: 2147483646; opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        #sf-settings-overlay.sf-open { opacity: 1; pointer-events: auto; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- 🧩 DOM 构建 ---
    const smartIcon = document.createElement("div");
    smartIcon.id = "sf-smart-icon";
    smartIcon.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"></path><path d="M4 14l6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="M22 22l-5-10-5 10"></path><path d="M14 18h6"></path></svg>`;
    document.body.appendChild(smartIcon);

    const toastContainer = document.createElement("div");
    document.body.appendChild(toastContainer);

    const overlay = document.createElement("div");
    overlay.id = "sf-settings-overlay";
    document.body.appendChild(overlay);

    const settingsModal = document.createElement("div");
    settingsModal.id = "sf-settings-modal";
    // 注意：这里去掉了 list="sf-model-list" 属性在 input 上，因为 iOS 上 datalist 支持不好且容易遮挡
    settingsModal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;" id="sf-drag-handle">
            <h3 style="margin:0; font-size:20px; font-weight:700;">翻译助手</h3>
            <div class="sf-close" style="padding:8px; font-size:20px; color:var(--sf-text-sub);">×</div>
        </div>

        <div style="margin-bottom: 16px;">
            <label style="display:block; margin-bottom:6px; font-size:13px; color:var(--sf-text-sub); font-weight:600;">API KEY</label>
            <input type="password" id="sf-cfg-key" class="sf-input" placeholder="sk-..." value="${config.apiKey}">
        </div>

        <div style="display:flex; gap:12px; margin-bottom: 16px;">
            <div style="flex:1;">
                <label style="display:block; margin-bottom:6px; font-size:13px; color:var(--sf-text-sub);">目标语言</label>
                <select id="sf-cfg-lang" class="sf-select">
                    <option value="简体中文">简体中文</option>
                    <option value="English">English</option>
                    <option value="日本語">日本語</option>
                    <option value="한국어">한국어</option>
                </select>
            </div>
            <div style="flex:1;">
                <label style="display:block; margin-bottom:6px; font-size:13px; color:var(--sf-text-sub);">风格</label>
                <select id="sf-cfg-style" class="sf-select">
                    <option value="daily">☕ 日常</option>
                    <option value="academic">🎓 学术</option>
                    <option value="reading">📖 阅读</option>
                </select>
            </div>
        </div>

        <div style="margin-bottom: 24px;">
            <label style="display:block; margin-bottom:6px; font-size:13px; color:var(--sf-text-sub);">模型 (SiliconFlow)</label>
            <select id="sf-cfg-model" class="sf-select">
                <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 2.5 7B (快速)</option>
                <option value="Qwen/Qwen2.5-72B-Instruct">Qwen 2.5 72B (推荐)</option>
                <option value="deepseek-ai/DeepSeek-V3">DeepSeek V3 (最强)</option>
            </select>
        </div>

        <button id="sf-save-btn" class="sf-btn">保存配置</button>
    `;
    document.body.appendChild(settingsModal);

    // --- 🎮 交互逻辑 ---

    function showToast(message, type = 'info') {
        const toast = document.createElement("div");
        toast.className = "sf-toast";
        toast.innerHTML = `<span>${type === 'success' ? '✅' : '✨'}</span><span>${message}</span>`;
        document.body.appendChild(toast); // Append directly to body for fixed positioning
        
        requestAnimationFrame(() => toast.classList.add("sf-show"));
        setTimeout(() => {
            toast.classList.remove("sf-show");
            setTimeout(() => toast.remove(), 400);
        }, 2000);
    }

    // 设置面板开关
    function toggleSettings(show) {
        if (show) {
            settingsModal.classList.add("sf-open");
            overlay.classList.add("sf-open");
            document.body.style.overflow = "hidden"; // 锁滚
            document.getElementById("sf-cfg-key").value = config.apiKey;
        } else {
            settingsModal.classList.remove("sf-open");
            overlay.classList.remove("sf-open");
            document.body.style.overflow = "";
        }
    }

    // 保存逻辑
    document.getElementById("sf-save-btn").onclick = () => {
        config.apiKey = document.getElementById("sf-cfg-key").value.trim();
        config.targetLang = document.getElementById("sf-cfg-lang").value;
        config.transStyle = document.getElementById("sf-cfg-style").value;
        config.model = document.getElementById("sf-cfg-model").value;

        GM_setValue("SF_API_KEY", config.apiKey);
        GM_setValue("SF_TARGET_LANG", config.targetLang);
        GM_setValue("SF_TRANS_STYLE", config.transStyle);
        GM_setValue("SF_MODEL", config.model);

        toggleSettings(false);
        showToast("配置已保存", "success");
    };

    document.querySelector(".sf-close").onclick = () => toggleSettings(false);
    overlay.onclick = () => toggleSettings(false);
    GM_registerMenuCommand("⚙️ 翻译设置", () => toggleSettings(true));

    // --- 👆 触摸/鼠标 选词核心逻辑 (Mobile Compatible) ---
    
    let selectedRange = null;
    let selectedText = "";
    
    // 兼容处理：获取点击/触摸坐标
    function getEventClientXY(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function handleSelection(e) {
        // 如果点击的是插件自身的UI，忽略
        if (settingsModal.contains(e.target) || smartIcon.contains(e.target)) return;

        // 延时以等待系统完成选区计算
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text && text.length > 0) {
                selectedText = text;
                selectedRange = selection.getRangeAt(0);
                
                // 计算选区位置
                const rect = selectedRange.getBoundingClientRect();
                
                // iOS 策略：图标显示在选区右下角，稍微偏下，避开系统菜单
                // 如果是电脑端，保留原来的偏移
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

                let top, left;

                if (isMobile) {
                    // 移动端：显示在选区最后一行下面，稍微靠右
                    // 注意：iOS 系统菜单通常在选区上方，所以我们放在下方安全
                    top = rect.bottom + scrollTop + 10;
                    left = rect.right + scrollLeft - 10;
                    
                    // 边界检查：不要超出屏幕右侧
                    if (left > document.body.scrollWidth - 50) {
                        left = document.body.scrollWidth - 50;
                    }
                } else {
                    top = rect.bottom + scrollTop + DEFAULTS.ICON_OFFSET_Y;
                    left = rect.right + scrollLeft + DEFAULTS.ICON_OFFSET_X;
                }

                smartIcon.style.top = `${top}px`;
                smartIcon.style.left = `${left}px`;
                smartIcon.style.display = "flex";
                
                // 简单的入场动画
                smartIcon.style.transform = "scale(0)";
                requestAnimationFrame(() => {
                    smartIcon.style.transform = "scale(1)";
                });

            } else {
                hideIcon();
            }
        }, 150); // iOS 需要稍长的延时
    }

    function hideIcon() {
        if (smartIcon.style.display !== "none") {
            smartIcon.style.transform = "scale(0)";
            setTimeout(() => {
                smartIcon.style.display = "none";
            }, 200);
        }
    }

    // 事件监听适配
    if (isMobile) {
        // iOS Safari 在 touchend 后会触发选区更新
        document.addEventListener("touchend", (e) => handleSelection(e));
        // 监听 selectionchange 更稳妥，但要防抖
        // 简单起见，touchend 配合点击非文本区域取消通常够用
    } else {
        document.addEventListener("mouseup", (e) => handleSelection(e));
    }

    // 点击空白处取消图标
    const clickEvent = isMobile ? "touchstart" : "mousedown";
    document.addEventListener(clickEvent, (e) => {
        if (!smartIcon.contains(e.target) && !settingsModal.contains(e.target)) {
            // 在开始新的点击/触摸时，如果没点到图标，就准备隐藏
            // 延时是为了防止误触导致还没点到图标就消失了
            setTimeout(() => {
                const selection = window.getSelection();
                if (!selection.toString()) hideIcon();
            }, 50);
        }
    });

    // --- 🚀 翻译执行逻辑 ---
    
    // 适配触摸点击
    const triggerEvent = isMobile ? "touchstart" : "click";
    
    smartIcon.addEventListener(triggerEvent, async (e) => {
        e.stopPropagation();
        e.preventDefault(); // 防止触发后面的文本取消选择

        hideIcon();

        if (!config.apiKey) {
            showToast("请先配置 API Key", "error");
            toggleSettings(true);
            return;
        }

        if (!selectedRange) return;

        // 创建占位符
        const span = document.createElement("span");
        span.className = "sf-translated-node sf-loading";
        span.innerText = selectedText; // 保持原有文字占位
        span.setAttribute("data-original", selectedText);

        try {
            selectedRange.deleteContents();
            selectedRange.insertNode(span);
            window.getSelection().removeAllRanges(); // 移除选区，提升阅读体验
        } catch (err) {
            console.error(err);
            showToast("无法替换文本，网站可能受限", "error");
            return;
        }

        doTranslation(selectedText, span);
    });

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
                    { role: "system", content: `You are a translator. Target: ${config.targetLang}. Style: ${styleInstruction}. Output ONLY the translated text.` },
                    { role: "user", content: text }
                ],
                stream: false,
                max_tokens: 1024,
                temperature: 0.7
            }),
            onload: function(res) {
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        let result = data.choices[0].message.content.trim();
                        updateUISuccess(spanElement, result);
                    } catch (e) {
                        spanElement.innerText = spanElement.getAttribute("data-original");
                        spanElement.classList.remove("sf-loading");
                        showToast("解析失败", "error");
                    }
                } else {
                    spanElement.innerText = spanElement.getAttribute("data-original");
                    spanElement.classList.remove("sf-loading");
                    showToast("API 错误: " + res.status, "error");
                }
            },
            onerror: () => {
                spanElement.innerText = spanElement.getAttribute("data-original");
                spanElement.classList.remove("sf-loading");
                showToast("网络请求失败", "error");
            }
        });
    }

    function updateUISuccess(span, text) {
        span.classList.remove("sf-loading");
        span.innerText = text;
        span.setAttribute("data-translated", text);
        span.setAttribute("data-state", "translated");

        // 交互：点击切换原文/译文
        span.addEventListener(isMobile ? "touchstart" : "click", (e) => {
            e.stopPropagation(); // 防止冒泡
            e.preventDefault();  // 防止移动端长按选词

            const current = span.getAttribute("data-state");
            if (current === "translated") {
                span.innerText = span.getAttribute("data-original");
                span.setAttribute("data-state", "original");
                span.style.color = "var(--sf-text-sub)";
            } else {
                span.innerText = span.getAttribute("data-translated");
                span.setAttribute("data-state", "translated");
                span.style.color = "";
            }
        });
        
        // 移动端不需要 hover tooltip，点击切换本身就足够直观
        if (!isMobile) {
            // PC 端可以保留原来的 tooltip 逻辑 (此处为简化省略)
        }
    }

    // --- ✋ 拖拽逻辑 (同时支持 Mouse 和 Touch) ---
    const dragHandle = document.getElementById("sf-drag-handle");
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    function startDrag(e) {
        if (e.target.classList.contains("sf-close")) return;
        isDragging = true;
        const rect = settingsModal.getBoundingClientRect();
        const clientXY = getEventClientXY(e);
        
        startX = clientXY.x;
        startY = clientXY.y;
        initialLeft = rect.left;
        initialTop = rect.top;
        
        settingsModal.style.transform = "scale(1)"; // 移除 translate，改用 left/top 控制
        settingsModal.style.margin = "0"; // 清除 margin 影响
        settingsModal.style.left = initialLeft + "px";
        settingsModal.style.top = initialTop + "px";
        
        e.preventDefault();
    }

    function onDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const clientXY = getEventClientXY(e);
        const dx = clientXY.x - startX;
        const dy = clientXY.y - startY;
        settingsModal.style.left = (initialLeft + dx) + "px";
        settingsModal.style.top = (initialTop + dy) + "px";
    }

    function stopDrag() { isDragging = false; }

    dragHandle.addEventListener("mousedown", startDrag);
    dragHandle.addEventListener("touchstart", startDrag, { passive: false });

    document.addEventListener("mousemove", onDrag);
    document.addEventListener("touchmove", onDrag, { passive: false });

    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchend", stopDrag);

})();
