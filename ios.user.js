// ==UserScript==
// @name        沉浸翻译助手 (iOS Liquid Glass版)
// @namespace   http://tampermonkey.net/
// @version     9.60
// @description 适配 iOS Safari + Userscripts 扩展。增加触控悬浮球，集成高性能液态玻璃特效。
// @author      WangPan
// @match       *://*/*
// @connect     api.siliconflow.cn
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_setClipboard
// @run-at      document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- 📱 移动端检测 ---
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // --- 🌊 Liquid Glass 核心算法 ---
    const LiquidCore = {
        smoothStep: function(a, b, t) {
            t = Math.max(0, Math.min(1, (t - a) / (b - a)));
            return t * t * (3 - 2 * t);
        },
        length: function(x, y) {
            return Math.sqrt(x * x + y * y);
        },
        roundedRectSDF: function(x, y, width, height, radius) {
            const qx = Math.abs(x) - width + radius;
            const qy = Math.abs(y) - height + radius;
            return Math.min(Math.max(qx, qy), 0) + this.length(Math.max(qx, 0), Math.max(qy, 0)) - radius;
        },
        generateId: function() {
            return 'liquid-glass-' + Math.random().toString(36).substr(2, 9);
        }
    };

    // --- Shader 控制器 (移动端性能优化版) ---
    class LiquidElementShader {
        constructor(targetElement, options = {}) {
            this.target = targetElement;
            // 移动端降低分辨率以节省电量
            this.resolutionScale = isMobile ? 0.5 : (options.resolutionScale || 1.0);
            this.distortionIntensity = options.distortionIntensity || 0.5;

            this.width = options.width || 100;
            this.height = options.height || 100;

            this.sdfParams = options.sdfParams || { w: 0.3, h: 0.2, r: 0.6 };
            this.boxShadow = options.boxShadow || '';
            this.backdropFilter = options.backdropFilter || '';
            this.backgroundColor = options.backgroundColor || 'transparent';

            this.id = LiquidCore.generateId();
            this.isRendering = false;

            this.initSVG();
            this.initCanvas();
            this.applyStyles();

            this.mouse = { x: 0.5, y: 0.5 };
            this.targetMouse = { x: 0.5, y: 0.5 };

            // 移动端使用重力感应或自动呼吸效果，桌面端使用鼠标
            if (isMobile) {
                this.autoPulse();
            } else if (options.enableMouse) {
                this.bindMouse();
            }
        }

        bindMouse() {
             this.moveHandler = (e) => {
                const rect = this.target.getBoundingClientRect();
                if (rect.width === 0) return;
                this.targetMouse.x = (e.clientX - rect.left) / rect.width;
                this.targetMouse.y = (e.clientY - rect.top) / rect.height;
                if(!this.isRendering) {
                    this.isRendering = true;
                    this.startLoop();
                }
             };
             document.addEventListener('mousemove', this.moveHandler);
        }

        autoPulse() {
            // 移动端简单的呼吸动画，不跟随手指，节省计算
            let time = 0;
            const pulseLoop = () => {
                if(this.destroyed) return;
                time += 0.02;
                this.targetMouse.x = 0.5 + Math.sin(time) * 0.1;
                this.targetMouse.y = 0.5 + Math.cos(time * 0.8) * 0.1;
                this.isRendering = true;
                this.startLoop();
            };
            setInterval(pulseLoop, 3000); // 每3秒触发一次扰动
        }

        pulse() {
            this.mouse.x = this.targetMouse.x + 0.1;
            this.mouse.y = this.targetMouse.y + 0.1;
            if(!this.isRendering) {
                this.isRendering = true;
                this.startLoop();
            }
        }

        initSVG() {
            this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.svg.style.cssText = 'position: fixed; top: 0; left: 0; pointer-events: none; z-index: -1; width:0; height:0;';
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
            filter.setAttribute('id', `${this.id}_filter`);
            filter.setAttribute('filterUnits', 'objectBoundingBox');
            filter.setAttribute('x', '-20%');
            filter.setAttribute('y', '-20%');
            filter.setAttribute('width', '140%');
            filter.setAttribute('height', '140%');
            filter.setAttribute('colorInterpolationFilters', 'sRGB');

            this.feImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage');
            this.feImage.setAttribute('id', `${this.id}_map`);
            this.feImage.setAttribute('result', 'map');
            this.feImage.setAttribute('preserveAspectRatio', 'none');

            this.feDisplacementMap = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
            this.feDisplacementMap.setAttribute('in', 'SourceGraphic');
            this.feDisplacementMap.setAttribute('in2', 'map');
            this.feDisplacementMap.setAttribute('scale', '0');
            this.feDisplacementMap.setAttribute('xChannelSelector', 'R');
            this.feDisplacementMap.setAttribute('yChannelSelector', 'G');

            filter.appendChild(this.feImage);
            filter.appendChild(this.feDisplacementMap);
            defs.appendChild(filter);
            this.svg.appendChild(defs);
            document.body.appendChild(this.svg);
        }

        initCanvas() {
            this.canvas = document.createElement('canvas');
            this.canvas.width = this.width * this.resolutionScale;
            this.canvas.height = this.height * this.resolutionScale;
            this.context = this.canvas.getContext('2d', { willReadFrequently: true });
        }

        applyStyles() {
            this.target.style.background = this.backgroundColor;
            this.target.style.backdropFilter = `url(#${this.id}_filter) ${this.backdropFilter}`;
            this.target.style.webkitBackdropFilter = this.target.style.backdropFilter;
            this.target.style.boxShadow = this.boxShadow;
        }

        fragment(uv) {
            const ix = uv.x - 0.5;
            const iy = uv.y - 0.5;
            const distanceToEdge = LiquidCore.roundedRectSDF(ix, iy, this.sdfParams.w, this.sdfParams.h, this.sdfParams.r);
            const displacement = LiquidCore.smoothStep(0.8, 0, distanceToEdge - 0.15);
            const scaled = LiquidCore.smoothStep(0, 1, displacement);
            return { x: ix * scaled + 0.5, y: iy * scaled + 0.5 };
        }

        updateShader() {
            if (this.destroyed) return;
            const rect = this.target.getBoundingClientRect();
            if (rect.width === 0) return;

            this.width = rect.width;
            this.height = rect.height;
            const w = Math.floor(this.width * this.resolutionScale);
            const h = Math.floor(this.height * this.resolutionScale);

            if (this.canvas.width !== w) {
                this.canvas.width = w;
                this.canvas.height = h;
            }

            const imgData = this.context.createImageData(w, h);
            const data = imgData.data;
            let maxScale = 0;
            const rawValues = new Float32Array(w * h * 2);
            let rawPtr = 0;

            for (let y = 0; y < h; y++) {
                const uvY = y / h;
                for (let x = 0; x < w; x++) {
                    const uvX = x / w;
                    const pos = this.fragment({ x: uvX, y: uvY });
                    const dx = pos.x * w - x;
                    const dy = pos.y * h - y;
                    const absDx = dx > 0 ? dx : -dx;
                    const absDy = dy > 0 ? dy : -dy;
                    if (absDx > maxScale) maxScale = absDx;
                    if (absDy > maxScale) maxScale = absDy;
                    rawValues[rawPtr++] = dx;
                    rawValues[rawPtr++] = dy;
                }
            }
            maxScale *= this.distortionIntensity;
            if (maxScale < 0.001) maxScale = 0.001;
            const scaleInv = 1.0 / maxScale;

            rawPtr = 0;
            let dataPtr = 0;
            const len = w * h;
            for (let i = 0; i < len; i++) {
                const r = (rawValues[rawPtr++] * scaleInv + 0.5) * 255;
                const g = (rawValues[rawPtr++] * scaleInv + 0.5) * 255;
                data[dataPtr++] = r;
                data[dataPtr++] = g;
                data[dataPtr++] = 0;
                data[dataPtr++] = 255;
            }
            this.context.putImageData(imgData, 0, 0);
            this.feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', this.canvas.toDataURL());
            this.feDisplacementMap.setAttribute('scale', (maxScale / this.resolutionScale).toString());
        }

        startLoop() {
             const animate = () => {
                if (this.destroyed) return;
                const dx = this.targetMouse.x - this.mouse.x;
                const dy = this.targetMouse.y - this.mouse.y;
                this.mouse.x += dx * 0.1;
                this.mouse.y += dy * 0.1;
                this.updateShader();
                if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) {
                    this.isRendering = false;
                    return;
                }
                requestAnimationFrame(animate);
             };
             requestAnimationFrame(animate);
        }

        destroy() {
            this.destroyed = true;
            if(this.moveHandler) document.removeEventListener('mousemove', this.moveHandler);
            if (this.svg) this.svg.remove();
        }
    }

    // --- ⚙️ 配置中心 ---
    const DEFAULTS = {
        MODEL: "Qwen/Qwen2.5-7B-Instruct",
        API_URL: "https://api.siliconflow.cn/v1/chat/completions",
        TARGET_LANG: "简体中文",
        TRANS_STYLE: "daily"
    };

    let config = {
        model: GM_getValue("SF_MODEL", DEFAULTS.MODEL),
        targetLang: GM_getValue("SF_TARGET_LANG", DEFAULTS.TARGET_LANG),
        transStyle: GM_getValue("SF_TRANS_STYLE", DEFAULTS.TRANS_STYLE),
        apiKey: GM_getValue("SF_API_KEY", "")
    };

    // --- 🎨 CSS 样式 (Mobile Adapted) ---
    const styles = `
        :root {
            --sf-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
            --sf-primary: #007AFF;
            --sf-panel-bg: rgba(255, 255, 255, 0.85);
            --sf-text-main: #1d1d1f;
            --sf-text-sub: #86868b;
            --sf-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --sf-panel-bg: rgba(30, 30, 30, 0.8);
                --sf-text-main: #ffffff;
                --sf-text-sub: #ebebf5;
            }
        }

        /* 触控球 (Mobile Floating Ball) */
        #sf-fab {
            position: fixed; bottom: 100px; right: 20px;
            width: 50px; height: 50px; border-radius: 25px;
            z-index: 2147483647; touch-action: none;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #sf-fab svg { width: 24px; height: 24px; stroke: var(--sf-primary); stroke-width: 2.5; fill: none; }
        #sf-fab:active { transform: scale(0.9); }
        #sf-fab.sf-dragging { transition: none; }

        /* 面板通用样式 */
        #sf-manual-panel, #sf-settings-modal {
            position: fixed; top: 50%; left: 50%;
            width: 500px; max-width: 90vw;
            border: 1px solid rgba(255,255,255,0.1);
            color: var(--sf-text-main); padding: 20px; border-radius: 24px;
            z-index: 2147483647; font-family: var(--sf-font);
            opacity: 0; transform: translate(-50%, -40%) scale(0.95);
            pointer-events: none;
            transition: opacity 0.3s, transform 0.5s var(--sf-ease-spring);
            display: flex; flex-direction: column; gap: 12px;
            box-sizing: border-box !important;
        }

        /* 📱 移动端特定适配 */
        @media screen and (max-width: 600px) {
            #sf-manual-panel, #sf-settings-modal {
                top: 20%; /* 避免键盘遮挡 */
                transform: translate(-50%, 0) scale(0.95);
                max-width: 94vw;
                padding: 16px;
            }
            #sf-manual-panel.sf-open, #sf-settings-modal.sf-open {
                transform: translate(-50%, 0) scale(1);
            }
            .sf-btn { padding: 14px !important; font-size: 17px !important; } /* 加大点击区域 */
            .sf-manual-textarea { font-size: 16px !important; } /* 防止iOS自动缩放 */
        }

        #sf-manual-panel.sf-open, #sf-settings-modal.sf-open {
            opacity: 1; pointer-events: auto;
            /* Desktop default */
            @media screen and (min-width: 601px) {
                transform: translate(-50%, -50%) scale(1);
            }
        }

        .sf-manual-textarea {
            width: 100%; min-height: 100px; max-height: 250px;
            padding: 12px; border: none; background: rgba(120,120,128,0.1);
            color: var(--sf-text-main); border-radius: 12px;
            font-size: 15px; outline: none; font-family: inherit;
            box-sizing: border-box !important; margin: 0;
        }

        .sf-btn {
            width: 100%; padding: 10px; border: none; border-radius: 12px;
            background: var(--sf-primary); color: white; font-weight: 600; font-size: 15px;
            cursor: pointer; position: relative; overflow: hidden;
        }

        #sf-settings-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.3);
            backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
            z-index: 2147483646; opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        #sf-settings-overlay.sf-open { opacity: 1; pointer-events: auto; }

        .sf-close { position: absolute; top: 16px; right: 16px; width: 30px; height: 30px; background: rgba(128,128,128,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; color: var(--sf-text-sub); }

        /* 简单的输入框样式 */
        .sf-input { width: 100%; padding: 12px; border-radius: 10px; border: none; background: rgba(120,120,128,0.1); color: var(--sf-text-main); box-sizing: border-box; font-size: 16px; margin-bottom: 10px; }
        
        .sf-translated-node { border-bottom: 2px dashed var(--sf-primary); }
        .sf-translated-node[data-state="translated"] { color: var(--sf-primary); font-weight: 500; border-bottom: none; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- 🧩 DOM 构建 ---

    const overlay = document.createElement("div");
    overlay.id = "sf-settings-overlay";
    document.body.appendChild(overlay);

    // 1. 悬浮球 (FAB) - iOS 核心交互
    const fab = document.createElement("div");
    fab.id = "sf-fab";
    fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
    document.body.appendChild(fab);

    // 悬浮球的 Liquid Shader
    new LiquidElementShader(fab, {
        sdfParams: { w: 0.45, h: 0.45, r: 0.5 },
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(10px) contrast(1.2) brightness(1.1)',
        backgroundColor: 'rgba(255, 255, 255, 0.65)'
    });

    // 2. 手动翻译面板
    const manualPanel = document.createElement("div");
    manualPanel.id = "sf-manual-panel";
    manualPanel.innerHTML = `
        <div style="font-weight:700; font-size:18px; margin-bottom:4px;">手动翻译</div>
        <div class="sf-close">×</div>
        <textarea class="sf-manual-textarea" id="sf-manual-input" placeholder="输入..."></textarea>
        <button class="sf-btn" id="sf-manual-btn">翻译</button>
        <textarea class="sf-manual-textarea" id="sf-manual-output" placeholder="结果..." readonly></textarea>
        <div style="display:flex; gap:10px; margin-top:8px;">
            <button class="sf-btn" id="sf-open-settings" style="background:rgba(128,128,128,0.2); color:var(--sf-text-main);">设置</button>
            <button class="sf-btn" id="sf-copy-res" style="background:rgba(128,128,128,0.2); color:var(--sf-text-main);">复制</button>
        </div>
    `;
    document.body.appendChild(manualPanel);
    const manualShader = new LiquidElementShader(manualPanel, {
        sdfParams: { w: 0.48, h: 0.48, r: 0.08 },
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        backdropFilter: 'blur(20px) saturate(1.8)',
        backgroundColor: 'var(--sf-panel-bg)'
    });

    // 3. 设置面板
    const settingsModal = document.createElement("div");
    settingsModal.id = "sf-settings-modal";
    settingsModal.innerHTML = `
        <div style="font-weight:700; font-size:18px;">配置 Key</div>
        <div class="sf-close">×</div>
        <input type="password" id="sf-cfg-key" class="sf-input" placeholder="sk-..." value="${config.apiKey}">
        <select id="sf-cfg-model" class="sf-input">
             <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 7B</option>
             <option value="Qwen/Qwen2.5-72B-Instruct">Qwen 72B</option>
             <option value="deepseek-ai/DeepSeek-V3">DeepSeek V3</option>
        </select>
        <button class="sf-btn" id="sf-save-btn">保存</button>
    `;
    document.body.appendChild(settingsModal);
    new LiquidElementShader(settingsModal, {
        sdfParams: { w: 0.48, h: 0.48, r: 0.08 },
        backdropFilter: 'blur(20px) saturate(1.8)',
        backgroundColor: 'var(--sf-panel-bg)'
    });

    // --- 🎮 触控交互逻辑 ---

    // 悬浮球拖拽逻辑
    let isDragging = false;
    let dragStartX, dragStartY;
    let initialLeft, initialTop;

    fab.addEventListener('touchstart', (e) => {
        isDragging = false;
        const touch = e.touches[0];
        dragStartX = touch.clientX;
        dragStartY = touch.clientY;
        const rect = fab.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        fab.classList.add('sf-dragging');
    }, { passive: false });

    fab.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const dx = touch.clientX - dragStartX;
        const dy = touch.clientY - dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDragging = true;
        
        if(isDragging) {
            e.preventDefault(); // 防止滚动页面
            fab.style.left = `${initialLeft + dx}px`;
            fab.style.top = `${initialTop + dy}px`;
            fab.style.bottom = 'auto';
            fab.style.right = 'auto';
        }
    }, { passive: false });

    fab.addEventListener('touchend', (e) => {
        fab.classList.remove('sf-dragging');
        // 吸边逻辑
        const rect = fab.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        if (rect.left + rect.width / 2 < screenWidth / 2) {
             fab.style.left = '10px';
        } else {
             fab.style.left = `${screenWidth - 60}px`;
        }
        
        if (!isDragging) {
            handleFabClick();
        }
    });

    // 悬浮球点击逻辑
    function handleFabClick() {
        const selection = window.getSelection().toString().trim();
        if (selection) {
            // 如果有选中文本，直接翻译
            executeTranslation();
        } else {
            // 没有文本，打开面板
            togglePanel(manualPanel, true);
        }
    }

    // 面板开关
    function togglePanel(panel, show) {
        if (show) {
            panel.classList.add('sf-open');
            overlay.classList.add('sf-open');
            if(panel === manualPanel) manualShader.pulse();
        } else {
            panel.classList.remove('sf-open');
            overlay.classList.remove('sf-open');
        }
    }

    // 事件绑定
    overlay.onclick = () => {
        togglePanel(manualPanel, false);
        togglePanel(settingsModal, false);
    };
    
    document.querySelectorAll('.sf-close').forEach(btn => {
        btn.onclick = () => {
            togglePanel(manualPanel, false);
            togglePanel(settingsModal, false);
        };
    });

    document.getElementById('sf-open-settings').onclick = () => {
        togglePanel(manualPanel, false);
        togglePanel(settingsModal, true);
    };

    document.getElementById('sf-save-btn').onclick = () => {
        config.apiKey = document.getElementById('sf-cfg-key').value.trim();
        config.model = document.getElementById('sf-cfg-model').value;
        GM_setValue("SF_API_KEY", config.apiKey);
        GM_setValue("SF_MODEL", config.model);
        togglePanel(settingsModal, false);
        alert("设置已保存");
    };

    document.getElementById('sf-manual-btn').onclick = async () => {
        const text = document.getElementById('sf-manual-input').value.trim();
        if(!text) return;
        const res = await fetchTranslation(text);
        document.getElementById('sf-manual-output').value = res;
    };

    document.getElementById('sf-copy-res').onclick = () => {
        GM_setClipboard(document.getElementById('sf-manual-output').value);
        alert("已复制");
    };

    // --- 核心功能 ---

    async function executeTranslation() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        if (!config.apiKey) {
            alert("请先点击悬浮球设置 API Key");
            togglePanel(settingsModal, true);
            return;
        }

        const range = selection.getRangeAt(0);
        const text = selection.toString();
        
        const span = document.createElement("span");
        span.className = "sf-translated-node";
        span.innerText = "⏳ " + text;
        span.style.opacity = "0.7";
        
        range.deleteContents();
        range.insertNode(span);
        selection.removeAllRanges();

        const translated = await fetchTranslation(text);
        span.innerText = translated;
        span.style.opacity = "1";
        span.dataset.state = "translated";
        span.dataset.original = text;
        
        // 点击切换回原文
        span.onclick = () => {
            if (span.dataset.state === "translated") {
                span.innerText = span.dataset.original;
                span.dataset.state = "original";
                span.style.borderBottom = "none";
            } else {
                span.innerText = translated;
                span.dataset.state = "translated";
                span.style.borderBottom = "2px dashed var(--sf-primary)";
            }
        };
    }

    function fetchTranslation(text) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: DEFAULTS.API_URL,
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
                data: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: "system", content: "You are a translator. Translate to Chinese. Output ONLY result." },
                        { role: "user", content: text }
                    ],
                    stream: false
                }),
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        resolve(data.choices[0].message.content);
                    } catch(e) { resolve("解析错误"); }
                },
                onerror: () => resolve("网络错误")
            });
        });
    }

})();
