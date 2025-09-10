// ==UserScript==
// @name         Gemini 聊天对话记录一键导出
// @namespace    http://tampermonkey.net/
// @version      1.0.6
// @description  一键导出 Google Gemini 的网页端对话聊天记录为 JSON / TXT / Markdown 文件。
// @author       sxuan
// @match        https://gemini.google.com/app*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCACAyNCIgZmlsbD0iIzAwNzhmZiI+PHBhdGggZD0iTTE5LjUgMi4yNWgtMTVjLTEuMjQgMC0yLjI1IDEuMDEtMi4yNSAyLjI1djE1YzAgMS4yNCAxLjAxIDIuMjUgMi4yNSAyLjI1aDE1YzEuMjQgMCAyLjI1LTEuMDEgMi4yNS0yLjI1di0xNWMwLTEuMjQtMS4wMS0yLjI1LTIuMjUtMi4yNXptLTIuMjUgNmgtMTAuNWMtLjQxIDAtLjc1LS4zNC0uNzUtLjc1cy4zNC0uNzUuNzUtLjc1aDEwLjVjLjQxIDAgLjc1LjM0Ljc1Ljc1cy0uMzQuNzUtLjc1Ljc1em0wIDRoLTEwLjVjLS40MSAwLS43NS0uMzQtLjc1LS43NXMuMzQtLjc1Ljc1LS43NWgxMC41Yy40MSAwIC43NS4zNC43NS43NXMtLjM0Ljc1LS4yNS43NXptLTMgNGgtNy41Yy0uNDEgMC0uNzUtLjM0LS43NS0uNzVzLjM0LS43NS43NS0uNzVoNy41Yy40MSAwIC43NS4zNC43NS43NXMtLjM0Ljc1LS43NS43NXoiLz48L3N2Zz4=
// @updateURL    https://raw.githubusercontent.com/Sxuan-Coder/gemini_chat_export/main/gemini_chat_export.user.js
// @downloadURL  https://raw.githubusercontent.com/Sxuan-Coder/gemini_chat_export/main/gemini_chat_export.user.js
// @license      Apache-2.0
// ==/UserScript==

