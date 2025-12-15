// ==UserScript==
// @name         iOS简单翻译 (极简版)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  只有最基础的翻译功能。适配 Userscripts 扩展。
// @author       WangPan
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.siliconflow.cn
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置 ---
    const API_URL = "https://api.siliconflow.cn/v1/chat/completions";
    const MODEL = "Qwen/Qwen2.5-7B-Instruct"; // 使用速度最快的模型

    // --- 样式注入 ---
    const style = document.createElement('style');
    style.innerHTML = `
        /* 简单的圆形按钮 */
        #sf-lite-btn {
            position: fixed;
            bottom: 120px;
            right: 20px;
            width: 48px;
            height: 48px;
            background: rgba(0, 122, 255, 0.9);
            color: white;
            border-radius: 50%;
            text-align: center;
            line-height: 48px;
            font-size: 18px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 999999;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            font-family: sans-serif;
        }
        #sf-lite-btn:active { transform: scale(0.95); opacity: 0.8; }

        /* 简单的结果面板 */
        #sf-lite-result {
            position: fixed;
            top: 20%;
            left: 5%;
            width: 90%;
            background: rgba(255, 255, 255, 0.95);
            color: #333;
            padding: 15px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 1000000;
            display: none;
            font-size: 16px;
            line-height: 1.5;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0,0,0,0.1);
            font-family: -apple-system, sans-serif;
            box-sizing: border-box;
            max-height: 60vh;
            overflow-y: auto;
        }
        .sf-lite-close {
            float: right;
            color: #999;
            font-size: 20px;
            margin-left: 10px;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);

    // --- 创建 DOM ---
    // 按钮
    const btn = document.createElement('div');
    btn.id = 'sf-lite-btn';
    btn.innerText = '译';
    document.body.appendChild(btn);

    // 结果面板
    const panel = document.createElement('div');
    panel.id = 'sf-lite-result';
    document.body.appendChild(panel);

    // --- 交互逻辑 ---
    
    // 点击面板关闭
    panel.onclick = () => { panel.style.display = 'none'; };

    // 按钮点击事件 (核心)
    btn.addEventListener('click', async (e) => {
        // 1. 检查 Key
        let apiKey = GM_getValue("SF_KEY", "");
        if (!apiKey) {
            apiKey = prompt("🔴 初次使用请配置 API Key\n请输入 SiliconFlow Key (sk-xxxx):");
            if (apiKey && apiKey.startsWith("sk-")) {
                GM_setValue("SF_KEY", apiKey);
                alert("✅ 保存成功，请再次点击按钮翻译");
            } else {
                alert("❌ Key 格式不正确或已取消");
            }
            return;
        }

        // 2. 获取文本
        let text = window.getSelection().toString().trim();
        
        // 如果没选中文本，弹出输入框
        if (!text) {
            text = prompt("📝 请输入要翻译的内容:");
        }

        if (!text) return; // 还是没内容，退出

        // 3. 显示“正在翻译”
        showResult("⏳ 正在思考...", true);

        // 4. 发起请求
        GM_xmlhttpRequest({
            method: "POST",
            url: API_URL,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            data: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: "Translate to Simplified Chinese. Only output the result." },
                    { role: "user", content: text }
                ],
                stream: false
            }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.choices && data.choices[0]) {
                        showResult("✅ " + data.choices[0].message.content);
                    } else {
                        showResult("❌ 接口返回错误: " + JSON.stringify(data));
                    }
                } catch (e) {
                    showResult("❌ 解析失败");
                }
            },
            onerror: function(err) {
                showResult("❌ 网络请求失败");
            }
        });
    });

    // --- 辅助函数 ---
    function showResult(msg, isLoading = false) {
        panel.innerHTML = `<span class="sf-lite-close">×</span><div>${msg.replace(/\n/g, '<br>')}</div>`;
        panel.style.display = 'block';
        if (!isLoading) {
            // 如果不是加载状态，绑定关闭按钮
            panel.querySelector('.sf-lite-close').onclick = (e) => {
                e.stopPropagation();
                panel.style.display = 'none';
            };
        }
    }

})();

