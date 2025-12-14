// ==UserScript==
// @name        沉浸翻译助手 (iOS修复版)
// @namespace   http://tampermonkey.net/
// @version     9.16
// @description 智能划词翻译。修复：增加常驻设置按钮，确保安装后立即可见。
// @author      WangPan
// @match       *://*/*
// @connect     api.siliconflow.cn
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
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
        ICON_OFFSET_Y: 10
    };

    const PROMPT_STYLES = {
        daily: "Translate accurately and idiomatically. Use natural, everyday language.",
        academic: "Translate using formal academic language. Ensure technical terminology is accurate.",
        reading: "Translate for a smooth, immersive reading experience. Prioritize flow and beauty."
    };

    let config = {
        model: GM_getValue("SF_MODEL", DEFAULTS.MODEL),
        targetLang: GM_getValue("SF_TARGET_LANG", DEFAULTS.TARGET_LANG),
        transStyle: GM_getValue("SF_TRANS_STYLE", DEFAULTS.TRANS_STYLE),
        apiKey: GM_getValue("SF_API_KEY", "")
    };

    // --- 🎨 样式注入 ---
    const styles = `
        :root {
            --sf-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            --sf-primary: #007AFF;
            --sf-glass-bg: rgba(255, 255, 255, 0.90);
            --sf-text-main: #1d1d1f;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --sf-glass-bg: rgba(30, 30, 30, 0.90);
                --sf-text-main: #f5f5f7;
            }
        }

        /* 1. 翻译悬浮球 (选中文字后出现) */
        #sf-smart-icon {
            position: absolute; z-index: 2147483647;
            width: 44px; height: 44px;
            background: var(--sf-glass-bg);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border-radius: 50%;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            display: none; align-items: center; justify-content: center;
            border: 1px solid rgba(128,128,128,0.2);
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: auto;
        }
        #sf-smart-icon svg { width: 24px; height: 24px; stroke: var(--sf-primary); fill: none; }

        /* 2. 常驻设置按钮 (右下角) - 解决“看不到东西”的问题 */
        #sf-setting-trigger {
            position: fixed; bottom: 30px; right: 20px; z-index: 2147483646;
            width: 40px; height: 40px;
            background: var(--sf-glass-bg);
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; cursor: pointer;
            opacity: 0.6; transition: opacity 0.3s;
            border: 1px solid rgba(128,128,128,0.15);
        }
        #sf-setting-trigger:active { opacity: 1; transform: scale(0.95); }

        /* 3. 设置面板 */
        #sf-settings-modal {
            position: fixed; top: 50%; left: 50%;
            width: 85%; max-width: 340px;
            background: var(--sf-glass-bg);
            backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            color: var(--sf-text-main);
            padding: 24px;
            z-index: 2147483648; font-family: var(--sf-font);
            opacity: 0; pointer-events: none;
            transform: translate(-50%, -45%) scale(0.96);
            transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
            border: 0.5px solid rgba(128,128,128,0.1);
        }
        #sf-settings-modal.sf-open { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }

        .sf-input, .sf-select {
            width: 100%; padding: 12px; border: none; margin-bottom: 12px;
            background: rgba(120, 120, 128, 0.12); color: var(--sf-text-main);
            border-radius: 10px; font-size: 16px; outline: none; box-sizing: border-box;
        }
        .sf-btn {
            width: 100%; padding: 14px; border: none; border-radius: 14px;
            font-weight: 600; font-size: 17px; margin-top: 8px;
            background: var(--sf-primary); color: white;
        }
        
        #sf-settings-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.25);
            z-index: 2147483645; opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        #sf-settings-overlay.sf-open { opacity: 1; pointer-events: auto; }
        
        /* 4. 翻译结果样式 */
        .sf-translated-node { border-bottom: 1.5px dashed var(--sf-primary); cursor: pointer; }
        .sf-translated-node.sf-loading { background: rgba(0,0,0,0.05); color: transparent !important; animation: sf-pulse 1.5s infinite; }
        @keyframes sf-pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
        
        /* 5. Toast 提示 */
        .sf-toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px);
            background: var(--sf-glass-bg); padding: 10px 20px; border-radius: 30px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            font-size: 14px; font-weight: 600; opacity: 0; transition: all 0.3s;
            z-index: 2147483649; display: flex; align-items: center; gap: 8px;
        }
        .sf-toast.sf-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- 🧩 DOM 构建 ---
    
    // 1. 翻译图标
    const smartIcon = document.createElement("div");
    smartIcon.id = "sf-smart-icon";
    smartIcon.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"></path><path d="M4 14l6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="M22 22l-5-10-5 10"></path><path d="M14 18h6"></path></svg>`;
    document.body.appendChild(smartIcon);

    // 2. 常驻设置入口 (关键修复)
    const settingTrigger = document.createElement("div");
    settingTrigger.id = "sf-setting-trigger";
    settingTrigger.innerHTML = "⚙️";
    document.body.appendChild(settingTrigger);

    // 3. 设置面板
    const overlay = document.createElement("div");
    overlay.id = "sf-settings-overlay";
    document.body.appendChild(overlay);

    const settingsModal = document.createElement("div");
    settingsModal.id = "sf-settings-modal";
    settingsModal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h3 style="margin:0; font-size:20px;">翻译配置</h3>
            <div class="sf-close" style="padding:10px; font-size:24px; color:#888;">×</div>
        </div>
        
        <div style="font-size:12px; color:#888; margin-bottom:4px;">API Key (SiliconFlow)</div>
        <input type="password" id="sf-cfg-key" class="sf-input" placeholder="sk-..." value="${config.apiKey}">
        
        <div style="display:flex; gap:10px;">
            <div style="flex:1">
                <div style="font-size:12px; color:#888; margin-bottom:4px;">目标语言</div>
                <select id="sf-cfg-lang" class="sf-select">
                    <option value="简体中文">简体中文</option>
                    <option value="English">English</option>
                </select>
            </div>
             <div style="flex:1">
                <div style="font-size:12px; color:#888; margin-bottom:4px;">风格</div>
                <select id="sf-cfg-style" class="sf-select">
                    <option value="daily">☕ 日常</option>
                    <option value="academic">🎓 学术</option>
                </select>
            </div>
        </div>

        <button id="sf-save-btn" class="sf-btn">保存并关闭</button>
        <div style="text-align:center; margin-top:15px; font-size:12px; color:#999;" id="sf-hide-trigger">
            点击此处隐藏屏幕右下角设置按钮
        </div>
    `;
    document.body.appendChild(settingsModal);

    // --- 🎮 逻辑 ---

    function showToast(msg) {
        const toast = document.createElement("div");
        toast.className = "sf-toast";
        toast.innerHTML = `<span>✨</span><span>${msg}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("sf-show"));
        setTimeout(() => { toast.classList.remove("sf-show"); setTimeout(()=>toast.remove(), 300); }, 2000);
    }

    function toggleSettings(show) {
        const modal = document.getElementById("sf-settings-modal");
        const ol = document.getElementById("sf-settings-overlay");
        if(show) {
            modal.classList.add("sf-open");
            ol.classList.add("sf-open");
            document.getElementById("sf-cfg-key").value = config.apiKey;
        } else {
            modal.classList.remove("sf-open");
            ol.classList.remove("sf-open");
        }
    }

    // 绑定设置按钮事件
    settingTrigger.addEventListener("click", () => toggleSettings(true));
    overlay.addEventListener("click", () => toggleSettings(false));
    document.querySelector(".sf-close").addEventListener("click", () => toggleSettings(false));
    
    // 保存逻辑
    document.getElementById("sf-save-btn").addEventListener("click", () => {
        config.apiKey = document.getElementById("sf-cfg-key").value.trim();
        config.targetLang = document.getElementById("sf-cfg-lang").value;
        config.transStyle = document.getElementById("sf-cfg-style").value;
        
        GM_setValue("SF_API_KEY", config.apiKey);
        GM_setValue("SF_TARGET_LANG", config.targetLang);
        GM_setValue("SF_TRANS_STYLE", config.transStyle);
        
        toggleSettings(false);
        showToast("配置已保存");
    });

    // 隐藏悬浮按钮逻辑
    document.getElementById("sf-hide-trigger").addEventListener("click", () => {
        settingTrigger.style.display = "none";
        showToast("设置入口已隐藏 (可刷新恢复)");
    });

    // --- 🚀 核心：选词触发 ---
    
    document.addEventListener("touchend", (e) => {
        // 如果点的是插件自己的UI，忽略
        if(settingsModal.contains(e.target) || settingTrigger.contains(e.target)) return;

        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            
            if(text) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                // 图标位置：选区正下方
                const top = rect.bottom + window.scrollY + 10;
                let left = rect.left + (rect.width / 2) + window.scrollX - 22; // 居中
                
                // 边界保护
                if(left < 10) left = 10;
                if(left > document.body.scrollWidth - 54) left = document.body.scrollWidth - 54;

                smartIcon.style.top = top + "px";
                smartIcon.style.left = left + "px";
                smartIcon.style.display = "flex";
                smartIcon.style.transform = "scale(0.5)";
                requestAnimationFrame(() => smartIcon.style.transform = "scale(1)");

                // 点击翻译
                smartIcon.onclick = (evt) => {
                    evt.stopPropagation();
                    evt.preventDefault();
                    smartIcon.style.display = "none";
                    if(!config.apiKey) {
                        toggleSettings(true);
                        showToast("请先填写 API Key");
                        return;
                    }
                    doTrans(text, range);
                };
            } else {
                smartIcon.style.display = "none";
            }
        }, 100);
    });
    
    // 点击空白消失
    document.addEventListener("touchstart", (e) => {
        if(!smartIcon.contains(e.target) && !settingTrigger.contains(e.target)) {
            smartIcon.style.display = "none";
        }
    });

    function doTrans(text, range) {
        const span = document.createElement("span");
        span.className = "sf-translated-node sf-loading";
        span.innerText = text;
        span.dataset.original = text;
        
        try {
            range.deleteContents();
            range.insertNode(span);
            window.getSelection().removeAllRanges();
        } catch(e) { return showToast("无法替换，网页受限"); }

        GM_xmlhttpRequest({
            method: "POST",
            url: DEFAULTS.API_URL,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
            data: JSON.stringify({
                model: config.model,
                messages: [{role:"system", content:`Translator to ${config.targetLang}. Style: ${config.transStyle}. Output translated text ONLY.`}, {role:"user", content:text}],
                temperature: 0.7
            }),
            onload: (res) => {
                try {
                    const ans = JSON.parse(res.responseText).choices[0].message.content;
                    span.classList.remove("sf-loading");
                    span.innerText = ans;
                    span.dataset.trans = ans;
                    span.dataset.state = "done";
                    span.onclick = () => {
                        const isDone = span.dataset.state === "done";
                        span.innerText = isDone ? span.dataset.original : span.dataset.trans;
                        span.dataset.state = isDone ? "raw" : "done";
                        span.style.color = isDone ? "#999" : "inherit";
                    }
                } catch(e) { span.innerText = text; showToast("API 错误"); }
            },
            onerror: () => { span.innerText = text; showToast("网络错误"); }
        });
    }
})();
