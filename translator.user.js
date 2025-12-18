// ==UserScript==
// @name        沉浸翻译助手
// @namespace   http://tampermonkey.net/
// @version     9.61
// @description 智能划词翻译，集成 Liquid Glass 特效。护眼模式升级：引入丝滑过渡动画与深度暗黑滚动条，修复黑白相间问题。
// @author      WangPan
// @match       *://*/*
// @connect     api.siliconflow.cn
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_unregisterMenuCommand
// @grant       GM_setClipboard
// @updateURL   https://cdn.jsdelivr.net/gh/electronicminer/-Immersive-Translate-Assistant-@main/translator.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/electronicminer/-Immersive-Translate-Assistant-@main/translator.user.js
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
                if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(this.target).opacity === '0') return;

                // [Touch Adapter] 获取坐标，兼容鼠标和触摸
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                this.targetMouse.x = (clientX - rect.left) / rect.width;
                this.targetMouse.y = (clientY - rect.top) / rect.height;
                if(!this.isRendering) {
                    this.isRendering = true;
                    this.startLoop();
                }
             };
             document.addEventListener('mousemove', this.moveHandler);
             // [Touch Adapter] 添加触摸移动监听
             document.addEventListener('touchmove', this.moveHandler, { passive: true });
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
            if(this.moveHandler) {
                document.removeEventListener('mousemove', this.moveHandler);
                document.removeEventListener('touchmove', this.moveHandler);
            }
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
        THEME_MODE: "light", // 默认正常模式
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
        themeMode: GM_getValue("SF_THEME_MODE", DEFAULTS.THEME_MODE),
        apiKey: GM_getValue("SF_API_KEY", ""),
        enableIcon: GM_getValue("SF_ENABLE_ICON", true),
        enableTooltip: GM_getValue("SF_ENABLE_TOOLTIP", true),
        onlyTooltip: GM_getValue("SF_ONLY_TOOLTIP", false)
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
            --sf-input-focus-bg: rgba(255, 255, 255, 0.8);
            --sf-icon-bg: rgba(255, 255, 255, 0.95);

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

        /* --- Panel Styles --- */
        #sf-manual-panel {
            position: fixed; top: 50%; left: 50%; width: 500px; max-width: 90vw;
            border: 1px solid var(--sf-glass-border);
            color: var(--sf-text-main); padding: 24px; border-radius: 24px;
            z-index: 2147483647; font-family: var(--sf-font);
            opacity: 0; transform: translate(-50%, -45%) scale(0.96); pointer-events: none;
            transition: opacity 0.3s ease, transform 0.4s var(--sf-ease-out-expo);
            display: flex; flex-direction: column; gap: 16px;
            box-sizing: border-box !important;
        }
        #sf-manual-panel.sf-open { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }

        .sf-manual-textarea {
            width: 100%; min-height: 100px; max-height: 300px; resize: vertical;
            padding: 12px 14px !important; border: none; background: var(--sf-input-bg);
            color: var(--sf-text-main); border-radius: 16px;
            font-size: 16px; outline: none; transition: all 0.2s;
            font-family: var(--sf-font);
            box-sizing: border-box !important;
            margin: 0 !important; max-width: 100%;
            line-height: 1.5 !important;
        }
        .sf-manual-textarea:focus { background: var(--sf-input-focus-bg); box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.2); }
        .sf-manual-textarea.sf-output { background: rgba(0,0,0,0.03); cursor: text; }

        .sf-panel-controls { display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; }
        .sf-kbd-hint { font-size: 12px; color: var(--sf-text-sub); opacity: 0.7; }
        .sf-kbd { background: rgba(128,128,128,0.2); padding: 2px 6px; border-radius: 4px; font-family: monospace; }

        #sf-smart-icon {
            position: absolute; width: 38px; height: 38px; border-radius: 12px; cursor: pointer; z-index: 2147483647;
            display: none; align-items: center; justify-content: center; border: none; user-select: none;
            transform-origin: center center; transition: opacity 0.2s, transform 0.2s var(--sf-ease-out-expo);
            will-change: transform, left, top; box-sizing: border-box;
        }
        #sf-smart-icon.sf-pop-in { animation: sf-spring-in 0.6s var(--sf-ease-spring) forwards; }
        #sf-smart-icon.sf-pop-out { animation: sf-pop-out 0.25s var(--sf-ease-out-expo) forwards; pointer-events: none; }
        #sf-smart-icon svg { stroke: var(--sf-primary); fill: none; width: 20px; height: 20px; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1)); z-index: 2; }
        #sf-smart-icon.sf-pop-in svg path { stroke-dasharray: 20; stroke-dashoffset: 20; animation: sf-draw-stroke 0.8s ease-out forwards; }
        #sf-smart-icon:active { transform: scale(0.92) !important; }

        /* 翻译节点样式 */
        .sf-translated-node { background-color: transparent; border-bottom: 1.5px dashed var(--sf-primary); cursor: pointer; border-radius: 4px; padding: 0 2px; display: inline; transition: all 0.2s; position: relative; -webkit-font-smoothing: antialiased; }
        .sf-translated-node[data-state="translated"] { animation: sf-type-settle 0.7s var(--sf-ease-out-expo) forwards, sf-highlight-flash 1s ease-out; }
        .sf-translated-node.sf-switching { opacity: 0; transform: scale(0.96) blur(2px); }
        .sf-translated-node:hover { background-color: rgba(0, 122, 255, 0.1); border-bottom-style: solid; }
        .sf-translated-node.sf-show-original { border-bottom: none !important; filter: none !important; color: inherit !important; background: transparent !important; }

        /* 默认模式 Loading: 隐藏文字，显示骨架屏 */
        .sf-translated-node.sf-loading { color: transparent !important; background: var(--sf-shimmer-bg); background-size: 400% 100%; animation: sf-shimmer-wave 1.4s infinite cubic-bezier(0.23, 1, 0.32, 1); border-radius: 6px; pointer-events: none; border: none; }

        /* 仅悬浮窗模式 Loading: 显示文字，底部 Loading 动画 */
        .sf-translated-node.sf-loading.sf-tooltip-mode {
            color: inherit !important;
            background: transparent !important;
            animation: none !important;
            border-bottom: 2px solid var(--sf-primary);
            opacity: 0.7;
            animation: sf-pulse-border 1.5s infinite;
        }

        /* 仅悬浮窗模式 Translated: 虚线，无背景 */
        .sf-translated-node.sf-tooltip-mode[data-state="translated-tooltip-only"] {
            border-bottom: 1.5px dashed var(--sf-success);
            background: transparent !important;
            color: inherit !important;
            filter: none !important;
            transform: none !important;
            animation: none !important;
        }
        .sf-translated-node.sf-tooltip-mode:hover {
            background-color: rgba(52, 199, 89, 0.1) !important;
        }

        .sf-translated-node.sf-error { color: var(--sf-error) !important; border-bottom: 1.5px solid var(--sf-error); background: rgba(255, 59, 48, 0.08); }

        #sf-settings-modal {
            position: fixed; top: 50%; left: 50%; width: 420px; height: auto;
            border: 1px solid var(--sf-glass-border); color: var(--sf-text-main);
            border-radius: 20px; z-index: 2147483647; font-family: var(--sf-font);
            opacity: 0; transform: translate(-50%, -45%) scale(0.96); pointer-events: none;
            transition: opacity 0.3s ease, transform 0.4s var(--sf-ease-out-expo);
            -webkit-font-smoothing: antialiased; box-sizing: border-box !important;
            overflow: hidden; padding: 0 !important;
        }
        #sf-settings-modal.sf-open { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }

        #sf-view-container { position: relative; width: 100%; height: 720px; overflow: hidden; }

        .sf-view {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            padding: 24px 28px; padding-bottom: 60px;
            box-sizing: border-box; transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
            background: transparent; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;
        }
        .sf-view::-webkit-scrollbar { display: none; }
        .sf-view-main { transform: translateX(0); }
        .sf-view-info { transform: translateX(100%); }
        #sf-settings-modal.sf-show-info .sf-view-main { transform: translateX(-30%); opacity: 0; pointer-events: none; }
        #sf-settings-modal.sf-show-info .sf-view-info { transform: translateX(0); }

        .sf-info-icon-btn {
            position: absolute; bottom: 20px; right: 20px;
            width: 24px; height: 24px; border-radius: 50%;
            border: 1.5px solid var(--sf-text-sub); color: var(--sf-text-sub);
            display: flex; align-items: center; justify-content: center;
            font-family: serif; font-style: italic; font-weight: bold; font-size: 14px;
            cursor: pointer; opacity: 0.6; transition: all 0.2s;
        }
        .sf-info-icon-btn:hover { opacity: 1; border-color: var(--sf-primary); color: var(--sf-primary); transform: scale(1.1); }
        .sf-back-btn { cursor: pointer; color: var(--sf-primary); font-size: 15px; font-weight: 500; display: flex; align-items: center; transition: opacity 0.2s; }
        .sf-back-btn:hover { opacity: 0.7; }
        .sf-info-content { text-align: center; padding-top: 20px; }
        .sf-app-logo {
            width: 64px; height: 64px; background: linear-gradient(135deg, #007AFF, #5856D6);
            border-radius: 16px; margin: 0 auto 16px auto;
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 32px; box-shadow: 0 10px 20px rgba(0, 122, 255, 0.3);
        }
        .sf-info-item { margin-bottom: 8px; color: var(--sf-text-sub); font-size: 13px; }
        .sf-info-val { color: var(--sf-text-main); font-weight: 600; }

        #sf-settings-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.15); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); z-index: 2147483646; opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
        #sf-settings-overlay.sf-open { opacity: 1; pointer-events: auto; }
        .sf-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; cursor: grab; box-sizing: border-box; }
        .sf-title { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.4px; color: var(--sf-text-main) !important; }
        .sf-info-title { color: var(--sf-text-main) !important; }
        .sf-greeting { font-size: 13px; color: var(--sf-text-sub); font-weight: 500; margin-top: 2px; }
        .sf-label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 13px; color: var(--sf-text-sub); letter-spacing: -0.2px; }

        /* --- 核心修复：输入框样式强化 --- */
        .sf-input, .sf-select {
            width: 100%; padding: 10px 14px !important;
            border: 1px solid transparent !important;
            background: var(--sf-input-bg) !important;
            color: var(--sf-text-main) !important;
            border-radius: 16px !important;
            font-size: 15px; outline: none; transition: all 0.2s;
            font-family: var(--sf-font); font-weight: 500;
            box-sizing: border-box !important; margin: 0;
            /* 强制高度和行高，防止文字被遮挡 */
            min-height: 46px !important;
            line-height: 1.6 !important;
            height: auto !important;
        }
        .sf-input:focus, .sf-select:focus {
            background: var(--sf-input-focus-bg) !important;
            box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.2);
            transform: scale(1.01);
        }

        /* --- 自定义下拉菜单 (模拟 iOS 效果) --- */
        .sf-custom-select-trigger {
            display: flex; align-items: center; justify-content: space-between;
            width: 100%; padding: 10px 14px;
            background: var(--sf-input-bg) !important;
            border-radius: 16px;
            color: var(--sf-text-main); font-size: 15px; font-weight: 500;
            cursor: pointer; transition: 0.2s;
            box-sizing: border-box;
            min-height: 46px; /* 确保点击区域足够大且文字不被切 */
            user-select: none;
        }
        .sf-custom-select-trigger:hover { background: var(--sf-input-focus-bg) !important; }
        .sf-custom-select-trigger span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sf-custom-select-trigger::after {
            content: ''; border: 5px solid transparent; border-top-color: var(--sf-text-sub);
            margin-left: 8px; transform: translateY(2px); opacity: 0.6; transition: transform 0.2s;
        }
        .sf-custom-select-trigger.active::after { transform: rotate(180deg) translateY(2px); }

        /* 下拉菜单弹出层 (Fixed 定位以突破 Modal 的 overflow:hidden) */
        .sf-select-popup {
            position: fixed; z-index: 2147483648;
            background: var(--sf-panel-bg);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid var(--sf-glass-border);
            border-radius: 16px;
            padding: 6px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1);
            opacity: 0; transform: scale(0.9); pointer-events: none;
            transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex; flex-direction: column; gap: 4px;
            max-height: 300px; overflow-y: auto;
            box-sizing: border-box;
        }
        .sf-select-popup::-webkit-scrollbar { width: 0; height: 0; display: none; }
        .sf-select-popup.sf-open { opacity: 1; transform: scale(1); pointer-events: auto; }
        .sf-select-option {
            padding: 10px 12px; border-radius: 10px; cursor: pointer;
            font-size: 14px; color: var(--sf-text-main); font-family: var(--sf-font);
            display: flex; align-items: center; justify-content: space-between;
            transition: background 0.2s;
            -webkit-font-smoothing: antialiased;
        }
        .sf-select-option:hover { background: rgba(0, 122, 255, 0.1); }
        .sf-select-option.selected { background: var(--sf-primary); color: white; }
        .sf-select-option.selected::after { content: '✓'; font-weight: bold; font-size: 12px; }

        .sf-btn { width: 100%; padding: 12px; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 16px; font-family: var(--sf-font); transition: all 0.2s var(--sf-ease-out-expo); position: relative; overflow: hidden; box-sizing: border-box !important; }
        .sf-btn-sm { width: auto; padding: 8px 16px; font-size: 14px; border-radius: 8px; }
        .sf-btn-primary { background: var(--sf-primary); color: white; }
        .sf-btn-primary::after { content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%; background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%); transform: skewX(-25deg); transition: none; }
        .sf-btn-primary:hover::after { animation: sf-shine-pass 0.75s ease-in-out; }
        .sf-btn-primary:hover { opacity: 0.95; transform: scale(1.02); }
        .sf-btn-primary:active { transform: scale(0.96); opacity: 0.9; }
        .sf-close { cursor: pointer; width: 28px; height: 28px; border-radius: 50%; background: rgba(142, 142, 147, 0.15); color: var(--sf-text-sub); display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.2s; font-weight: bold; box-sizing: border-box; }
        .sf-close:hover { background: rgba(142, 142, 147, 0.3); color: var(--sf-text-main); transform: rotate(90deg); }

        .sf-tooltip {
            position: fixed; border: 1px solid rgba(255,255,255,0.15); color: var(--sf-tooltip-text); padding: 12px 16px; border-radius: 24px; font-size: 13px; line-height: 1.5; max-width: 300px; z-index: 2147483647; font-family: var(--sf-font); opacity: 0; transform: scale(0.8); pointer-events: none; transition: opacity 0.2s, transform 0.4s var(--sf-ease-spring); -webkit-font-smoothing: antialiased; box-sizing: border-box;
        }
        .sf-tooltip.sf-show { opacity: 1; transform: scale(1) translateY(0) !important; pointer-events: auto; }
        .sf-tooltip-arrow { position: absolute; width: 12px; height: 12px; background: var(--sf-tooltip-bg-dark); transform: rotate(45deg); border-radius: 2px; }
        .sf-tooltip.sf-top .sf-tooltip-arrow { bottom: -6px; left: 16px; border-bottom: 1px solid rgba(255,255,255,0.15); border-right: 1px solid rgba(255,255,255,0.15); }
        .sf-tooltip.sf-bottom .sf-tooltip-arrow { top: -6px; left: 16px; border-top: 1px solid rgba(255,255,255,0.15); border-left: 1px solid rgba(255,255,255,0.15); }

        .sf-action-btn { width: 100%; background: rgba(255,255,255,0.1); border: none; color: var(--sf-tooltip-text); padding: 8px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; transition: background 0.2s; box-sizing: border-box; }
        .sf-action-btn:hover { background: rgba(255,255,255,0.2); }
        .sf-action-btn:active { background: rgba(255,255,255,0.05); transform: scale(0.96); }

        .sf-toast { border: 1px solid var(--sf-glass-border); color: #1d1d1f; padding: 12px 28px; border-radius: 50px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px; opacity: 0; transform: translateY(-30px) scale(0.9); transition: all 0.5s var(--sf-ease-spring); -webkit-font-smoothing: antialiased; z-index: 2147483648; box-sizing: border-box; }
        .sf-toast.sf-show { opacity: 1; transform: translateY(0) scale(1); }
        .sf-toast.sf-shake { animation: sf-shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }

        .sf-setting-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; box-sizing: border-box; }
        .sf-switch { position: relative; display: inline-block; width: 50px; height: 30px; box-sizing: border-box; }
        .sf-switch input { opacity: 0; width: 0; height: 0; }
        .sf-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(120, 120, 128, 0.16); transition: .4s; border-radius: 34px; }
        .sf-slider:before { position: absolute; content: ""; height: 26px; width: 26px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.15), 0 3px 1px rgba(0,0,0,0.06); }
        input:checked + .sf-slider { background-color: var(--sf-success); }
        input:checked + .sf-slider:before { transform: translateX(20px); }

        @keyframes sf-draw-stroke { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
        @keyframes sf-spring-in { 0% { opacity: 0; transform: scale(0.3); } 50% { transform: scale(1.15); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes sf-pop-out { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.5); } }
        @keyframes sf-type-settle { 0% { opacity: 0; filter: blur(6px); transform: translateY(3px) scale(0.98); letter-spacing: -0.3px; } 100% { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); letter-spacing: 0; } }
        @keyframes sf-highlight-flash { 0% { background-color: rgba(0, 122, 255, 0.3); } 100% { background-color: transparent; } }
        @keyframes sf-shimmer-wave { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes sf-shine-pass { 0% { left: -100%; opacity: 0; } 50% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
        @keyframes sf-shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-3px, 0, 0); } 40%, 60% { transform: translate3d(3px, 0, 0); } }
        @keyframes sf-pulse-border { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
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

    new LiquidElementShader(smartIcon, {
        enableMouse: true,
        distortionIntensity: 1.8,
        sdfParams: { w: 0.3, h: 0.3, r: 0.6 },
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25), 0 -10px 25px inset rgba(0, 0, 0, 0.15)',
        backdropFilter: 'blur(2px) contrast(1.35) brightness(1.1) saturate(1.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)'
    });

    const tooltip = document.createElement("div");
    tooltip.className = "sf-tooltip";
    document.body.appendChild(tooltip);

    new LiquidElementShader(tooltip, {
        sdfParams: { w: 0.3, h: 0.2, r: 0.6 },
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.1) inset',
        backdropFilter: 'blur(0px) contrast(1.0) brightness(0.8) saturate(1.1)',
        backgroundColor: 'var(--sf-tooltip-bg-dark)'
    });

    const toastContainer = document.createElement("div");
    toastContainer.id = "sf-toast-container";
    toastContainer.style.cssText = "position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483648; pointer-events: none; display: flex; flex-direction: column; gap: 10px; align-items: center;";
    document.body.appendChild(toastContainer);

    const overlay = document.createElement("div");
    overlay.id = "sf-settings-overlay";
    document.body.appendChild(overlay);

    // 2. 设置面板 (双层视图结构)
    const settingsModal = document.createElement("div");
    settingsModal.id = "sf-settings-modal";
    settingsModal.innerHTML = `
        <div id="sf-view-container">
            <!-- 🟢 主设置页面 -->
            <div class="sf-view sf-view-main">
                <div class="sf-header-row" id="sf-drag-handle">
                    <div>
                        <h3 class="sf-title">翻译助手</h3>
                        <div id="sf-greeting-text" class="sf-greeting">Setting</div>
                    </div>
                    <div class="sf-close" id="sf-settings-close">×</div>
                </div>
                <div style="margin-bottom: 20px;">
                    <label class="sf-label">SiliconFlow API Key</label>
                    <input type="password" id="sf-cfg-key" class="sf-input" placeholder="sk-..." value="${config.apiKey}">
                </div>

                <div class="sf-setting-row">
                    <span class="sf-label" style="margin:0">启用悬浮图标</span>
                    <label class="sf-switch">
                        <input type="checkbox" id="sf-cfg-icon" ${config.enableIcon ? 'checked' : ''}>
                        <span class="sf-slider"></span>
                    </label>
                </div>
                <div class="sf-setting-row">
                    <span class="sf-label" style="margin:0">显示原文/译文 Tooltip</span>
                    <label class="sf-switch">
                        <input type="checkbox" id="sf-cfg-tooltip" ${config.enableTooltip ? 'checked' : ''}>
                        <span class="sf-slider"></span>
                    </label>
                </div>
                <div class="sf-setting-row">
                    <span class="sf-label" style="margin:0">仅显示悬浮窗 (不替换)</span>
                    <label class="sf-switch">
                        <input type="checkbox" id="sf-cfg-only-tooltip" ${config.onlyTooltip ? 'checked' : ''}>
                        <span class="sf-slider"></span>
                    </label>
                </div>

                <!-- 🌙 网页护眼模式设置 -->
                <div style="margin-bottom: 20px;">
                    <label class="sf-label">网页护眼模式</label>
                    <select id="sf-cfg-theme" class="sf-select" style="display:none">
                        <option value="auto">🤖 跟随系统 (自动)</option>
                        <option value="light">☀️ 正常模式 (关闭)</option>
                        <option value="dark">🌙 护眼黑夜 (开启)</option>
                    </select>
                </div>

                <!-- 优化布局：左右分栏，避免挤压 -->
                <div style="display:flex; gap:12px; margin-bottom: 20px;">
                    <div style="flex:1;">
                        <label class="sf-label">目标语言</label>
                        <!-- 原生 Select 隐藏，JS 会生成自定义 UI -->
                        <select id="sf-cfg-lang" class="sf-select" style="display:none">
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
                        <select id="sf-cfg-style" class="sf-select" style="display:none">
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
                <!-- ℹ️ 底部右下角的信息按钮 -->
                <div class="sf-info-icon-btn" id="sf-to-info">i</div>
            </div>

            <!-- 🔵 关于信息页面 -->
            <div class="sf-view sf-view-info">
                <div class="sf-header-row" style="margin-bottom:12px;">
                    <div class="sf-back-btn" id="sf-back-main">‹ 设置</div>
                    <div class="sf-title" style="font-size:17px; position:absolute; left:50%; transform:translateX(-50%)">关于</div>
                    <div style="width:40px"></div>
                </div>
                <div class="sf-info-content">
                    <div class="sf-app-logo">🌐</div>
                    <h2 class="sf-info-title" style="font-size:20px; margin:0 0 4px 0;">沉浸翻译助手</h2>
                    <p style="color:var(--sf-text-sub); font-size:13px; margin:0 0 24px 0;">v9.61</p>

                    <div style="background:var(--sf-input-bg); border-radius:12px; padding:16px; text-align:left; margin-bottom:16px;">
                        <div class="sf-info-item">作者 <span class="sf-info-val" style="float:right">汪攀</span></div>
                        <div style="height:1px; background:rgba(128,128,128,0.1); margin:8px 0;"></div>
                        <div class="sf-info-item">渲染引擎 <span class="sf-info-val" style="float:right">Liquid Glass (JS+Shader)</span></div>
                        <div style="height:1px; background:rgba(128,128,128,0.1); margin:8px 0;"></div>
                        <div class="sf-info-item">QQ <span class="sf-info-val" style="float:right">2013248845</span></div>
                    </div>

                    <p style="font-size:12px; color:var(--sf-text-sub); line-height:1.6; padding:0 8px;">
                        这是一个追求极致交互体验的翻译插件。<br>
                        灵感来自于 iOS 的磨砂玻璃与流体设计。<br>
                        希望它能让你的阅读体验如水般顺滑。💧
                    </p>

                    <div style="margin-top:24px; font-size:11px; color:var(--sf-text-sub); opacity:0.6;">
                          Design by WangPan © 2025
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(settingsModal);

    // 应用设置面板的 Liquid Glass 特效
    new LiquidElementShader(settingsModal, {
        sdfParams: { w: 0.48, h: 0.48, r: 0.05 },
        boxShadow: `0 20px 50px -8px rgba(0,0,0,0.2), 0 -6px 20px inset rgba(255, 255, 255, 0.4), 0 2px 15px inset rgba(0,0,0,0.1)`,
        backdropFilter: 'blur(8px) contrast(1.1) brightness(1.1) saturate(1.2)',
        backgroundColor: 'var(--sf-panel-bg)'
    });

    // 3. ✨ 手动翻译面板 ✨
    const manualPanel = document.createElement("div");
    manualPanel.id = "sf-manual-panel";
    manualPanel.innerHTML = `
        <div class="sf-header-row" id="sf-manual-drag-handle" style="margin-bottom:12px; cursor: move;">
            <h3 class="sf-title" style="font-size:17px">手动翻译</h3>
            <div class="sf-close" id="sf-manual-close">×</div>
        </div>
        <textarea class="sf-manual-textarea" id="sf-manual-input" placeholder="在此输入或粘贴需要翻译的文本..."></textarea>
        <div class="sf-panel-controls">
            <span class="sf-kbd-hint">Alt+X 关闭 <span style="margin:0 4px">|</span> Ctrl+Enter 翻译</span>
            <button class="sf-btn sf-btn-primary sf-btn-sm" id="sf-manual-btn">翻译</button>
        </div>
        <textarea class="sf-manual-textarea sf-output" id="sf-manual-output" placeholder="翻译结果..." readonly></textarea>
        <button class="sf-action-btn" id="sf-manual-copy" style="text-align:center; color:var(--sf-text-sub)">复制结果</button>
    `;
    document.body.appendChild(manualPanel);

    new LiquidElementShader(manualPanel, {
        enableMouse: true,
        distortionIntensity: 1.2,
        sdfParams: { w: 0.48, h: 0.48, r: 0.06 },
        boxShadow: `0 20px 60px -8px rgba(0,0,0,0.3), 0 -4px 15px inset rgba(255, 255, 255, 0.5)`,
        backdropFilter: 'blur(12px) contrast(1.1) brightness(1.1) saturate(1.3)',
        backgroundColor: 'var(--sf-panel-bg)'
    });

    // --- 🎮 iOS 风格下拉菜单逻辑 ---
    // 这个函数会找到页面上隐藏的原生 select，并在其位置生成一个漂亮的 Trigger
    // 点击 Trigger 会在 body 根节点挂载一个 Fixed 定位的 Popup，避免被 Modal 遮挡
    function initCustomSelects() {
        const selects = ['sf-cfg-lang', 'sf-cfg-style', 'sf-cfg-theme']; // 加入 sf-cfg-theme
        selects.forEach(id => {
            const originalSelect = document.getElementById(id);
            if (!originalSelect) return;

            // Prevent Duplicate: Check if previous element is our trigger
            // 防止重复生成：检查前一个元素是否已经是我们的触发器
            let trigger = originalSelect.previousElementSibling;
            let isNew = false;

            if (!trigger || !trigger.classList.contains('sf-custom-select-trigger')) {
                isNew = true;
                // 创建触发器 UI
                trigger = document.createElement('div');
                trigger.className = 'sf-custom-select-trigger';
                trigger.innerHTML = `<span></span>`; // 这里的文字后续填充
                originalSelect.parentNode.insertBefore(trigger, originalSelect);
            }

            // 更新触发器文字
            const updateTrigger = () => {
                const selectedOption = originalSelect.options[originalSelect.selectedIndex];
                if (selectedOption) trigger.querySelector('span').innerText = selectedOption.text;
            };

            // 初始化/重置文字
            if (id === 'sf-cfg-lang') originalSelect.value = config.targetLang;
            else if (id === 'sf-cfg-style') originalSelect.value = config.transStyle;
            else if (id === 'sf-cfg-theme') originalSelect.value = config.themeMode;

            updateTrigger();

            // 点击触发器 (仅在新创建时绑定)
            if (isNew) {
                trigger.onclick = (e) => {
                    e.stopPropagation();
                    // 如果已经有打开的 popup，先关闭
                    closeAllPopups();

                    trigger.classList.add('active');
                    showSelectPopup(trigger, originalSelect, updateTrigger);
                };
            }
        });
    }

    let activePopup = null;
    let activeTrigger = null;

    function showSelectPopup(trigger, select, updateCallback) {
        const rect = trigger.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'sf-select-popup';

        // 生成选项
        Array.from(select.options).forEach(opt => {
            const el = document.createElement('div');
            el.className = `sf-select-option ${opt.selected ? 'selected' : ''}`;
            el.innerText = opt.text;
            el.onclick = (e) => {
                e.stopPropagation();
                select.value = opt.value;
                // 触发原生 change 事件以防有监听器
                select.dispatchEvent(new Event('change'));
                updateCallback();
                closeAllPopups();
            };
            popup.appendChild(el);
        });

        document.body.appendChild(popup);
        activePopup = popup;
        activeTrigger = trigger;

        // 计算位置 (Fixed 定位)
        popup.style.width = rect.width + 'px';
        popup.style.left = rect.left + 'px';

        // 智能判断向上还是向下弹出
        const spaceBelow = window.innerHeight - rect.bottom;
        const estimatedHeight = Math.min(select.options.length * 40 + 20, 300); // 估算高度

        if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
            // 向上弹出
            popup.style.top = (rect.top - 8) + 'px';
            popup.style.transformOrigin = 'bottom center';
            popup.style.transform = 'translateY(-100%) scale(0.9)';
            requestAnimationFrame(() => {
                popup.style.transform = 'translateY(-100%) scale(1)';
                popup.classList.add('sf-open');
            });
        } else {
            // 向下弹出 (默认)
            popup.style.top = (rect.bottom + 8) + 'px';
            popup.style.transformOrigin = 'top center';
            requestAnimationFrame(() => popup.classList.add('sf-open'));
        }
    }

    function closeAllPopups() {
        if (activePopup) {
            activePopup.classList.remove('sf-open');
            const p = activePopup;
            setTimeout(() => p.remove(), 200);
            activePopup = null;
        }
        if (activeTrigger) {
            activeTrigger.classList.remove('active');
            activeTrigger = null;
        }
    }

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (activePopup && !activePopup.contains(e.target)) {
            closeAllPopups();
        }
    });

    // 初始化自定义下拉菜单
    initCustomSelects();

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
// --- 🌙 护眼模式核心逻辑 (参考 Dark Reader 动态算法) ---
    function applyWebPageTheme() {
        const id = 'sf-global-theme-style';
        let style = document.getElementById(id);
        if(!style) {
            style = document.createElement('style');
            style.id = id;
            document.documentElement.appendChild(style);
        }

        const mode = config.themeMode;
        let isDark = mode === 'dark';
        if (mode === 'auto' && window.matchMedia) {
             isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        if (isDark) {
            // [智能检测]：获取背景色决定策略
            let bg = window.getComputedStyle(document.body).backgroundColor;
            let isAlreadyDark = false;

            const rgb = bg.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                if (brightness < 80) isAlreadyDark = true;
            }

            if (isAlreadyDark) {
                // 【深色网页模式】：仅提升一点点亮度和对比度，让暗部更有细节
                style.innerHTML = `
                    html {
                        filter: brightness(1.05) contrast(1.05) !important;
                        transition: filter 0.3s ease;
                    }
                `;
            } else {
                // 【浅色网页反转】：采用高对比度深度黑方案
                style.innerHTML = `
                    :root {
                        /* 强制浏览器开启原生深色渲染模式 */
                        color-scheme: dark !important;
                    }
                    html {
                        /* 1. invert(1) 彻底反转 */
                        /* 2. hue-rotate(180deg) 还原色相 */
                        /* 3. contrast(1.1) 解决灰蒙蒙感，提升文字清晰度 */
                        /* 4. saturate(1.2) 补偿色彩，让图标鲜艳 */
                        filter: invert(1) hue-rotate(180deg) contrast(1.1) brightness(1.0) saturate(1.2) !important;
                        background-color: #000000 !important;
                        transition: filter 0.4s ease-in-out;
                    }

                    /* 排除元素：图片、视频、地图、画板等 */
                    /* 使用多重滤镜还原，并微调亮度和对比度，防止图片在黑夜模式下太刺眼 */
                    img, video, canvas, [style*="background-image"], .video-player, .ad-unit {
                        filter: invert(1) hue-rotate(-180deg) brightness(0.9) contrast(1.1) !important;
                        opacity: 0.85;
                        transition: opacity 0.3s ease;
                    }
                    img:hover { opacity: 1; }

                    /* 排除插件自身的 UI，确保其 Liquid Glass 质感不受滤镜影响叠加 */
                    #sf-smart-icon, #sf-settings-modal, #sf-manual-panel, .sf-tooltip, .sf-select-popup, .sf-toast, #sf-toast-container {
                        filter: invert(1) hue-rotate(-180deg) brightness(1.05) contrast(1.05) !important;
                    }

                    /* 深度细节优化：移除文字阴影，防止反色后出现白色描边毛刺 */
                    * {
                        text-shadow: none !important;
                    }

                    /* 处理输入框，防止出现黑白交替的怪异感 */
                    input, textarea, select {
                        background-color: transparent !important;
                        color: inherit !important;
                    }

                    /* --- 极致深邃滚动条 (类似 MacOS 风格) --- */
                    ::-webkit-scrollbar { width: 10px; height: 10px; background-color: #000; }
                    ::-webkit-scrollbar-track { background-color: #000; }
                    ::-webkit-scrollbar-thumb { background-color: #333; border-radius: 10px; border: 2px solid #000; }
                    ::-webkit-scrollbar-thumb:hover { background-color: #444; }
                `;
            }
        } else {
            style.innerHTML = `html { transition: filter 0.4s ease; }`;
        }
    }

    // 监听系统主题变化 (针对 auto 模式)
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (config.themeMode === 'auto') {
                applyWebPageTheme();
            }
        });
    }

    // 初始化应用主题
    setTimeout(applyWebPageTheme, 100);

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

    // --- 拖拽逻辑 (设置面板) ---
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

    // [Touch Adapter] 设置面板拖动 - 触摸支持
    dragHandle.addEventListener("touchstart", (e) => {
        if (e.target.classList.contains("sf-close")) return;
        isDragging = true;
        const rect = settingsModal.getBoundingClientRect();
        const touch = e.touches[0];
        dragOffsetX = touch.clientX - rect.left;
        dragOffsetY = touch.clientY - rect.top;
        settingsModal.style.transform = "scale(1)";
        settingsModal.style.left = rect.left + "px";
        settingsModal.style.top = rect.top + "px";
        // 阻止默认滚动，防止拖动面板时页面跟着滚动
        e.preventDefault();
    }, { passive: false });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        let x = e.clientX - dragOffsetX;
        let y = e.clientY - dragOffsetY;
        if(x < 0) x = 0; if(y < 0) y = 0;
        settingsModal.style.left = x + "px";
        settingsModal.style.top = y + "px";
    });

    // [Touch Adapter] 设置面板拖动移动 - 触摸支持
    document.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        e.preventDefault(); // 阻止滚动
        const touch = e.touches[0];
        let x = touch.clientX - dragOffsetX;
        let y = touch.clientY - dragOffsetY;
        if(x < 0) x = 0; if(y < 0) y = 0;
        settingsModal.style.left = x + "px";
        settingsModal.style.top = y + "px";
    }, { passive: false });


    document.addEventListener("mouseup", (e) => {
        isDragging = false;
        document.body.style.userSelect = "";
    });
    // [Touch Adapter] 拖动结束 - 触摸支持
    document.addEventListener("touchend", (e) => {
        isDragging = false;
    });

    // --- 拖拽逻辑 (手动翻译面板) ---
    const manualDragHandle = document.getElementById("sf-manual-drag-handle");
    let isManualDragging = false;
    let manualDragOffsetX = 0, manualDragOffsetY = 0;

    manualDragHandle.addEventListener("mousedown", (e) => {
        if (e.target.classList.contains("sf-close")) return;
        isManualDragging = true;
        const rect = manualPanel.getBoundingClientRect();
        manualDragOffsetX = e.clientX - rect.left;
        manualDragOffsetY = e.clientY - rect.top;
        manualPanel.style.transform = "scale(1)";
        manualPanel.style.left = rect.left + "px";
        manualPanel.style.top = rect.top + "px";
        document.body.style.userSelect = "none";
        manualPanel.style.cursor = "grabbing";
    });

    // [Touch Adapter] 手动翻译面板拖动 - 触摸支持
    manualDragHandle.addEventListener("touchstart", (e) => {
        if (e.target.classList.contains("sf-close")) return;
        isManualDragging = true;
        const rect = manualPanel.getBoundingClientRect();
        const touch = e.touches[0];
        manualDragOffsetX = touch.clientX - rect.left;
        manualDragOffsetY = touch.clientY - rect.top;
        manualPanel.style.transform = "scale(1)";
        manualPanel.style.left = rect.left + "px";
        manualPanel.style.top = rect.top + "px";
        e.preventDefault();
    }, { passive: false });


    document.addEventListener("mousemove", (e) => {
        if (!isManualDragging) return;
        let x = e.clientX - manualDragOffsetX;
        let y = e.clientY - manualDragOffsetY;
        if(y < 0) y = 0;
        manualPanel.style.left = x + "px";
        manualPanel.style.top = y + "px";
    });

    // [Touch Adapter] 手动翻译面板拖动移动 - 触摸支持
    document.addEventListener("touchmove", (e) => {
        if (!isManualDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        let x = touch.clientX - manualDragOffsetX;
        let y = touch.clientY - manualDragOffsetY;
        if(y < 0) y = 0;
        manualPanel.style.left = x + "px";
        manualPanel.style.top = y + "px";
    }, { passive: false });

    document.addEventListener("mouseup", () => {
        if(isManualDragging) {
            isManualDragging = false;
            document.body.style.userSelect = "";
            manualPanel.style.cursor = "auto";
        }
    });
    // [Touch Adapter] 拖动结束
    document.addEventListener("touchend", () => {
        if(isManualDragging) {
            isManualDragging = false;
        }
    });

    // --- 设置面板开关与页面切换 ---
    function toggleSettings(show) {
        if (show) {
            document.getElementById("sf-greeting-text").innerText = getGreeting();
            settingsModal.classList.add("sf-open");
            settingsModal.classList.remove("sf-show-info");
            overlay.classList.add("sf-open");
            document.body.style.overflow = "hidden";
            if (!settingsModal.style.left) {
                 settingsModal.style.left = "50%";
                 settingsModal.style.top = "50%";
            }
            document.getElementById("sf-cfg-key").value = config.apiKey;
            document.getElementById("sf-cfg-icon").checked = config.enableIcon;
            document.getElementById("sf-cfg-tooltip").checked = config.enableTooltip;
            document.getElementById("sf-cfg-only-tooltip").checked = config.onlyTooltip;

            // 重新同步下拉菜单状态
            initCustomSelects();
        } else {
            settingsModal.classList.remove("sf-open");
            overlay.classList.remove("sf-open");
            document.body.style.overflow = "";
            closeAllPopups();
        }
    }

    GM_registerMenuCommand("⚙️ 打开设置", () => toggleSettings(true));

    document.getElementById("sf-save-btn").onclick = () => {
        const newKey = document.getElementById("sf-cfg-key").value.trim();
        config.apiKey = newKey;
        config.targetLang = document.getElementById("sf-cfg-lang").value;
        config.transStyle = document.getElementById("sf-cfg-style").value;
        config.themeMode = document.getElementById("sf-cfg-theme").value; // 保存主题设置
        config.model = document.getElementById("sf-cfg-model").value.trim();
        config.enableIcon = document.getElementById("sf-cfg-icon").checked;
        config.enableTooltip = document.getElementById("sf-cfg-tooltip").checked;
        config.onlyTooltip = document.getElementById("sf-cfg-only-tooltip").checked;

        GM_setValue("SF_API_KEY", config.apiKey);
        GM_setValue("SF_TARGET_LANG", config.targetLang);
        GM_setValue("SF_TRANS_STYLE", config.transStyle);
        GM_setValue("SF_THEME_MODE", config.themeMode);
        GM_setValue("SF_MODEL", config.model);
        GM_setValue("SF_ENABLE_ICON", config.enableIcon);
        GM_setValue("SF_ENABLE_TOOLTIP", config.enableTooltip);
        GM_setValue("SF_ONLY_TOOLTIP", config.onlyTooltip);

        // 立即应用主题
        applyWebPageTheme();

        toggleSettings(false);
        showToast("配置已更新", "success");
    };

    document.getElementById("sf-settings-close").onclick = () => toggleSettings(false);
    overlay.onclick = () => { toggleSettings(false); toggleManualPanel(false); closeAllPopups(); };

    document.getElementById("sf-to-info").onclick = () => {
        settingsModal.classList.add("sf-show-info");
    };

    document.getElementById("sf-back-main").onclick = () => {
        settingsModal.classList.remove("sf-show-info");
    };

    // --- 全局快捷键：ESC 关闭面板 ---
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (settingsModal.classList.contains("sf-open")) toggleSettings(false);
            if (manualPanel.classList.contains("sf-open")) toggleManualPanel(false);
            closeAllPopups();
        }
    });

    // --- 手动翻译面板逻辑 ---
    function toggleManualPanel(show) {
        if (show) {
            manualPanel.classList.add("sf-open");
            overlay.classList.add("sf-open");
            document.getElementById("sf-manual-input").focus();
             if (!manualPanel.style.left) {
                 manualPanel.style.left = "50%";
                 manualPanel.style.top = "50%";
                 manualPanel.style.transform = "translate(-50%, -50%) scale(1)";
            } else {
                 manualPanel.style.transform = "scale(1)";
            }
             navigator.clipboard.readText().then(text => {
                 if(text && text.trim().length > 0 && document.getElementById("sf-manual-input").value === "") {
                     // 可选：自动粘贴
                 }
             }).catch(()=>{});

        } else {
            manualPanel.classList.remove("sf-open");
            overlay.classList.remove("sf-open");
        }
    }

    document.getElementById("sf-manual-close").onclick = () => toggleManualPanel(false);

    document.getElementById("sf-manual-btn").onclick = () => {
        const text = document.getElementById("sf-manual-input").value.trim();
        if(!text) return showToast("请输入内容", "error");
        handleManualTranslation(text);
    };

    document.getElementById("sf-manual-input").addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            const text = document.getElementById("sf-manual-input").value.trim();
            if(text) handleManualTranslation(text);
        }
    });

    document.getElementById("sf-manual-copy").onclick = () => {
        const res = document.getElementById("sf-manual-output").value;
        if(res) {
            GM_setClipboard(res);
            showToast("结果已复制", "copy");
        }
    };

    function handleManualTranslation(text) {
        if (!config.apiKey) return toggleSettings(true);
        const outputArea = document.getElementById("sf-manual-output");
        outputArea.value = "正在思考中...";
        outputArea.style.opacity = "0.7";

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
                outputArea.style.opacity = "1";
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        let result = data.choices[0].message.content.trim();
                        outputArea.value = result;
                    } catch (e) {
                        outputArea.value = "解析错误";
                    }
                } else {
                    outputArea.value = `Error ${res.status}`;
                }
            },
            onerror: () => {
                 outputArea.style.opacity = "1";
                 outputArea.value = "网络错误";
            }
        });
    }


    // --- 选词与图标逻辑 ---
    let selectedRange = null;
    let selectedText = "";

    document.addEventListener("click", (e) => {
        if (e.altKey && !isDragging && !isManualDragging && !settingsModal.contains(e.target) && !manualPanel.contains(e.target)) {
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
        if (!config.enableIcon) return;

        const text = selection.toString().trim();
        if (text && text.length > 0) {
            selectedText = text;
            selectedRange = selection.getRangeAt(0);
            const rect = selectedRange.getBoundingClientRect();

            // [Touch Adapter] 检测是否为触摸设备 (如 iPad/iPhone)
            // iOS 的原生选中菜单 (Copy/Lookup) 通常高度在 40px 左右，且会紧贴选区下方或上方
            // 这里为触摸设备增加额外的垂直偏移量 (45px)，让图标显示在原生菜单的下方，避免重叠
            const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
            const touchOffsetY = isTouch ? 45 : 0;

            let top = rect.bottom + window.scrollY + DEFAULTS.ICON_OFFSET_Y + touchOffsetY;
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
        if (isDragging || isManualDragging) return;
        if (tooltip.contains(e.target)) return;
        if (manualPanel.contains(e.target)) return;
        if (activePopup && activePopup.contains(e.target)) return; // 忽略下拉菜单的点击
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

    // [Touch Adapter] 文本选择结束与图标触发 - 触摸支持
    document.addEventListener("touchend", (e) => {
        if (isDragging || isManualDragging) return;
        // 忽略面板内点击
        if (tooltip.contains(e.target) || manualPanel.contains(e.target) || settingsModal.contains(e.target)) return;
        if (activePopup && activePopup.contains(e.target)) return;

        // 延迟执行，因为触摸结束时选区可能尚未完全确立
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection.toString().trim().length > 0) {
                processSelection(selection);
            } else {
                 // 如果没有选区，隐藏图标
                 if (smartIcon.style.display !== "none" && !smartIcon.classList.contains("sf-pop-out")) {
                      smartIcon.style.display = "none";
                      isIconVisible = false;
                 }
            }
        }, 100);
    });

    document.addEventListener("mousedown", (e) => {
        if (tooltip.contains(e.target)) return;
        if (manualPanel.contains(e.target)) return;
        if (activePopup && activePopup.contains(e.target)) return;
        if (!smartIcon.contains(e.target) && !settingsModal.contains(e.target)) {
            setTimeout(() => {
                if (!window.getSelection().toString().trim()) {
                    smartIcon.style.display = "none";
                    isIconVisible = false;
                }
            }, 100);
        }
    });

    // [Touch Adapter] 点击空白处隐藏图标 - 触摸支持
    document.addEventListener("touchstart", (e) => {
        if (tooltip.contains(e.target)) return;
        if (manualPanel.contains(e.target)) return;
        if (activePopup && activePopup.contains(e.target)) return;
        if (!smartIcon.contains(e.target) && !settingsModal.contains(e.target)) {
            // 在触摸开始时检查，可以更灵敏地隐藏图标
             if (!window.getSelection().toString().trim()) {
                 if (isIconVisible) {
                      smartIcon.style.display = "none";
                      isIconVisible = false;
                 }
             }
        }
    });

    // --- 核心翻译逻辑 ---
    async function executeTranslation() {
        if (!config.apiKey) return toggleSettings(true);
        if (!selectedRange) return;

        const span = document.createElement("span");
        span.className = "sf-translated-node sf-loading";

        // 如果开启了仅悬浮窗模式，添加特殊样式类
        if (config.onlyTooltip) {
            span.classList.add("sf-tooltip-mode");
        }

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
        if (e.altKey && (e.code === "KeyX" || e.key === "x" || e.key === "X")) {
            e.preventDefault();
            const isOpen = manualPanel.classList.contains("sf-open");
            toggleManualPanel(!isOpen);
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

        if (config.onlyTooltip) {
            // --- 仅悬浮窗模式 ---
            // 不替换文本，原文保留在 innerText
            span.setAttribute("data-translated", text);
            span.setAttribute("data-state", "translated-tooltip-only");

            // 立即弹出悬浮窗显示译文
            showTooltip(span, "译文", text, text);

            // 鼠标交互：显示译文
            span.onmouseenter = () => showTooltip(span, "译文", text, text);
            span.onmouseleave = () => setTimeout(() => { if (!tooltip.matches(':hover')) hideTooltip(); }, 100);

            // 点击交互：也可以显示译文（或者执行其他操作）
            span.onclick = (e) => {
                 e.stopPropagation();
                 showTooltip(span, "译文", text, text);
            };

        } else {
            // --- 默认模式 (替换原文) ---
            span.innerText = text;
            span.setAttribute("data-translated", text);
            span.setAttribute("data-state", "translated");

            // 鼠标交互：显示原文
            span.onmouseenter = (e) => {
                if (config.enableTooltip && span.getAttribute("data-state") === "translated") {
                    // 参数：目标，标题，内容，复制内容(这里复制的是译文，即当前显示的文本)
                    showTooltip(e, "原文", span.getAttribute("data-original"), text);
                }
            };
            span.onmouseleave = () => setTimeout(() => { if (!tooltip.matches(':hover')) hideTooltip(); }, 100);

            // 点击交互：切换原文/译文
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
    }

    function updateUIError(span, msg) {
        span.classList.remove("sf-loading");
        span.classList.add("sf-error");
        // 错误状态下总是显示错误信息，点击恢复原文
        const originalText = span.getAttribute("data-original");
        if (!config.onlyTooltip) {
             span.innerText = `[${msg}]`;
        }
        showToast("翻译请求失败", "error");
        span.onclick = (e) => {
            e.stopPropagation();
            span.innerText = originalText;
            span.className = ""; // 移除所有样式，变回普通文本
            // 这里可以做一个更优雅的“解包”逻辑，把 span 替换回纯文本节点，不过清空 class 视觉上也差不多
        };
    }

    /**
     * 显示 Tooltip
     * @param {MouseEvent|HTMLElement} target - 触发源，可以是鼠标事件对象，也可以是 DOM 元素
     * @param {string} label - 标题 (Original/译文)
     * @param {string} content - 显示的内容
     * @param {string} copyContent - 复制按钮复制的内容
     */
    function showTooltip(target, label, content, copyContent) {
        if (!config.enableTooltip && !config.onlyTooltip) return;

        tooltip.innerHTML = `
            <div class="sf-tooltip-arrow"></div>
            <div style="margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--sf-tooltip-sub); font-weight:700;">${label}</div>
            <div style="font-weight:500; font-size:14px; margin-bottom:12px; line-height:1.4; color:var(--sf-tooltip-text);">${content}</div>
            <button class="sf-action-btn" id="sf-btn-copy">复制</button>
        `;

        // 计算定位坐标
        let clientX, clientY;
        const rect = tooltip.getBoundingClientRect();
        let targetRect = null;

        if (target instanceof HTMLElement) {
            // 如果传入的是 DOM 元素 (自动弹出模式)
            targetRect = target.getBoundingClientRect();
            clientX = targetRect.left + targetRect.width / 2;
            clientY = targetRect.bottom;
        } else if (target.clientX !== undefined) {
            // 如果传入的是鼠标事件
            clientX = target.clientX;
            clientY = target.clientY;
        } else {
            return;
        }

        let left = clientX - 20;
        // 如果是元素触发，让 tooltip 居中对齐元素
        if (target instanceof HTMLElement) {
             left = clientX - rect.width / 2;
        }

        const spaceBelow = window.innerHeight - clientY;
        const tooltipHeight = 150; // 估算高度 (增加了按钮高度)

        let top;
        // 智能判断上下位置
        if (target instanceof HTMLElement) {
             if (spaceBelow < tooltipHeight + 20) {
                 top = targetRect.top - rect.height - 10;
                 tooltip.classList.remove('sf-bottom');
                 tooltip.classList.add('sf-top');
                 tooltip.style.transformOrigin = "bottom center";
             } else {
                 top = targetRect.bottom + 10;
                 tooltip.classList.remove('sf-top');
                 tooltip.classList.add('sf-bottom');
                 tooltip.style.transformOrigin = "top center";
             }
        } else {
            if (spaceBelow < tooltipHeight + 20) {
                top = clientY - rect.height - 10;
                if (top < 10) top = clientY + 20;
                else {
                    tooltip.classList.remove('sf-bottom');
                    tooltip.classList.add('sf-top');
                    tooltip.style.transformOrigin = "bottom left";
                }
            } else {
                top = clientY + 24;
                tooltip.classList.remove('sf-top');
                tooltip.classList.add('sf-bottom');
                tooltip.style.transformOrigin = "top left";
            }
        }

        // 边界检查
        if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 10;
        if (left < 10) left = 10;

        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
        tooltip.classList.add("sf-show");

        document.getElementById("sf-btn-copy").onclick = (evt) => {
            evt.stopPropagation();
            GM_setClipboard(copyContent);
            showToast("已复制", "copy");
            hideTooltip();
        };
    }

    function hideTooltip() {
        tooltip.classList.remove("sf-show");
    }

    tooltip.addEventListener('mouseleave', hideTooltip);

})();