(function () {
	'use strict';

	// --- 兼容性修复：TrustedHTML 策略 ---
	// 修复现代浏览器 Trusted Types 安全策略错误 + 强化版本
	if (window.trustedTypes && window.trustedTypes.createPolicy) {
		try {
			// 尝试创建默认策略
			if (!window.trustedTypes.defaultPolicy) {
				window.trustedTypes.createPolicy('default', {
					createHTML: (string) => string,
					createScript: (string) => string,
					createScriptURL: (string) => string
				});
			}
		} catch (e) {
			// 如果默认策略已存在，创建备用策略
			try {
				window.trustedTypes.createPolicy('userscript-fallback', {
					createHTML: (string) => string,
					createScript: (string) => string,
					createScriptURL: (string) => string
				});
			} catch (e2) {
				console.warn('TrustedTypes 策略创建失败，但脚本将继续运行', e2);
			}
		}
	}

	// 额外的DOM操作安全包装
	const safeSetInnerHTML = (element, html) => {
		try {
			if (window.trustedTypes && window.trustedTypes.createPolicy) {
				const policy = window.trustedTypes.defaultPolicy ||
					window.trustedTypes.createPolicy('temp-policy', {
						createHTML: (string) => string
					});
				element.innerHTML = policy.createHTML(html);
			} else {
				element.innerHTML = html;
			}
		} catch (e) {
			// 回退到textContent
			element.textContent = html.replace(/<[^>]*>/g, '');
		}
	};

	// --- 全局配置常量 ---
	// UPDATED: 支持隐藏格式钩子 window.__GEMINI_EXPORT_FORMAT = 'txt'|'json'|'md'
	const buttonTextStartScroll = "滚动导出对话";
	const buttonTextStopScroll = "停止滚动";
	const buttonTextProcessingScroll = "处理滚动数据...";
	const successTextScroll = "滚动导出对话成功!";
	const errorTextScroll = "滚动导出失败";

	// Canvas 导出相关常量
	const buttonTextCanvasExport = "导出Canvas";
	const buttonTextCanvasProcessing = "处理Canvas数据...";
	const successTextCanvas = "Canvas 导出成功!";
	const errorTextCanvas = "Canvas 导出失败";

	// 组合导出相关常量
	const buttonTextCombinedExport = "一键导出对话+Canvas";
	const buttonTextCombinedProcessing = "处理组合数据...";
	const successTextCombined = "组合导出成功!";
	const errorTextCombined = "组合导出失败";

	const exportTimeout = 3000;

	const SCROLL_DELAY_MS = 1000;
	const MAX_SCROLL_ATTEMPTS = 300;
	const SCROLL_INCREMENT_FACTOR = 0.85;
	const SCROLL_STABILITY_CHECKS = 3;

	if (!window.__GEMINI_EXPORT_FORMAT) { window.__GEMINI_EXPORT_FORMAT = 'txt'; }

	// --- 脚本内部状态变量 ---
	let isScrolling = false;
	let collectedData = new Map();
	let scrollCount = 0;
	let noChangeCounter = 0;

	// --- UI 界面元素变量 ---
	let captureButtonScroll = null;
	let stopButtonScroll = null;
	let captureButtonCanvas = null;
	let captureButtonCombined = null;
	let statusDiv = null;
	let hideButton = null;
	let buttonContainer = null;
	let sidePanel = null;
	let toggleButton = null;
	let formatSelector = null;

	// --- 辅助工具函数 ---
	function delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function getCurrentTimestamp() {
		const n = new Date();
		const YYYY = n.getFullYear();
		const MM = (n.getMonth() + 1).toString().padStart(2, '0');
		const DD = n.getDate().toString().padStart(2, '0');
		const hh = n.getHours().toString().padStart(2, '0');
		const mm = n.getMinutes().toString().padStart(2, '0');
		const ss = n.getSeconds().toString().padStart(2, '0');
		return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
	}

	/**
	 * 用于从页面获取项目名称
	 * @returns {string} - 清理后的项目名称，或一个默认名称
	 */
	function getProjectName() {
		try {
			const firstUser = document.querySelector('#chat-history user-query .query-text, #chat-history user-query .query-text-line, #chat-history user-query .query-text p');
			if (firstUser && firstUser.textContent && firstUser.textContent.trim()) {
				const raw = firstUser.textContent.trim().replace(/\s+/g, ' ');
				const clean = raw.substring(0, 20).replace(/[\\/:\*\?"<>\|]/g, '_');
				if (clean) return `Gemini_${clean}`;
			}
		} catch (e) { console.warn('Gemini 项目名提取失败，回退 XPath', e); }
		const xpath = "/html/body/app-root/ms-app/div/div/div/div/span/ms-prompt-switcher/ms-chunk-editor/section/ms-toolbar/div/div[1]/div/div/h1";
		const defaultName = "GeminiChat";
		try {
			const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
			const titleElement = result.singleNodeValue;
			if (titleElement && titleElement.textContent) {
				const cleanName = titleElement.textContent.trim().replace(/[\\/:\*\?"<>\|]/g, '_');
				return cleanName || defaultName;
			}
		} catch (e) { }
		return defaultName;
	}


	function getMainScrollerElement_AiStudio() {
		console.log("尝试查找滚动容器 (用于滚动导出)...");
		let scroller = document.querySelector('.chat-scrollable-container');
		if (scroller && scroller.scrollHeight > scroller.clientHeight) {
			console.log("找到滚动容器 (策略 1: .chat-scrollable-container):", scroller);
			return scroller;
		}
		scroller = document.querySelector('mat-sidenav-content');
		if (scroller && scroller.scrollHeight > scroller.clientHeight) {
			console.log("找到滚动容器 (策略 2: mat-sidenav-content):", scroller);
			return scroller;
		}
		const chatTurnsContainer = document.querySelector('ms-chat-turn')?.parentElement;
		if (chatTurnsContainer) {
			let parent = chatTurnsContainer;
			for (let i = 0; i < 5 && parent; i++) {
				if (parent.scrollHeight > parent.clientHeight + 10 &&
					(window.getComputedStyle(parent).overflowY === 'auto' || window.getComputedStyle(parent).overflowY === 'scroll')) {
					console.log("找到滚动容器 (策略 3: 向上查找父元素):", parent);
					return parent;
				}
				parent = parent.parentElement;
			}
		}
		console.warn("警告 (滚动导出): 未能通过特定选择器精确找到 AI Studio 滚动区域，将尝试使用 document.documentElement。如果滚动不工作，请按F12检查聊天区域的HTML结构，并更新此函数内的选择器。");
		return document.documentElement;
	}

	// Gemini 新增滚动容器获取与解析逻辑
	function getMainScrollerElement_Gemini() {
		return document.querySelector('#chat-history') || document.documentElement;
	}

	function extractDataIncremental_Gemini() {
		let newly = 0, updated = false;
		const nodes = document.querySelectorAll('#chat-history .conversation-container');
		const seenUserTexts = new Set(); // 用于去重用户消息

		nodes.forEach((c, idx) => {
			let info = collectedData.get(c) || { domOrder: idx, type: 'unknown', userText: null, thoughtText: null, responseText: null };
			let changed = false;
			if (!collectedData.has(c)) { collectedData.set(c, info); newly++; }
			if (!info.userText) {
				const userTexts = Array.from(c.querySelectorAll('user-query .query-text-line, user-query .query-text p, user-query .query-text'))
					.map(el => el.innerText.trim()).filter(Boolean);
				if (userTexts.length) {
					const combinedUserText = userTexts.join('\n');
					// 检查是否已经存在相同的用户消息
					if (!seenUserTexts.has(combinedUserText)) {
						seenUserTexts.add(combinedUserText);
						info.userText = combinedUserText;
						changed = true;
						if (info.type === 'unknown') info.type = 'user';
					}
				}
			}
			const modelRoot = c.querySelector('.response-container-content, model-response');
			if (modelRoot) {
				if (!info.responseText) {
					const md = modelRoot.querySelector('.model-response-text .markdown');
					if (md && md.innerText.trim()) { info.responseText = md.innerText.trim(); changed = true; }
				}
				if (!info.thoughtText) {
					const thoughts = modelRoot.querySelector('model-thoughts');
					if (thoughts) {
						let textReal = '';
						const body = thoughts.querySelector('.thoughts-body, .thoughts-content');
						if (body && body.innerText.trim() && !/显示思路/.test(body.innerText.trim())) textReal = body.innerText.trim();
						info.thoughtText = textReal || '(思维链未展开)'; // 占位策略 A
						changed = true;
					}
				}
			}
			if (changed) {
				if (info.userText && info.responseText && info.thoughtText) info.type = 'model_thought_reply';
				else if (info.userText && info.responseText) info.type = 'model_reply';
				else if (info.userText) info.type = 'user';
				else if (info.responseText && info.thoughtText) info.type = 'model_thought_reply';
				else if (info.responseText) info.type = 'model_reply';
				else if (info.thoughtText) info.type = 'model_thought';
				collectedData.set(c, info); updated = true;
			}
		});
		updateStatus(`滚动 ${scrollCount}/${MAX_SCROLL_ATTEMPTS}... 已收集 ${collectedData.size} 条记录..`);
		return newly > 0 || updated;
	}

	function extractDataIncremental_Dispatch() {
		if (document.querySelector('#chat-history .conversation-container')) return extractDataIncremental_Gemini();
		return extractDataIncremental_AiStudio();
	}


	// --- UI 界面创建与更新 ---
	function createUI() {
		console.log("开始创建 UI 元素...");

		// 创建右侧折叠按钮
		toggleButton = document.createElement('div');
		toggleButton.id = 'gemini-export-toggle';
		toggleButton.innerHTML = '<';
		toggleButton.style.cssText = `
			position: fixed;
			top: 50%;
			right: 0;
			width: 40px;
			height: 60px;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			border: none;
			border-radius: 20px 0 0 20px;
			cursor: pointer;
			z-index: 10001;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 18px;
			font-weight: bold;
			box-shadow: -2px 0 10px rgba(0,0,0,0.2);
			transition: all 0.3s ease;
			transform: translateY(-50%);
		`;
		document.body.appendChild(toggleButton);

		// 创建右侧面板
		sidePanel = document.createElement('div');
		sidePanel.id = 'gemini-export-panel';
		sidePanel.style.cssText = `
			position: fixed;
			top: 0;
			right: -400px;
			width: 400px;
			height: 100vh;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			z-index: 10000;
			transition: right 0.3s ease;
			box-shadow: -5px 0 20px rgba(0,0,0,0.3);
			overflow-y: auto;
		`;
		document.body.appendChild(sidePanel);

		// 面板内容
		sidePanel.innerHTML = `
			<div style="padding: 20px; color: white;">
				<!-- 标题区域 -->
				<div style="display: flex; align-items: center; margin-bottom: 20px;">
					<div style="width: 4px; height: 20px; background: #4CAF50; margin-right: 10px; border-radius: 2px;"></div>
					<h2 style="margin: 0; font-size: 18px; font-weight: 600;">📄 Gemini导出助手</h2>
				</div>
				<p style="margin: 0 0 20px 0; font-size: 13px; opacity: 0.9; line-height: 1.4;">一键导出聊天记录和Canvas内容</p>

				<!-- 公告区域 -->
				<div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 15px; margin-bottom: 25px; backdrop-filter: blur(10px);">
					<h3 style="margin: 0 0 10px 0; font-size: 14px; color: #FFE082;">📢 插件公告</h3>
					<div style="font-size: 12px; line-height: 1.5; opacity: 0.9;">
						<div style="margin-bottom: 8px;">🎉 新增Canvas内容导出功能</div>
						<div style="margin-bottom: 8px;">⚡ 支持多格式导出选择</div>
						<div>💡 建议导出前滚动到对话顶部</div>
					</div>
				</div>

				<!-- 导出格式选择 -->
				<div style="margin-bottom: 25px;">
					<h3 style="margin: 0 0 15px 0; font-size: 14px; color: #E1F5FE;">🎨 导出格式</h3>
					<div id="format-selector" style="display: flex; gap: 8px; flex-wrap: wrap;">
						<div class="format-option" data-format="txt" style="flex: 1; min-width: 0; padding: 10px; background: rgba(255,255,255,0.2); border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px; border: 2px solid transparent;">
							<div style="font-weight: 600; margin-bottom: 2px;">📄 TXT</div>
							<div style="opacity: 0.8; font-size: 10px;">纯文本</div>
						</div>
						<div class="format-option" data-format="json" style="flex: 1; min-width: 0; padding: 10px; background: rgba(255,255,255,0.2); border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px; border: 2px solid transparent;">
							<div style="font-weight: 600; margin-bottom: 2px;">📊 JSON</div>
							<div style="opacity: 0.8; font-size: 10px;">结构化</div>
						</div>
						<div class="format-option" data-format="md" style="flex: 1; min-width: 0; padding: 10px; background: rgba(255,255,255,0.2); border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px; border: 2px solid transparent;">
							<div style="font-weight: 600; margin-bottom: 2px;">📝 MD</div>
							<div style="opacity: 0.8; font-size: 10px;">Markdown</div>
						</div>
					</div>
				</div>

				<!-- 功能按钮区域 -->
				<div id="button-container" style="display: flex; flex-direction: column; gap: 12px;">
					<!-- 滚动导出按钮 -->
					<button id="capture-chat-scroll-button" style="
						width: 100%;
						padding: 14px;
						background: linear-gradient(135deg, #42A5F5 0%, #1E88E5 100%);
						color: white;
						border: none;
						border-radius: 10px;
						cursor: pointer;
						font-size: 14px;
						font-weight: 600;
						box-shadow: 0 4px 12px rgba(66, 165, 245, 0.3);
						transition: all 0.3s ease;
					">${buttonTextStartScroll}</button>

					<!-- Canvas导出按钮 -->
					<button id="capture-canvas-button" style="
						width: 100%;
						padding: 14px;
						background: linear-gradient(135deg, #66BB6A 0%, #4CAF50 100%);
						color: white;
						border: none;
						border-radius: 10px;
						cursor: pointer;
						font-size: 14px;
						font-weight: 600;
						box-shadow: 0 4px 12px rgba(102, 187, 106, 0.3);
						transition: all 0.3s ease;
					">${buttonTextCanvasExport}</button>

					<!-- 组合导出按钮 -->
					<button id="capture-combined-button" style="
						width: 100%;
						padding: 14px;
						background: linear-gradient(135deg, #9C27B0 0%, #673AB7 100%);
						color: white;
						border: none;
						border-radius: 10px;
						cursor: pointer;
						font-size: 14px;
						font-weight: 600;
						box-shadow: 0 4px 12px rgba(156, 39, 176, 0.3);
						transition: all 0.3s ease;
					">${buttonTextCombinedExport}</button>

					<!-- 停止按钮 -->
					<button id="stop-scrolling-button" style="
						width: 100%;
						padding: 14px;
						background: linear-gradient(135deg, #EF5350 0%, #F44336 100%);
						color: white;
						border: none;
						border-radius: 10px;
						cursor: pointer;
						font-size: 14px;
						font-weight: 600;
						box-shadow: 0 4px 12px rgba(239, 83, 80, 0.3);
						transition: all 0.3s ease;
						display: none;
					">${buttonTextStopScroll}</button>
				</div>

				<!-- 状态信息 -->
				<div id="extract-status-div" style="
					margin-top: 20px;
					padding: 12px;
					background: rgba(255,255,255,0.1);
					border-radius: 8px;
					font-size: 12px;
					line-height: 1.4;
					display: none;
					backdrop-filter: blur(10px);
					border: 1px solid rgba(255,255,255,0.1);
				"></div>

				<!-- 版权信息 -->
				<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; font-size: 11px; opacity: 0.6;">
					v1.0.5 | sxuan © 2025
				</div>
			</div>
		`;

		// 获取元素引用
		captureButtonScroll = document.getElementById('capture-chat-scroll-button');
		captureButtonCanvas = document.getElementById('capture-canvas-button');
		captureButtonCombined = document.getElementById('capture-combined-button');
		stopButtonScroll = document.getElementById('stop-scrolling-button');
		statusDiv = document.getElementById('extract-status-div');
		formatSelector = document.getElementById('format-selector');

		// 初始化格式选择器
		initFormatSelector();

		// 添加事件监听器
		captureButtonScroll.addEventListener('click', handleScrollExtraction);
		captureButtonCanvas.addEventListener('click', handleCanvasExtraction);
		captureButtonCombined.addEventListener('click', handleCombinedExtraction);
		stopButtonScroll.addEventListener('click', () => {
			if (isScrolling) {
				updateStatus('手动停止滚动信号已发送..');
				isScrolling = false;
				stopButtonScroll.disabled = true;
				stopButtonScroll.textContent = '正在停止...';
			}
		});

		// 折叠按钮点击事件
		toggleButton.addEventListener('click', togglePanel);

		// 添加样式
		GM_addStyle(`
			/* 按钮悬停和动画效果 */
			#capture-chat-scroll-button:hover,
			#capture-canvas-button:hover,
			#capture-combined-button:hover,
			#stop-scrolling-button:hover {
				transform: translateY(-3px) scale(1.02);
				box-shadow: 0 8px 25px rgba(0,0,0,0.15) !important;
			}
			
			#capture-chat-scroll-button:active,
			#capture-canvas-button:active,
			#capture-combined-button:active,
			#stop-scrolling-button:active {
				transform: translateY(-1px) scale(0.98);
			}
			
			/* 按钮禁用状态 */
			#capture-chat-scroll-button:disabled,
			#capture-canvas-button:disabled,
			#capture-combined-button:disabled,
			#stop-scrolling-button:disabled {
				opacity: 0.5;
				cursor: not-allowed;
				transform: none !important;
				background: linear-gradient(135deg, #999, #666) !important;
				box-shadow: none !important;
			}
			
			/* 成功/错误状态 */
			.success {
				background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%) !important;
				box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4) !important;
			}
			.error {
				background: linear-gradient(135deg, #F44336 0%, #C62828 100%) !important;
				box-shadow: 0 6px 20px rgba(244, 67, 54, 0.4) !important;
			}
			
			/* 格式选择器动效 */
			.format-option {
				transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
			}
			.format-option:hover {
				background: rgba(255,255,255,0.25) !important;
				transform: translateY(-2px) scale(1.05);
				box-shadow: 0 8px 20px rgba(0,0,0,0.15);
			}
			.format-option.selected {
				background: rgba(255,255,255,0.25) !important;
				border-color: #4CAF50 !important;
				box-shadow: 0 0 20px rgba(76, 175, 80, 0.4), inset 0 1px 3px rgba(255,255,255,0.2);
				transform: scale(1.02);
			}
			.format-option.selected::before {
				content: '✓';
				position: absolute;
				top: 6px;
				right: 8px;
				color: #4CAF50;
				font-weight: bold;
				font-size: 14px;
				background: rgba(255,255,255,0.9);
				border-radius: 50%;
				width: 18px;
				height: 18px;
				display: flex;
				align-items: center;
				justify-content: center;
				box-shadow: 0 2px 6px rgba(0,0,0,0.15);
			}
			
			/* 折叠按钮动效 */
			#gemini-export-toggle {
				transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
			}
			#gemini-export-toggle:hover {
				right: 8px;
				box-shadow: -6px 0 20px rgba(0,0,0,0.35);
				transform: translateY(-50%) scale(1.1);
				background: linear-gradient(135deg, #7986cb 0%, #8e24aa 100%);
			}
			
			/* 面板滚动条美化 */
			#gemini-export-panel::-webkit-scrollbar {
				width: 6px;
			}
			#gemini-export-panel::-webkit-scrollbar-track {
				background: rgba(255,255,255,0.1);
				border-radius: 3px;
			}
			#gemini-export-panel::-webkit-scrollbar-thumb {
				background: rgba(255,255,255,0.3);
				border-radius: 3px;
			}
			#gemini-export-panel::-webkit-scrollbar-thumb:hover {
				background: rgba(255,255,255,0.5);
			}
		`);

		console.log("UI 元素创建完成");
	}

	// 格式选择器初始化
	function initFormatSelector() {
		const options = formatSelector.querySelectorAll('.format-option');
		const currentFormat = window.__GEMINI_EXPORT_FORMAT || 'txt';

		// 设置初始选中状态
		options.forEach(option => {
			if (option.dataset.format === currentFormat) {
				option.classList.add('selected');
			}

			// 添加点击事件
			option.addEventListener('click', () => {
				options.forEach(opt => opt.classList.remove('selected'));
				option.classList.add('selected');
				window.__GEMINI_EXPORT_FORMAT = option.dataset.format;
				updateStatus(`导出格式已切换为: ${option.dataset.format.toUpperCase()}`);

				// 2秒后清除状态信息
				setTimeout(() => {
					if (statusDiv.textContent.includes('导出格式已切换')) {
						updateStatus('');
					}
				}, 2000);
			});
		});
	}

	// 折叠面板切换
	function togglePanel() {
		const isOpen = sidePanel.style.right === '0px';

		if (isOpen) {
			// 关闭面板
			sidePanel.style.right = '-420px';
			toggleButton.innerHTML = '<';
			toggleButton.style.right = '0';
		} else {
			// 打开面板
			sidePanel.style.right = '0px';
			toggleButton.innerHTML = '>';
			toggleButton.style.right = '420px';
		}
	}

	function updateStatus(message) {
		if (statusDiv) {
			statusDiv.textContent = message;
			statusDiv.style.display = message ? 'block' : 'none';
		}
		console.log(`[Status] ${message}`);
	}


	// --- 核心业务逻辑 (滚动导出) ---

	// Canvas 内容提取和导出逻辑
	function extractCanvasContent() {
		console.log("开始提取 Canvas 内容...");
		const canvasData = [];
		const seenContents = new Set(); // 用于去重

		// 提取当前页面显示的代码块
		const codeBlocks = document.querySelectorAll('code-block, pre code, .code-block');
		codeBlocks.forEach((block, index) => {
			const codeContent = block.textContent || block.innerText;
			if (codeContent && codeContent.trim()) {
				const trimmedContent = codeContent.trim();
				// 使用内容的前100个字符作为唯一性检查
				const contentKey = trimmedContent.substring(0, 100);
				if (!seenContents.has(contentKey)) {
					seenContents.add(contentKey);
					canvasData.push({
						type: 'code',
						index: canvasData.length + 1,
						content: trimmedContent,
						language: block.querySelector('[data-lang]')?.getAttribute('data-lang') || 'unknown'
					});
				}
			}
		});

		// 提取响应内容中的文本
		const responseElements = document.querySelectorAll('response-element, .model-response-text, .markdown');
		responseElements.forEach((element, index) => {
			// 跳过代码块，避免重复
			if (!element.closest('code-block') && !element.querySelector('code-block')) {
				const textContent = element.textContent || element.innerText;
				if (textContent && textContent.trim()) {
					const trimmedContent = textContent.trim();
					// 使用内容的前100个字符作为唯一性检查
					const contentKey = trimmedContent.substring(0, 100);
					if (!seenContents.has(contentKey)) {
						seenContents.add(contentKey);
						canvasData.push({
							type: 'text',
							index: canvasData.length + 1,
							content: trimmedContent
						});
					}
				}
			}
		});

		// 如果没有找到特定元素，尝试从整个聊天容器提取
		if (canvasData.length === 0) {
			const chatContainer = document.querySelector('chat-window-content, .conversation-container, model-response');
			if (chatContainer) {
				const allText = chatContainer.textContent || chatContainer.innerText;
				if (allText && allText.trim()) {
					const trimmedContent = allText.trim();
					const contentKey = trimmedContent.substring(0, 100);
					if (!seenContents.has(contentKey)) {
						canvasData.push({
							type: 'full_content',
							index: 1,
							content: trimmedContent
						});
					}
				}
			}
		}

		console.log(`Canvas 内容提取完成，共找到 ${canvasData.length} 个内容块（已去重）`);
		return canvasData;
	}

	function formatCanvasDataForExport(canvasData, context) {
		const mode = (window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase();
		const projectName = getProjectName();
		const ts = getCurrentTimestamp();
		const base = `${projectName}_Canvas_${context}_${ts}`;

		function escapeMd(s) {
			return s.replace(/`/g, '\u0060').replace(/</g, '&lt;');
		}

		if (mode === 'txt') {
			let body = `Gemini Canvas 内容导出\n=========================================\n\n`;
			canvasData.forEach(item => {
				if (item.type === 'code') {
					body += `--- 代码块 ${item.index} (${item.language}) ---\n${item.content}\n\n`;
				} else if (item.type === 'text') {
					body += `--- 文本内容 ${item.index} ---\n${item.content}\n\n`;
				} else {
					body += `--- 完整内容 ---\n${item.content}\n\n`;
				}
				body += "------------------------------\n\n";
			});
			body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
			return { blob: new Blob([body], { type: 'text/plain;charset=utf-8' }), filename: `${base}.txt` };
		}

		if (mode === 'json') {
			const jsonData = {
				exportType: 'canvas',
				timestamp: ts,
				projectName: projectName,
				content: canvasData
			};
			return { blob: new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' }), filename: `${base}.json` };
		}

		if (mode === 'md') {
			let md = `# ${projectName} Canvas 内容导出\n\n`;
			md += `导出时间：${ts}\n\n`;
			canvasData.forEach((item, idx) => {
				md += `## 内容块 ${idx + 1}\n\n`;
				if (item.type === 'code') {
					md += `**代码块** (语言: ${item.language}):\n\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
				} else if (item.type === 'text') {
					md += `**文本内容**:\n\n${escapeMd(item.content)}\n\n`;
				} else {
					md += `**完整内容**:\n\n${escapeMd(item.content)}\n\n`;
				}
				md += `---\n\n`;
			});
			return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
		}
	}

	async function handleCanvasExtraction() {
		console.log("开始 Canvas 导出流程...");
		captureButtonCanvas.disabled = true;
		captureButtonCanvas.textContent = buttonTextCanvasProcessing;

		try {
			updateStatus('正在提取 Canvas 内容...');
			const canvasData = extractCanvasContent();

			if (canvasData.length === 0) {
				alert('未能找到任何 Canvas 内容，请确保页面上有代码块或文档内容。');
				captureButtonCanvas.textContent = `${errorTextCanvas}: 无内容`;
				captureButtonCanvas.classList.add('error');
			} else {
				updateStatus(`正在格式化 ${canvasData.length} 个内容块...`);
				const exportData = formatCanvasDataForExport(canvasData, 'export');

				// 创建下载
				const a = document.createElement('a');
				const url = URL.createObjectURL(exportData.blob);
				a.href = url;
				a.download = exportData.filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);

				captureButtonCanvas.textContent = successTextCanvas;
				captureButtonCanvas.classList.add('success');
				updateStatus(`Canvas 导出成功: ${exportData.filename}`);
			}
		} catch (error) {
			console.error('Canvas 导出过程中发生错误:', error);
			updateStatus(`错误 (Canvas 导出): ${error.message}`);
			alert(`Canvas 导出过程中发生错误: ${error.message}`);
			captureButtonCanvas.textContent = `${errorTextCanvas}: 处理出错`;
			captureButtonCanvas.classList.add('error');
		} finally {
			// 3秒后重置按钮状态
			setTimeout(() => {
				captureButtonCanvas.textContent = buttonTextCanvasExport;
				captureButtonCanvas.disabled = false;
				captureButtonCanvas.classList.remove('success', 'error');
				updateStatus('');
			}, exportTimeout);
		}
	}

	// 组合导出功能：同时导出对话和Canvas内容
	async function handleCombinedExtraction() {
		console.log("开始组合导出流程...");
		captureButtonCombined.disabled = true;
		captureButtonCombined.textContent = buttonTextCombinedProcessing;

		try {
			// 第一步：提取Canvas内容
			updateStatus('步骤 1/3: 提取 Canvas 内容...');
			const canvasData = extractCanvasContent();

			// 第二步：滚动获取对话内容
			updateStatus('步骤 2/3: 开始滚动获取对话内容...');

			// 清空之前的数据
			collectedData.clear();
			isScrolling = true;
			scrollCount = 0;
			noChangeCounter = 0;

			// 显示停止按钮
			stopButtonScroll.style.display = 'block';
			stopButtonScroll.disabled = false;
			stopButtonScroll.textContent = buttonTextStopScroll;

			// 先滚动到顶部
			const scroller = getMainScrollerElement_AiStudio();
			if (scroller) {
				updateStatus('步骤 2/3: 滚动到顶部...');
				const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
				if (isWindowScroller) {
					window.scrollTo({ top: 0, behavior: 'smooth' });
				} else {
					scroller.scrollTo({ top: 0, behavior: 'smooth' });
				}
				await delay(1500);
			}

			// 执行滚动导出
			const scrollSuccess = await autoScrollDown_AiStudio();
			if (scrollSuccess !== false) {
				updateStatus('步骤 2/3: 处理滚动数据...');
				await delay(500);
				extractDataIncremental_AiStudio();
				await delay(200);
			} else {
				throw new Error('滚动获取对话内容失败');
			}

			// 第三步：合并数据并导出
			updateStatus('步骤 3/3: 合并数据并生成文件...');

			// 获取滚动数据
			let scrollData = [];
			if (document.querySelector('#chat-history .conversation-container')) {
				const cs = document.querySelectorAll('#chat-history .conversation-container');
				cs.forEach(c => { if (collectedData.has(c)) scrollData.push(collectedData.get(c)); });
			} else {
				const turns = document.querySelectorAll('ms-chat-turn');
				turns.forEach(t => { if (collectedData.has(t)) scrollData.push(collectedData.get(t)); });
			}

			// 组合数据并导出
			const combinedData = formatCombinedDataForExport(scrollData, canvasData);

			// 创建下载
			const a = document.createElement('a');
			const url = URL.createObjectURL(combinedData.blob);
			a.href = url;
			a.download = combinedData.filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			captureButtonCombined.textContent = successTextCombined;
			captureButtonCombined.classList.add('success');
			updateStatus(`组合导出成功: ${combinedData.filename}`);

		} catch (error) {
			console.error('组合导出过程中发生错误:', error);
			updateStatus(`错误 (组合导出): ${error.message}`);
			alert(`组合导出过程中发生错误: ${error.message}`);
			captureButtonCombined.textContent = `${errorTextCombined}: 处理出错`;
			captureButtonCombined.classList.add('error');
		} finally {
			// 隐藏停止按钮
			stopButtonScroll.style.display = 'none';
			isScrolling = false;

			// 3秒后重置按钮状态
			setTimeout(() => {
				captureButtonCombined.textContent = buttonTextCombinedExport;
				captureButtonCombined.disabled = false;
				captureButtonCombined.classList.remove('success', 'error');
				updateStatus('');
			}, exportTimeout);
		}
	}

	// 组合数据格式化和导出函数
	function formatCombinedDataForExport(scrollData, canvasData) {
		const mode = (window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase();
		const projectName = getProjectName();
		const ts = getCurrentTimestamp();
		const base = `${projectName}_Combined_${ts}`;

		function escapeMd(s) {
			return s.replace(/`/g, '\u0060').replace(/</g, '&lt;');
		}

		// 对对话数据进行去重处理
		function deduplicateScrollData(data) {
			if (!data || !Array.isArray(data)) return [];

			const seen = new Set();
			const deduplicated = [];

			data.forEach(item => {
				// 创建内容的唯一标识符
				const contentKey = [
					item.userText || '',
					item.thoughtText || '',
					item.responseText || ''
				].join('|||').substring(0, 200); // 使用前200个字符作为唯一性标识

				if (!seen.has(contentKey)) {
					seen.add(contentKey);
					deduplicated.push(item);
				}
			});

			return deduplicated;
		}

		// 去重处理
		const deduplicatedScrollData = deduplicateScrollData(scrollData);

		if (mode === 'txt') {
			let body = `Gemini 组合导出 (对话 + Canvas)
=========================================

`;

			// 添加对话内容
			if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
				body += `=== 对话内容 ===

`;
				deduplicatedScrollData.forEach(item => {
					let block = '';
					if (item.userText) block += `--- 用户 ---\n${item.userText}\n\n`;
					if (item.thoughtText) block += `--- AI 思维链 ---\n${item.thoughtText}\n\n`;
					if (item.responseText) block += `--- AI 回答 ---\n${item.responseText}\n\n`;
					body += block.trim() + "\n\n------------------------------\n\n";
				});
			}

			// 添加Canvas内容
			if (canvasData && canvasData.length > 0) {
				body += `\n\n=== Canvas 内容 ===\n\n`;
				canvasData.forEach(item => {
					if (item.type === 'code') {
						body += `--- 代码块 ${item.index} (${item.language}) ---\n${item.content}\n\n`;
					} else if (item.type === 'text') {
						body += `--- 文本内容 ${item.index} ---\n${item.content}\n\n`;
					} else {
						body += `--- 完整内容 ---\n${item.content}\n\n`;
					}
					body += "------------------------------\n\n";
				});
			}

			body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
			return { blob: new Blob([body], { type: 'text/plain;charset=utf-8' }), filename: `${base}.txt` };
		}

		if (mode === 'json') {
			const jsonData = {
				exportType: 'combined',
				timestamp: ts,
				projectName: projectName,
				dialogue: [],
				canvas: canvasData || []
			};

			// 添加对话数据
			if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
				deduplicatedScrollData.forEach(item => {
					if (item.userText) jsonData.dialogue.push({ role: 'user', content: item.userText, id: `${item.domOrder}-user` });
					if (item.thoughtText) jsonData.dialogue.push({ role: 'thought', content: item.thoughtText, id: `${item.domOrder}-thought` });
					if (item.responseText) jsonData.dialogue.push({ role: 'assistant', content: item.responseText, id: `${item.domOrder}-assistant` });
				});
			}

			return { blob: new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' }), filename: `${base}.json` };
		}

		if (mode === 'md') {
			let md = `# ${projectName} 组合导出

导出时间：${ts}

`;

			// 添加对话内容
			if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
				md += `## 💬 对话内容

`;
				deduplicatedScrollData.forEach((item, idx) => {
					md += `### 回合 ${idx + 1}

`;
					if (item.userText) md += `**用户**:

${escapeMd(item.userText)}

`;
					if (item.thoughtText) md += `<details><summary>AI 思维链</summary>

${escapeMd(item.thoughtText)}

</details>

`;
					if (item.responseText) md += `**AI 回答**:

${escapeMd(item.responseText)}

`;
					md += `---

`;
				});
			}

			// 添加Canvas内容
			if (canvasData && canvasData.length > 0) {
				md += `## 🎨 Canvas 内容

`;
				canvasData.forEach((item, idx) => {
					md += `### 内容块 ${idx + 1}

`;
					if (item.type === 'code') {
						md += `**代码块** (语言: ${item.language}):

\`\`\`${item.language}
${item.content}
\`\`\`

`;
					} else if (item.type === 'text') {
						md += `**文本内容**:

${escapeMd(item.content)}

`;
					} else {
						md += `**完整内容**:

${escapeMd(item.content)}

`;
					}
					md += `---

`;
				});
			}

			return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
		}
	}
	function extractDataIncremental_AiStudio() {
		let newlyFoundCount = 0;
		let dataUpdatedInExistingTurn = false;
		const currentTurns = document.querySelectorAll('ms-chat-turn');
		const seenUserTexts = new Set(); // 用于去重用户消息

		currentTurns.forEach((turn, index) => {
			const turnKey = turn;
			const turnContainer = turn.querySelector('.chat-turn-container.user, .chat-turn-container.model');
			if (!turnContainer) {
				return;
			}

			let isNewTurn = !collectedData.has(turnKey);
			let extractedInfo = collectedData.get(turnKey) || {
				domOrder: index, type: 'unknown', userText: null, thoughtText: null, responseText: null
			};
			if (isNewTurn) {
				collectedData.set(turnKey, extractedInfo);
				newlyFoundCount++;
			}

			let dataWasUpdatedThisTime = false;

			if (turnContainer.classList.contains('user')) {
				if (extractedInfo.type === 'unknown') extractedInfo.type = 'user';
				if (!extractedInfo.userText) {
					let userNode = turn.querySelector('.turn-content ms-cmark-node');
					let userText = userNode ? userNode.innerText.trim() : null;
					if (userText) {
						// 检查是否已经存在相同的用户消息
						if (!seenUserTexts.has(userText)) {
							seenUserTexts.add(userText);
							extractedInfo.userText = userText;
							dataWasUpdatedThisTime = true;
						}
					}
				}
			} else if (turnContainer.classList.contains('model')) {
				if (extractedInfo.type === 'unknown') extractedInfo.type = 'model';

				if (!extractedInfo.thoughtText) {
					let thoughtNode = turn.querySelector('.thought-container .mat-expansion-panel-body');
					if (thoughtNode) {
						let thoughtText = thoughtNode.textContent.trim();
						if (thoughtText && thoughtText.toLowerCase() !== 'thinking process:') {
							extractedInfo.thoughtText = thoughtText;
							dataWasUpdatedThisTime = true;
						}
					}
				}

				if (!extractedInfo.responseText) {
					const responseChunks = Array.from(turn.querySelectorAll('.turn-content > ms-prompt-chunk'));
					const responseTexts = responseChunks
						.filter(chunk => !chunk.querySelector('.thought-container'))
						.map(chunk => {
							const cmarkNode = chunk.querySelector('ms-cmark-node');
							return cmarkNode ? cmarkNode.innerText.trim() : chunk.innerText.trim();
						})
						.filter(text => text);

					if (responseTexts.length > 0) {
						extractedInfo.responseText = responseTexts.join('\n\n');
						dataWasUpdatedThisTime = true;
					} else if (!extractedInfo.thoughtText) {
						const turnContent = turn.querySelector('.turn-content');
						if (turnContent) {
							extractedInfo.responseText = turnContent.innerText.trim();
							dataWasUpdatedThisTime = true;
						}
					}
				}

				if (dataWasUpdatedThisTime) {
					if (extractedInfo.thoughtText && extractedInfo.responseText) extractedInfo.type = 'model_thought_reply';
					else if (extractedInfo.responseText) extractedInfo.type = 'model_reply';
					else if (extractedInfo.thoughtText) extractedInfo.type = 'model_thought';
				}
			}

			if (dataWasUpdatedThisTime) {
				collectedData.set(turnKey, extractedInfo);
				dataUpdatedInExistingTurn = true;
			}
		});

		if (currentTurns.length > 0 && collectedData.size === 0) {
			console.warn("警告(滚动导出): 页面上存在聊天回合(ms-chat-turn)，但未能提取任何数据。CSS选择器可能已完全失效，请按F12检查并更新 extractDataIncremental_Gemini 函数中的选择器。");
			updateStatus(`警告: 无法从聊天记录中提取数据，请检查脚本！`);
		} else {
			updateStatus(`滚动 ${scrollCount}/${MAX_SCROLL_ATTEMPTS}... 已收集 ${collectedData.size} 条记录。`);
		}

		return newlyFoundCount > 0 || dataUpdatedInExistingTurn;
	}

	async function autoScrollDown_AiStudio() {
		console.log("启动自动滚动 (滚动导出)...");
		isScrolling = true; collectedData.clear(); scrollCount = 0; noChangeCounter = 0;
		const scroller = getMainScrollerElement_AiStudio();
		if (!scroller) {
			updateStatus('错误 (滚动): 找不到滚动区域');
			alert('未能找到聊天记录的滚动区域，无法自动滚动。请检查脚本中的选择器。');
			isScrolling = false; return false;
		}
		console.log('使用的滚动元素(滚动导出):', scroller);
		const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
		const getScrollTop = () => isWindowScroller ? window.scrollY : scroller.scrollTop;
		const getScrollHeight = () => isWindowScroller ? document.documentElement.scrollHeight : scroller.scrollHeight;
		const getClientHeight = () => isWindowScroller ? window.innerHeight : scroller.clientHeight;
		updateStatus(`开始增量滚动(最多 ${MAX_SCROLL_ATTEMPTS} 次)...`);
		let lastScrollHeight = -1;

		while (scrollCount < MAX_SCROLL_ATTEMPTS && isScrolling) {
			const currentScrollTop = getScrollTop(); const currentScrollHeight = getScrollHeight(); const currentClientHeight = getClientHeight();
			if (currentScrollHeight === lastScrollHeight) { noChangeCounter++; } else { noChangeCounter = 0; }
			lastScrollHeight = currentScrollHeight;
			if (noChangeCounter >= SCROLL_STABILITY_CHECKS && currentScrollTop + currentClientHeight >= currentScrollHeight - 20) {
				console.log("滚动条疑似触底(滚动导出)，停止滚动。");
				updateStatus(`滚动完成 (疑似触底)。`);
				break;
			}
			if (currentScrollTop === 0 && scrollCount > 10) {
				console.log("滚动条返回顶部(滚动导出)，停止滚动。");
				updateStatus(`滚动完成 (返回顶部)。`);
				break;
			}
			const targetScrollTop = currentScrollTop + (currentClientHeight * SCROLL_INCREMENT_FACTOR);
			if (isWindowScroller) { window.scrollTo({ top: targetScrollTop, behavior: 'smooth' }); } else { scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' }); }
			scrollCount++;
			updateStatus(`滚动 ${scrollCount}/${MAX_SCROLL_ATTEMPTS}... 等待 ${SCROLL_DELAY_MS}ms... (已收集 ${collectedData.size} 条记录。)`);
			await delay(SCROLL_DELAY_MS);
			// 使用统一调度：优先 Gemini 结构，其次 AI Studio
			try { extractDataIncremental_Dispatch(); } catch (e) { console.warn('调度提取失败，回退 AI Studio 提取', e); try { extractDataIncremental_AiStudio(); } catch (_) { } }
			if (!isScrolling) {
				console.log("检测到手动停止信号 (滚动导出)，退出滚动循环。"); break;
			}
		}

		if (!isScrolling && scrollCount < MAX_SCROLL_ATTEMPTS) {
			updateStatus(`滚动已手动停止 (已滚动 ${scrollCount} 次)。`);
		} else if (scrollCount >= MAX_SCROLL_ATTEMPTS) {
			updateStatus(`滚动停止: 已达到最大尝试次数 (${MAX_SCROLL_ATTEMPTS})。`);
		}
		isScrolling = false;
		return true;
	}

	function formatAndExport(sortedData, context) { // 多格式骨架
		const mode = (window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase();
		const projectName = getProjectName();
		const ts = getCurrentTimestamp();
		const base = `${projectName}_${context}_${ts}`;

		// 对数据进行去重处理
		function deduplicateData(data) {
			if (!data || !Array.isArray(data)) return [];

			const seen = new Set();
			const deduplicated = [];

			data.forEach(item => {
				// 创建内容的唯一标识符
				const contentKey = [
					item.userText || '',
					item.thoughtText || '',
					item.responseText || ''
				].join('|||').substring(0, 200); // 使用前200个字符作为唯一性标识

				if (!seen.has(contentKey)) {
					seen.add(contentKey);
					deduplicated.push(item);
				}
			});

			return deduplicated;
		}

		// 去重处理
		const deduplicatedData = deduplicateData(sortedData);

		function escapeMd(s) {
			return s.replace(/`/g, '\u0060').replace(/</g, '&lt;'); // 简单避免破坏结构；代码块原样保存
		}
		if (mode === 'txt') {
			let header = context === 'scroll' ? 'Gemini 聊天记录 (滚动采集)' : 'Gemini 对话记录 (SDK 代码)';
			let body = `${header}\n=========================================\n\n`;
			deduplicatedData.forEach(item => {
				let block = '';
				if (item.userText) block += `--- 用户 ---\n${item.userText}\n\n`;
				if (item.thoughtText) block += `--- AI 思维链 ---\n${item.thoughtText}\n\n`;
				if (item.responseText) block += `--- AI 回答 ---\n${item.responseText}\n\n`;
				if (!block) {
					block = '--- 回合 (内容提取不完整或失败) ---\n';
					if (item.thoughtText) block += `思维链(可能不全): ${item.thoughtText}\n`;
					if (item.responseText) block += `回答(可能不全): ${item.responseText}\n`;
					block += '\n';
				}
				body += block.trim() + "\n\n------------------------------\n\n";
			});
			body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
			return { blob: new Blob([body], { type: 'text/plain;charset=utf-8' }), filename: `${base}.txt` };
		}
		if (mode === 'json') {
			let arr = [];
			deduplicatedData.forEach(item => {
				if (item.userText) arr.push({ role: 'user', content: item.userText, id: `${item.domOrder}-user` });
				if (item.thoughtText) arr.push({ role: 'thought', content: item.thoughtText, id: `${item.domOrder}-thought` });
				if (item.responseText) arr.push({ role: 'assistant', content: item.responseText, id: `${item.domOrder}-assistant` });
			});
			return { blob: new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json;charset=utf-8' }), filename: `${base}.json` };
		}
		if (mode === 'md') { // 正式 Markdown 格式
			let md = `# ${projectName} 对话导出 (${context})\n\n`;
			md += `导出时间：${ts}\n\n`;
			deduplicatedData.forEach((item, idx) => {
				md += `## 回合 ${idx + 1}\n\n`;
				if (item.userText) md += `**用户**:\n\n${escapeMd(item.userText)}\n\n`;
				if (item.thoughtText) md += `<details><summary>AI 思维链</summary>\n\n${escapeMd(item.thoughtText)}\n\n</details>\n\n`;
				if (item.responseText) md += `**AI 回答**:\n\n${escapeMd(item.responseText)}\n\n`;
				md += `---\n\n`;
			});
			return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
		}
	}
	function formatAndTriggerDownloadScroll() { // 统一调度 Gemini/AI Studio
		updateStatus(`处理 ${collectedData.size} 条滚动记录并生成文件...`);
		let sorted = [];
		if (document.querySelector('#chat-history .conversation-container')) {
			const cs = document.querySelectorAll('#chat-history .conversation-container');
			cs.forEach(c => { if (collectedData.has(c)) sorted.push(collectedData.get(c)); });
		} else {
			const turns = document.querySelectorAll('ms-chat-turn');
			turns.forEach(t => { if (collectedData.has(t)) sorted.push(collectedData.get(t)); });
		}
		if (!sorted.length) {
			updateStatus('没有收集到任何有效滚动记录。'); // FIX 2025-09-08: 修复标点
			alert('滚动结束后未能收集到任何聊天记录，无法导出。'); // FIX 2025-09-08: 补全字符串闭合
			captureButtonScroll.textContent = buttonTextStartScroll; captureButtonScroll.disabled = false; captureButtonScroll.classList.remove('success', 'error'); updateStatus('');
			return;
		}
		try {
			const pack = formatAndExport(sorted, 'scroll');
			const a = document.createElement('a');
			const url = URL.createObjectURL(pack.blob);
			a.href = url; a.download = pack.filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
			captureButtonScroll.textContent = successTextScroll; captureButtonScroll.classList.add('success');
		} catch (e) {
			console.error('滚动导出文件失败:', e);
			captureButtonScroll.textContent = `${errorTextScroll}: 创建失败`; captureButtonScroll.classList.add('error'); alert('创建滚动下载文件时出错: ' + e.message);
		}
		setTimeout(() => { captureButtonScroll.textContent = buttonTextStartScroll; captureButtonScroll.disabled = false; captureButtonScroll.classList.remove('success', 'error'); updateStatus(''); }, exportTimeout);
	}

	// TODO 2025-09-08: 后续可实现自动展开 Gemini 隐藏思维链（需要模拟点击“显示思路”按钮），当前以占位符标记�?
	// TODO 2025-09-08: Markdown 正式格式化尚未实现，当前仅输出占位头部，保持向后兼容�?

	async function handleScrollExtraction() {
		if (isScrolling) return;
		captureButtonScroll.disabled = true;
		captureButtonScroll.textContent = '滚动中..';
		stopButtonScroll.style.display = 'block';
		stopButtonScroll.disabled = false;
		stopButtonScroll.textContent = buttonTextStopScroll;

		// 在开始前先滚动到页面顶部
		const scroller = getMainScrollerElement_AiStudio();
		if (scroller) {
			updateStatus('正在滚动到顶部..');
			const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
			if (isWindowScroller) {
				window.scrollTo({ top: 0, behavior: 'smooth' });
			} else {
				scroller.scrollTo({ top: 0, behavior: 'smooth' });
			}
			await delay(1500); // 等待滚动动画完成
		}

		updateStatus('初始化滚动(滚动导出)...');

		try {
			const scrollSuccess = await autoScrollDown_AiStudio();
			if (scrollSuccess !== false) {
				captureButtonScroll.textContent = buttonTextProcessingScroll;
				updateStatus('滚动结束，准备最终处理..');
				await delay(500);
				extractDataIncremental_AiStudio();
				await delay(200);
				formatAndTriggerDownloadScroll();
			} else {
				captureButtonScroll.textContent = `${errorTextScroll}: 滚动失败`;
				captureButtonScroll.classList.add('error');
				setTimeout(() => {
					captureButtonScroll.textContent = buttonTextStartScroll;
					captureButtonScroll.disabled = false;
					captureButtonScroll.classList.remove('error');
					updateStatus('');
				}, exportTimeout);
			}
		} catch (error) {
			console.error('滚动处理过程中发生错误', error);
			updateStatus(`错误 (滚动导出): ${error.message}`);
			alert(`滚动处理过程中发生错误: ${error.message}`);
			captureButtonScroll.textContent = `${errorTextScroll}: 处理出错`;
			captureButtonScroll.classList.add('error');
			setTimeout(() => {
				captureButtonScroll.textContent = buttonTextStartScroll;
				captureButtonScroll.disabled = false;
				captureButtonScroll.classList.remove('error');
				updateStatus('');
			}, exportTimeout);
			isScrolling = false;
		} finally {
			stopButtonScroll.style.display = 'none';
			isScrolling = false;
		}
	}

	// --- 脚本初始化入口 ---
	console.log("Gemini_Chat_Export 导出脚本 (v1.0.5): 等待页面加载 (2.5秒)...");
	setTimeout(createUI, 2500);

})();
