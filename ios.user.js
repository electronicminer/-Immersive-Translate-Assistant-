// ==UserScript==
// @name         iOS调试版翻译
// @namespace    http://tampermonkey.net/
// @version      9.9.9
// @description  调试专用：加载成功会弹窗提示。
// @author       Debug
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      api.siliconflow.cn
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. 暴力检测：如果脚本运行了，先弹个窗证明自己活着
    // 如果你刷新页面没看到这个弹窗，说明脚本根本没被 Userscripts 加载！
    // 请去 Safari 地址栏 "大小(Aa)" -> Userscripts -> 检查权限
    setTimeout(() => {
        // 使用 setTimeout 确保页面加载一点点后再弹
        console.log("脚本尝试启动...");
    }, 1000);

    // --- 配置 ---
    const API_URL = "https://api.siliconflow.cn/v1/chat/completions";
    const MODEL = "Qwen/Qwen2.5-7B-Instruct";

    // --- 样式 (最高层级) ---
    const style = document.createElement('style');
    style.innerHTML = `
        #sf-debug-btn {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%); /* 强制居中 */
            width: 80px;
            height: 80px;
            background: red; /* 红色背景，极其显眼 */
            color: white;
            border-radius: 50%;
            text-align: center;
            line-height: 80px;
            font-size: 24px;
            font-weight: bold;
            box-shadow: 0 0 20px rgba(255,0,0,0.5);
            z-index: 2147483647 !important; /* 最高层级 */
            cursor: pointer;
            border: 4px solid white;
        }
        #sf-result-box {
            position: fixed;
            top: 10%;
            left: 5%;
            width: 90%;
            background: white;
            color: black;
            padding: 20px;
            border: 2px solid black;
            z-index: 2147483647;
            display: none;
            font-size: 16px;
            border-radius: 10px;
            box-shadow: 0 10px 50px rgba(0,0,0,0.5);
            max-height: 80vh;
            overflow: auto;
        }
    `;
    document.head.appendChild(style);

    // --- 创建按钮 ---
    const btn = document.createElement('div');
    btn.id = 'sf-debug-btn';
    btn.innerText = '译';
    document.documentElement.appendChild(btn); // 挂载到 html 节点，防止 body 还没生成

    // --- 创建结果框 ---
    const resultBox = document.createElement('div');
    resultBox.id = 'sf-result-box';
    document.documentElement.appendChild(resultBox);

    // --- 交互 ---
    btn.addEventListener('click', function() {
        // 1. 获取 Key (使用 localStorage，避免 GM_getValue 报错)
        let apiKey = localStorage.getItem("SF_API_KEY");
        if (!apiKey) {
            apiKey = prompt("请输入 SiliconFlow API Key (sk-xxxx):");
            if (apiKey) {
                localStorage.setItem("SF_API_KEY", apiKey);
                alert("Key 已保存");
            } else {
                return;
            }
        }

        // 2. 获取文本
        let text = window.getSelection().toString().trim();
        if (!text) {
            text = prompt("没选中文本，请输入要翻译的内容：");
        }
        if (!text) return;

        // 3. 显示加载
        resultBox.style.display = 'block';
        resultBox.innerText = "正在请求网络...";

        // 4. 发送请求
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
                    { role: "system", content: "Translate to Simplified Chinese." },
                    { role: "user", content: text }
                ],
                stream: false
            }),
            onload: function(res) {
                try {
                    const data = JSON.parse(res.responseText);
                    const trans = data.choices?.[0]?.message?.content || "API返回错误: " + JSON.stringify(data);
                    resultBox.innerHTML = `<strong>原文：</strong><br>${text}<hr><strong>译文：</strong><br>${trans}<br><br><button onclick="this.parentElement.style.display='none'" style="padding:10px;width:100%">关闭</button>`;
                } catch(e) {
                    resultBox.innerText = "解析错误: " + e.message;
                }
            },
            onerror: function(err) {
                resultBox.innerText = "网络请求失败，请检查网络或 Key 是否正确。";
            }
        });
    });
})();

