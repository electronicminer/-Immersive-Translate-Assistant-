// ==UserScript==
// @name        沉浸翻译助手 (Liquid Glass Edition )
// @namespace   http://tampermonkey.net/
// @version     9.37
// @description 智能划词翻译，原地替换。集成高性能 Liquid Glass 液态玻璃特效（复刻 Shu Ding 算法）。折射率增强版。
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

    // --- 🌊 Liquid Glass 核心算法 (复刻 Shu Ding) ---
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

    // --- Shader 控制器 (精确算法版) ---
    class LiquidElementShader {
        constructor(targetElement, options = {}) {
            this.target = targetElement;
            this.resolutionScale = options.resolutionScale || 1.0;
            // 新增：控制折射扭曲强度 (默认为 0.5)
            this.distortionIntensity = options.distortionIntensity || 0.5;

            this.width = options.width || 100;
            this.height = options.height || 100;

            this.sdfParams = options.sdfParams || { w: 0.3, h: 0.2, r: 0.6 };
            this.boxShadow = options.boxShadow || '';
            this.backdropFilter = options.backdropFilter || '';
            this.backgroundColor = options.backgroundColor || 'transparent';

            this.id = LiquidCore.generateId();

            this.isRendering = false;
            this.isVisible = true;

            this.initSVG();
            this.initCanvas();
            this.applyStyles();

            if (options.enableMouse) {
                this.mouse = { x: 0.5, y: 0.5 };
                this.targetMouse = { x: 0.5, y: 0.5 };
                this.bindMouse();
                this.startLoop();
            } else {
                this.mouse = { x: 0.5, y: 0.5 };
                setTimeout(() => this.updateShader(), 10);
            }
        }

        bindMouse() {
             this.moveHandler = (e) => {
                const rect = this.target.getBoundingClientRect();
                this.targetMouse.x = (e.clientX - rect.left) / rect.width;
                this.targetMouse.y = (e.clientY - rect.top) / rect.height;
                if(!this.isRendering) {
                    this.isRendering = true;
                    this.startLoop();
                }
             };
             document.addEventListener('mousemove', this.moveHandler);
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
            this.feDisplacementMap.setAttribute('xChannelSelector', 'R');
            this.feDisplacementMap.setAttribute('yChannelSelector', 'G');
            this.feDisplacementMap.setAttribute('scale', '0');

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

            const distanceToEdge = LiquidCore.roundedRectSDF(
                ix, iy,
                this.sdfParams.w, this.sdfParams.h,
                this.sdfParams.r
            );

            const displacement = LiquidCore.smoothStep(0.8, 0, distanceToEdge - 0.15);
            const scaled = LiquidCore.smoothStep(0, 1, displacement);

            return {
                x: ix * scaled + 0.5,
                y: iy * scaled + 0.5
            };
        }

        updateShader() {
            if (this.destroyed) return;

            const rect = this.target.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            this.width = rect.width;
            this.height = rect.height;

            const w = Math.floor(this.width * this.resolutionScale);
            const h = Math.floor(this.height * this.resolutionScale);

            if (this.canvas.width !== w || this.canvas.height !== h) {
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

            // 应用配置的折射强度 (此处控制物理扭曲幅度)
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

            const dataURL = this.canvas.toDataURL();
            this.feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataURL);
            this.feDisplacementMap.setAttribute('scale', (maxScale / this.resolutionScale).toString());
        }

        startLoop() {
             const animate = () => {
                if (this.destroyed) return;
                const dx = this.targetMouse.x - this.mouse.x;
                const dy = this.targetMouse.y - this.mouse.y;
                this.mouse.x += dx * 0.1;
                this.mouse.y += dy * 0.1;

                if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
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
            if (this.svg && this.svg.parentNode) this.svg.remove();
            this.svg = null;
            this.canvas = null;
        }
    }

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

    // --- 🎨 样式注入 (CSS) ---
    const styles = `
        :root {
            --sf-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --sf-primary: #007AFF;
            --sf-primary-hover: #0062cc;
            --sf-success: #34C759;
            --sf-error: #FF3B30;
            --sf-ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
            --sf-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

            --sf-glass-border: rgba(255, 255, 255, 0.1);
            --sf-panel-bg: rgba(255, 255, 255, 0.75);
            --sf-text-main: #1d1d1f;
            --sf-text-sub: #555555;
            --sf-input-bg: rgba(118, 118, 128, 0.12);
            --sf-input-focus-bg: rgba(255, 255, 255, 1);
            --sf-icon-bg: rgba(255, 255, 255, 0.95);

            /* Tooltip 专用颜色：强制深色模式 */
            --sf-tooltip-text: #ffffff;
            --sf-tooltip-sub: rgba(255, 255, 255, 0.6);
            --sf-tooltip-bg-dark: rgba(20, 20, 20, 0.75);

            --sf-option-bg: #ffffff;
            --sf-shimmer-bg: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --sf-panel-bg: rgba(30, 30, 30, 0.7);
                --sf-text-main: #ffffff;
                --sf-text-sub: #ebebf5;
                --sf-input-bg: rgba(118, 118, 128, 0.24);
                --sf-input-focus-bg: rgba(0, 0, 0, 0.3);
                --sf-icon-bg: rgba(44, 44, 46, 0.95);
                --sf-option-bg: #2c2c2e;
                --sf-shimmer-bg: linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.18) 37%, rgba(255,255,255,0.1) 63%);
            }
        }

        /* --- 1. 智能跟随图标 --- */
        #sf-smart-icon {
            position: absolute; width: 38px; height: 38px; border-radius: 12px; cursor: pointer; z-index: 2147483647;
            display: none; align-items: center; justify-content: center; border: none; user-select: none;
            transform-origin: center center; transition: opacity 0.2s, transform 0.2s var(--sf-ease-out-expo);
            will-change: transform, left, top;
        }
        #sf-smart-icon.sf-pop-in { animation: sf-spring-in 0.6s var(--sf-ease-spring) forwards; }
        #sf-smart-icon.sf-pop-out { animation: sf-pop-out 0.25s var(--sf-ease-out-expo) forwards; pointer-events: none; }
        #sf-smart-icon svg { stroke: var(--sf-primary); fill: none; width: 20px; height: 20px; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1)); z-index: 2; }
        #sf-smart-icon.sf-pop-in svg path { stroke-dasharray: 20; stroke-dashoffset: 20; animation: sf-draw-stroke 0.8s ease-out forwards; }
        #sf-smart-icon:active { transform: scale(0.92) !important; }

        /* --- 2. 翻译结果 --- */
        .sf-translated-node { background-color: transparent; border-bottom: 1.5px dashed var(--sf-primary); cursor: pointer; border-radius: 4px; padding: 0 2px; display: inline; transition: all 0.2s; position: relative; -webkit-font-smoothing: antialiased; }
        .sf-translated-node[data-state="translated"] { animation: sf-type-settle 0.7s var(--sf-ease-out-expo) forwards, sf-highlight-flash 1s ease-out; }
        .sf-translated-node.sf-switching { opacity: 0; transform: scale(0.96) blur(2px); }
        .sf-translated-node:hover { background-color: rgba(0, 122, 255, 0.1); border-bottom-style: solid; }
        .sf-translated-node.sf-show-original { border-bottom: none !important; filter: none !important; color: inherit !important; background: transparent !important; }
        .sf-translated-node.sf-loading { color: transparent !important; background: var(--sf-shimmer-bg); background-size: 400% 100%; animation: sf-shimmer-wave 1.4s infinite cubic-bezier(0.23, 1, 0.32, 1); border-radius: 6px; pointer-events: none; border: none; }
        .sf-translated-node.sf-error { color: var(--sf-error) !important; border-bottom: 1.5px solid var(--sf-error); background: rgba(255, 59, 48, 0.08); }

        /* --- 设置面板 --- */
        #sf-settings-modal { position: fixed; top: 50%; left: 50%; width: 360px; border: 1px solid var(--sf-glass-border); color: var(--sf-text-main); padding: 24px 28px; border-radius: 20px; z-index: 2147483647; font-family: var(--sf-font); opacity: 0; transform: translate(-50%, -45%) scale(0.96); pointer-events: none; transition: opacity 0.3s ease, transform 0.4s var(--sf-ease-out-expo); -webkit-font-smoothing: antialiased; }
        #sf-settings-modal.sf-open { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }
        #sf-settings-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.15); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); z-index: 2147483646; opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
        #sf-settings-overlay.sf-open { opacity: 1; pointer-events: auto; }
        .sf-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; cursor: grab; }
        .sf-title { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.4px; color: var(--sf-text-main) !important; }
        .sf-greeting { font-size: 13px; color: var(--sf-text-sub); font-weight: 500; margin-top: 2px; }
        .sf-label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 13px; color: var(--sf-text-sub); letter-spacing: -0.2px; }
        .sf-input, .sf-select { width: 100%; padding: 12px 14px; border: none; background: var(--sf-input-bg); color: var(--sf-text-main); border-radius: 10px; font-size: 15px; outline: none; transition: all 0.2s; font-family: var(--sf-font); font-weight: 500; }
        .sf-input:focus, .sf-select:focus { background: var(--sf-input-focus-bg); box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.2); transform: scale(1.01); }
        .sf-select option { background-color: var(--sf-option-bg); }
        .sf-btn { width: 100%; padding: 12px; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 16px; font-family: var(--sf-font); transition: all 0.2s var(--sf-ease-out-expo); position: relative; overflow: hidden; }
        .sf-btn-primary { background: var(--sf-primary); color: white; }
        .sf-btn-primary::after { content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%; background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%); transform: skewX(-25deg); transition: none; }
        .sf-btn-primary:hover::after { animation: sf-shine-pass 0.75s ease-in-out; }
        .sf-btn-primary:hover { opacity: 0.95; transform: scale(1.02); }
        .sf-btn-primary:active { transform: scale(0.96); opacity: 0.9; }
        .sf-close { cursor: pointer; width: 28px; height: 28px; border-radius: 50%; background: rgba(142, 142, 147, 0.15); color: var(--sf-text-sub); display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.2s; font-weight: bold; }
        .sf-close:hover { background: rgba(142, 142, 147, 0.3); color: var(--sf-text-main); transform: rotate(90deg); }

        /* --- Tooltip --- */
        .sf-tooltip {
            position: fixed;
            border: 1px solid rgba(255,255,255,0.15);
            /* ⚠️ 文字颜色调整为白色，增强在深色磨砂背景上的可读性 */
            color: var(--sf-tooltip-text);
            padding: 12px 16px;
            border-radius: 24px;
            font-size: 13px; line-height: 1.5; max-width: 300px;
            z-index: 2147483647;
            font-family: var(--sf-font);
            opacity: 0; transform: scale(0.8);
            pointer-events: none;
            transition: opacity 0.2s, transform 0.4s var(--sf-ease-spring);
            -webkit-font-smoothing: antialiased;
        }
        .sf-tooltip.sf-show { opacity: 1; transform: scale(1) translateY(0) !important; pointer-events: auto; }

        .sf-tooltip-arrow {
            position: absolute; width: 12px; height: 12px;
            /* ⚠️ 箭头颜色必须匹配深色背景 */
            background: var(--sf-tooltip-bg-dark);
            transform: rotate(45deg); border-radius: 2px;
        }
        .sf-tooltip.sf-top .sf-tooltip-arrow { bottom: -6px; left: 16px; border-bottom: 1px solid rgba(255,255,255,0.15); border-right: 1px solid rgba(255,255,255,0.15); }
        .sf-tooltip.sf-bottom .sf-tooltip-arrow { top: -6px; left: 16px; border-top: 1px solid rgba(255,255,255,0.15); border-left: 1px solid rgba(255,255,255,0.15); }

        .sf-action-btn {
            margin-top: 8px; width: 100%;
            background: rgba(255,255,255,0.1); border: none; color: var(--sf-tooltip-text);
            padding: 8px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
            transition: background 0.2s;
        }
        .sf-action-btn:hover { background: rgba(255,255,255,0.2); }
        .sf-action-btn:active { background: rgba(255,255,255,0.05); transform: scale(0.96); }

        /* --- Toast 通知 --- */
        .sf-toast {
            border: 1px solid var(--sf-glass-border); color: #1d1d1f; padding: 12px 28px; border-radius: 50px;
            font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px;
            opacity: 0; transform: translateY(-30px) scale(0.9); transition: all 0.5s var(--sf-ease-spring);
            -webkit-font-smoothing: antialiased; z-index: 2147483648;
        }
        .sf-toast.sf-show { opacity: 1; transform: translateY(0) scale(1); }
        .sf-toast.sf-shake { animation: sf-shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }

        /* 动画关键帧 */
        @keyframes sf-draw-stroke { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
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

    // 1. 悬浮图标
    const smartIcon = document.createElement("div");
    smartIcon.id = "sf-smart-icon";
    smartIcon.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"></path><path d="M4 14l6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="M22 22l-5-10-5 10"></path><path d="M14 18h6"></path></svg>`;
    document.body.appendChild(smartIcon);

    // 🔥 高折射率水晶特效 🔥
    new LiquidElementShader(smartIcon, {
        enableMouse: true,
        // 💎 核心修改：大幅提高扭曲强度 (1.8)，模拟高折射率玻璃
        distortionIntensity: 1.8,
        sdfParams: { w: 0.3, h: 0.3, r: 0.6 },
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25), 0 -10px 25px inset rgba(0, 0, 0, 0.15)',
        // 💎 核心修改：增加 Blur (2px) 和 Contrast (1.35) 模拟晶体厚重感
        backdropFilter: 'blur(2px) contrast(1.35) brightness(1.1) saturate(1.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)'
    });

    const tooltip = document.createElement("div");
    tooltip.className = "sf-tooltip";
    document.body.appendChild(tooltip);

    // 🔥 Tooltip Shader: 深色背景 + 高斯模糊 🔥
    new LiquidElementShader(tooltip, {
        sdfParams: { w: 0.3, h: 0.2, r: 0.6 },
        // 深色投影增加层次感
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.1) inset',
        // ⚠️ 关键调整：blur 增加到 10px 确保可读，降低 brightness 模拟深色玻璃
        backdropFilter: 'blur(0px) contrast(1.0) brightness(0.8) saturate(1.1)',
        // ⚠️ 关键调整：深色半透明背景
        backgroundColor: 'var(--sf-tooltip-bg-dark)'
    });

    const toastContainer = document.createElement("div");
    toastContainer.id = "sf-toast-container";
    toastContainer.style.cssText = "position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483648; pointer-events: none; display: flex; flex-direction: column; gap: 10px; align-items: center;";
    document.body.appendChild(toastContainer);

    const overlay = document.createElement("div");
    overlay.id = "sf-settings-overlay";
    document.body.appendChild(overlay);

    // 2. 设置面板
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

    new LiquidElementShader(settingsModal, {
        sdfParams: { w: 0.48, h: 0.48, r: 0.05 },
        boxShadow: `0 20px 50px -8px rgba(0,0,0,0.2), 0 -6px 20px inset rgba(255, 255, 255, 0.4), 0 2px 15px inset rgba(0,0,0,0.1)`,
        backdropFilter: 'blur(8px) contrast(1.1) brightness(1.1) saturate(1.2)',
        backgroundColor: 'var(--sf-panel-bg)'
    });

    // --- 🎮 交互逻辑 ---

    function showToast(message, type = 'info') {
        const toast = document.createElement("div");
        toast.className = "sf-toast";
        if (type === 'error') toast.classList.add('sf-shake');
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'copy' ? '📋' : '✨';
        toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        toastContainer.appendChild(toast);

        const shader = new LiquidElementShader(toast, {
            enableMouse: false,
            resolutionScale: 1.0,
            sdfParams: { w: 0.3, h: 0.2, r: 0.6 },
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25), 0 -10px 25px inset rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)',
            backgroundColor: 'transparent'
        });

        requestAnimationFrame(() => toast.classList.add("sf-show"));
        setTimeout(() => {
            toast.classList.remove("sf-show");
            setTimeout(() => {
                shader.destroy();
                toast.remove();
            }, 500);
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

    // --- 磁吸逻辑 ---
    let iconBaseX = 0;
    let iconBaseY = 0;
    let isIconVisible = false;

    document.addEventListener("mousemove", (e) => {
        if (!isIconVisible || isDragging || smartIcon.classList.contains('sf-pop-out')) return;
        const range = 60;
        const strength = 0.3;
        const centerX = iconBaseX + 19;
        const centerY = iconBaseY + 19;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < range) {
            const moveX = dx * strength;
            const moveY = dy * strength;
            smartIcon.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.1)`;
        } else {
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

    document.addEventListener("mouseup", (e) => {
        isDragging = false;
        document.body.style.userSelect = "";
    });

    // --- 设置面板开关 ---
    function toggleSettings(show) {
        if (show) {
            document.getElementById("sf-greeting-text").innerText = getGreeting();
            settingsModal.classList.add("sf-open");
            overlay.classList.add("sf-open");
            document.body.style.overflow = "hidden";
            if (!settingsModal.style.left) {
                 settingsModal.style.left = "50%";
                 settingsModal.style.top = "50%";
            }
            document.getElementById("sf-cfg-key").value = config.apiKey;
        } else {
            settingsModal.classList.remove("sf-open");
            overlay.classList.remove("sf-open");
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

    document.addEventListener("click", (e) => {
        if (e.altKey && !isDragging && !settingsModal.contains(e.target)) {
            const target = e.target;
            if (target.innerText && target.innerText.trim().length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const range = document.createRange();
                range.selectNodeContents(target);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
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

            iconBaseX = left;
            iconBaseY = top;

            smartIcon.style.top = `${top}px`;
            smartIcon.style.left = `${left}px`;
            smartIcon.style.transform = `translate(0,0)`;
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
    async function executeTranslation() {
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
    }

    document.addEventListener("keydown", (e) => {
        if (e.altKey && (e.code === "KeyZ" || e.key === "z" || e.key === "Z")) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const text = selection.toString().trim();
                if (text) {
                    e.preventDefault();
                    selectedText = text;
                    selectedRange = selection.getRangeAt(0);
                    if (isIconVisible) {
                        smartIcon.style.display = "none";
                        isIconVisible = false;
                    }
                    executeTranslation();
                }
            }
        }
    });

    smartIcon.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        smartIcon.classList.add("sf-pop-out");
        await new Promise(r => setTimeout(r, 200));
        smartIcon.style.display = "none";
        isIconVisible = false;
        smartIcon.classList.remove("sf-pop-out");
        executeTranslation();
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

    function showTooltip(e, original, translated) {
        tooltip.innerHTML = `
            <div class="sf-tooltip-arrow"></div>
            <div style="margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--sf-tooltip-sub); font-weight:700;">Original</div>
            <div style="font-weight:500; font-size:14px; margin-bottom:12px; line-height:1.4; color:var(--sf-tooltip-text);">${original}</div>
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
