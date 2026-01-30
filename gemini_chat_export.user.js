// ==UserScript==
// @name         Gemini 聊天对话增强脚本
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  一键导出 Google Gemini 的网页端对话聊天记录为 JSON / TXT / Markdown 文件，支持对话内目录导航。
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
	__GEMINI_EXPORT_FORMAT = 'txt' | 'json' | 'md'
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
	// 对话目录面板：独立于折叠侧栏，避免随侧栏一起隐藏
	let conversationDirectoryPanel = null;
	let conversationDirectoryContainer = null;
	let conversationDirectoryObserver = null;
	let conversationDirectoryUpdateTimer = null;
	let conversationDirectoryAnchorSeq = 0;
	let conversationDirectoryLastSignature = '';
	// 目录面板状态：折叠、拖拽
	let directoryCollapsed = false;
	let directoryDragState = { isDragging: false, startX: 0, startY: 0, startTop: 0, startRight: 0 };
	const DIRECTORY_POS_KEY = 'gemini_export_directory_position';
	const DIRECTORY_COLLAPSED_KEY = 'gemini_export_directory_collapsed';
	// 主题同步：跟随 Gemini 页面深浅色主题
	let themeObserver = null;
	let themeUpdateTimer = null;
	let currentThemeMode = null;

	// --- 辅助工具函数 ---
	function delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function parseRgbColor(colorString) {
		if (!colorString) return null;
		const m = colorString.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
		if (!m) return null;
		return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
	}

	function getPageBackgroundColor() {
		try {
			const bodyBg = window.getComputedStyle(document.body).backgroundColor;
			if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') return bodyBg;
		} catch (_) { }
		try {
			return window.getComputedStyle(document.documentElement).backgroundColor;
		} catch (_) { }
		return '';
	}

	function detectPageThemeMode() {
		try {
			const scheme = window.getComputedStyle(document.documentElement).colorScheme;
			if (scheme && scheme.includes('dark')) return 'dark';
			if (scheme && scheme.includes('light')) return 'light';
		} catch (_) { }

		const rgb = parseRgbColor(getPageBackgroundColor());
		if (rgb) {
			const luminance = (0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b);
			return luminance < 128 ? 'dark' : 'light';
		}

		try {
			return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		} catch (_) { }
		return 'dark';
	}

	function applyThemeVariables(mode) {
		const darkVars = {
			'--ge-panel-bg': '#111827',
			'--ge-panel-text': '#F9FAFB',
			'--ge-text-muted': '#D1D5DB',
			'--ge-text-muted-2': '#9CA3AF',
			'--ge-border': '#374151',
			'--ge-border-hover': '#6B7280',
			'--ge-surface': '#1F2937',
			'--ge-surface-2': '#111827',
			'--ge-surface-hover': '#1F2937',
			'--ge-divider': '#1F2937',
			'--ge-primary': '#1E40AF',
			'--ge-primary-hover': '#1D4ED8',
			'--ge-primary-border': '#1D4ED8',
			'--ge-on-primary': '#F9FAFB',
			'--ge-success': '#059669',
			'--ge-success-border': '#047857',
			'--ge-danger': '#DC2626',
			'--ge-danger-border': '#B91C1C',
			'--ge-neutral': '#374151',
			'--ge-neutral-border': '#4B5563',
			'--ge-scroll-thumb': '#374151',
			'--ge-scroll-thumb-hover': '#4B5563'
		};
		const lightVars = {
			'--ge-panel-bg': '#F9FAFB',
			'--ge-panel-text': '#111827',
			'--ge-text-muted': '#374151',
			'--ge-text-muted-2': '#6B7280',
			'--ge-border': '#E5E7EB',
			'--ge-border-hover': '#9CA3AF',
			'--ge-surface': '#FFFFFF',
			'--ge-surface-2': '#F3F4F6',
			'--ge-surface-hover': '#F3F4F6',
			'--ge-divider': '#E5E7EB',
			'--ge-primary': '#1E40AF',
			'--ge-primary-hover': '#1D4ED8',
			'--ge-primary-border': '#1D4ED8',
			'--ge-on-primary': '#F9FAFB',
			'--ge-success': '#059669',
			'--ge-success-border': '#047857',
			'--ge-danger': '#DC2626',
			'--ge-danger-border': '#B91C1C',
			'--ge-neutral': '#374151',
			'--ge-neutral-border': '#4B5563',
			'--ge-scroll-thumb': '#D1D5DB',
			'--ge-scroll-thumb-hover': '#9CA3AF'
		};

		const vars = mode === 'light' ? lightVars : darkVars;
		Object.entries(vars).forEach(([key, value]) => {
			document.documentElement.style.setProperty(key, value);
		});
		currentThemeMode = mode;
	}

	function refreshThemeIfNeeded() {
		const nextMode = detectPageThemeMode();
		if (nextMode === currentThemeMode) return;
		applyThemeVariables(nextMode);
	}

	function scheduleThemeRefresh(delayMs = 120) {
		if (themeUpdateTimer) window.clearTimeout(themeUpdateTimer);
		themeUpdateTimer = window.setTimeout(() => {
			themeUpdateTimer = null;
			refreshThemeIfNeeded();
		}, delayMs);
	}

	function startThemeSync() {
		applyThemeVariables(detectPageThemeMode());

		if (themeObserver) themeObserver.disconnect();
		themeObserver = new MutationObserver(() => scheduleThemeRefresh(120));
		try {
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'color-scheme']
			});
		} catch (_) { }
		try {
			themeObserver.observe(document.body, {
				attributes: true,
				attributeFilter: ['class', 'style']
			});
		} catch (_) { }

		try {
			const media = window.matchMedia('(prefers-color-scheme: dark)');
			if (media && media.addEventListener) media.addEventListener('change', () => scheduleThemeRefresh(120));
			else if (media && media.addListener) media.addListener(() => scheduleThemeRefresh(120));
		} catch (_) { }
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
		scheduleConversationDirectoryUpdate(0);
		return newly > 0 || updated;
	}

	function extractDataIncremental_Dispatch() {
		if (document.querySelector('#chat-history .conversation-container')) return extractDataIncremental_Gemini();
		return extractDataIncremental_AiStudio();
	}

	function scheduleConversationDirectoryUpdate(delayMs = 200) {
		if (!conversationDirectoryContainer) return;
		if (conversationDirectoryUpdateTimer) window.clearTimeout(conversationDirectoryUpdateTimer);
		conversationDirectoryUpdateTimer = window.setTimeout(() => {
			conversationDirectoryUpdateTimer = null;
			updateConversationDirectory();
		}, delayMs);
	}

	function ensureConversationAnchor(element) {
		if (!element) return null;
		const existing = element.dataset.geminiExportAnchorId;
		if (existing) return existing;
		if (element.id) {
			element.dataset.geminiExportAnchorId = element.id;
			return element.id;
		}
		conversationDirectoryAnchorSeq += 1;
		const id = `gemini-export-anchor-${conversationDirectoryAnchorSeq}`;
		element.id = id;
		element.dataset.geminiExportAnchorId = id;
		return id;
	}

	function collectUserPromptsForDirectory() {
		const results = [];
		const geminiContainers = document.querySelectorAll('#chat-history .conversation-container');
		if (geminiContainers && geminiContainers.length) {
			const seenTexts = new Set();
			geminiContainers.forEach((c) => {
				// 优先尝试获取最具体的文本元素，避免重复
				let userText = '';
				const queryTextLine = c.querySelector('user-query .query-text-line');
				const queryTextP = c.querySelector('user-query .query-text p');
				const queryText = c.querySelector('user-query .query-text');

				if (queryTextLine) {
					userText = (queryTextLine.innerText || '').trim();
				} else if (queryTextP) {
					userText = (queryTextP.innerText || '').trim();
				} else if (queryText) {
					userText = (queryText.innerText || '').trim();
				}

				if (!userText) return;
				// 去重：避免相同文本多次出现
				if (seenTexts.has(userText)) return;
				seenTexts.add(userText);

				const anchorId = ensureConversationAnchor(c);
				if (!anchorId) return;
				results.push({ anchorId, text: userText });
			});
			return results;
		}

		const turns = document.querySelectorAll('ms-chat-turn');
		if (turns && turns.length) {
			turns.forEach((turn) => {
				const userContainer = turn.querySelector('.chat-turn-container.user');
				if (!userContainer) return;
				const userNode = turn.querySelector('.turn-content ms-cmark-node');
				const text = (userNode ? userNode.innerText : turn.innerText) || '';
				const cleaned = text.trim().replace(/\s+/g, ' ');
				if (!cleaned) return;
				const anchorId = ensureConversationAnchor(turn);
				if (!anchorId) return;
				results.push({ anchorId, text: cleaned });
			});
		}
		return results;
	}

	function renderConversationDirectoryItems(items) {
		conversationDirectoryContainer.innerHTML = '';
		if (!items.length) {
			const empty = document.createElement('div');
			empty.textContent = '未检测到用户提问';
			empty.style.cssText = 'padding: 10px; color: var(--ge-text-muted-2); font-size: 12px;';
			conversationDirectoryContainer.appendChild(empty);
			return;
		}

		items.forEach((item, idx) => {
			const row = document.createElement('div');
			row.className = 'gemini-conversation-directory-item';
			row.dataset.anchorId = item.anchorId;
			const preview = item.text.replace(/\s+/g, ' ').trim();
			const shortText = preview.length > 60 ? `${preview.slice(0, 60)}...` : preview;
			row.textContent = `${idx + 1}. ${shortText}`;
			conversationDirectoryContainer.appendChild(row);
		});
	}

	function updateConversationDirectory() {
		if (!conversationDirectoryContainer) return;
		const items = collectUserPromptsForDirectory();
		// 目录签名：包含文本片段，确保同一锚点内容补全时也能刷新
		const signature = items.map(i => `${i.anchorId}:${i.text.slice(0, 80)}`).join('|');
		if (signature === conversationDirectoryLastSignature) return;
		conversationDirectoryLastSignature = signature;
		renderConversationDirectoryItems(items);
	}

	function startConversationDirectoryObserver() {
		if (conversationDirectoryObserver) conversationDirectoryObserver.disconnect();
		const root = document.querySelector('#chat-history') || document.body;
		conversationDirectoryObserver = new MutationObserver(() => {
			scheduleConversationDirectoryUpdate(150);
		});
		conversationDirectoryObserver.observe(root, { childList: true, subtree: true });
	}

	// 目录面板位置持久化
	function loadDirectoryPosition() {
		try {
			const saved = localStorage.getItem(DIRECTORY_POS_KEY);
			if (saved) return JSON.parse(saved);
		} catch (_) { }
		return null;
	}

	function saveDirectoryPosition(top, right) {
		try {
			localStorage.setItem(DIRECTORY_POS_KEY, JSON.stringify({ top, right }));
		} catch (_) { }
	}

	function loadDirectoryCollapsed() {
		try {
			return localStorage.getItem(DIRECTORY_COLLAPSED_KEY) === 'true';
		} catch (_) { }
		return false;
	}

	function saveDirectoryCollapsed(collapsed) {
		try {
			localStorage.setItem(DIRECTORY_COLLAPSED_KEY, collapsed ? 'true' : 'false');
		} catch (_) { }
	}

	// 目录面板折叠切换
	function toggleDirectoryCollapse() {
		if (!conversationDirectoryPanel || !conversationDirectoryContainer) return;
		directoryCollapsed = !directoryCollapsed;
		conversationDirectoryContainer.style.display = directoryCollapsed ? 'none' : 'block';
		const toggleBtn = conversationDirectoryPanel.querySelector('.directory-toggle-btn');
		if (toggleBtn) toggleBtn.textContent = directoryCollapsed ? '+' : '-';
		saveDirectoryCollapsed(directoryCollapsed);
	}

	// 目录面板拖拽
	function initDirectoryDrag() {
		if (!conversationDirectoryPanel) return;
		const header = conversationDirectoryPanel.querySelector('.directory-header');
		if (!header) return;

		header.style.cursor = 'move';

		header.addEventListener('mousedown', (e) => {
			// 点击折叠按钮时不启动拖拽
			if (e.target.classList.contains('directory-toggle-btn')) return;
			e.preventDefault();
			const rect = conversationDirectoryPanel.getBoundingClientRect();
			directoryDragState = {
				isDragging: true,
				startX: e.clientX,
				startY: e.clientY,
				startTop: rect.top,
				startRight: window.innerWidth - rect.right
			};
			conversationDirectoryPanel.style.transition = 'none';
		});

		document.addEventListener('mousemove', (e) => {
			if (!directoryDragState.isDragging) return;
			const deltaX = e.clientX - directoryDragState.startX;
			const deltaY = e.clientY - directoryDragState.startY;
			let newTop = directoryDragState.startTop + deltaY;
			let newRight = directoryDragState.startRight - deltaX;
			// 边界限制
			newTop = Math.max(10, Math.min(window.innerHeight - 100, newTop));
			newRight = Math.max(10, Math.min(window.innerWidth - 100, newRight));
			conversationDirectoryPanel.style.top = newTop + 'px';
			conversationDirectoryPanel.style.right = newRight + 'px';
		});

		document.addEventListener('mouseup', () => {
			if (!directoryDragState.isDragging) return;
			directoryDragState.isDragging = false;
			conversationDirectoryPanel.style.transition = '';
			// 保存位置
			const top = parseInt(conversationDirectoryPanel.style.top, 10);
			const right = parseInt(conversationDirectoryPanel.style.right, 10);
			saveDirectoryPosition(top, right);
		});
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
			background: var(--ge-primary);
			color: var(--ge-on-primary);
			border: none;
			border-radius: 20px 0 0 20px;
			cursor: pointer;
			z-index: 10001;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 18px;
			font-weight: bold;
			box-shadow: none;
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
			background: var(--ge-panel-bg);
			z-index: 10000;
			transition: right 0.3s ease;
			box-shadow: none;
			overflow-y: auto;
		`;
		document.body.appendChild(sidePanel);

		// 创建对话目录面板（独立于折叠侧栏，支持折叠和拖拽）
		conversationDirectoryPanel = document.createElement('div');
		conversationDirectoryPanel.id = 'gemini-conversation-directory-panel';
		// 加载保存的位置
		const savedPos = loadDirectoryPosition();
		const initTop = savedPos?.top ?? 90;
		const initRight = savedPos?.right ?? 44;
		conversationDirectoryPanel.style.cssText = `
			position: fixed;
			top: ${initTop}px;
			right: ${initRight}px;
			width: 280px;
			max-height: 400px;
			background: var(--ge-panel-bg);
			border: 1px solid var(--ge-border);
			border-radius: 10px;
			z-index: 9999;
			overflow: hidden;
			font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
			transition: right 0.3s ease;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		`;
		// 加载折叠状态
		directoryCollapsed = loadDirectoryCollapsed();
		conversationDirectoryPanel.innerHTML = `
			<div class="directory-header" style="padding: 10px 12px; border-bottom: 1px solid var(--ge-border); color: var(--ge-panel-text); font-size: 13px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; user-select: none;">
				<span>对话目录</span>
				<button class="directory-toggle-btn" style="width: 24px; height: 24px; border: none; background: var(--ge-surface); color: var(--ge-panel-text); border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; line-height: 1;">${directoryCollapsed ? '+' : '-'}</button>
			</div>
			<div id="conversation-directory" style="max-height: 340px; overflow: auto; display: ${directoryCollapsed ? 'none' : 'block'};"></div>
		`;
		document.body.appendChild(conversationDirectoryPanel);

		// 绑定折叠按钮事件
		const toggleBtn = conversationDirectoryPanel.querySelector('.directory-toggle-btn');
		if (toggleBtn) {
			toggleBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				toggleDirectoryCollapse();
			});
		}

		// 面板内容
		sidePanel.innerHTML = `
			<div style="padding: 20px; color: var(--ge-panel-text); font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">
				<div style="display: flex; align-items: center; margin-bottom: 16px;">
					<div style="width: 4px; height: 18px; background: var(--ge-success); margin-right: 10px; border-radius: 2px;"></div>
					<h2 style="margin: 0; font-size: 16px; font-weight: 600;">Gemini 导出助手</h2>
				</div>
				<p style="margin: 0 0 16px 0; font-size: 12px; color: var(--ge-text-muted); line-height: 1.5;">一键导出聊天记录与 Canvas 内容</p>

				<div style="background: var(--ge-surface); border: 1px solid var(--ge-border); border-radius: 10px; padding: 12px; margin-bottom: 16px;">
					<h3 style="margin: 0 0 8px 0; font-size: 13px; color: var(--ge-panel-text);">使用提示</h3>
					<div style="font-size: 12px; color: var(--ge-text-muted); line-height: 1.6;">
						<div style="margin-bottom: 6px;">导出前建议先滚动到对话顶部，避免缺失</div>
						<div>如页面结构更新导致无法识别，请更新选择器</div>
					</div>
				</div>

				<div style="margin-bottom: 16px;">
					<h3 style="margin: 0 0 10px 0; font-size: 13px; color: var(--ge-panel-text);">导出格式</h3>
					<div id="format-selector" style="display: flex; gap: 8px;">
						<div class="format-option" data-format="txt" style="flex: 1; padding: 10px; background: var(--ge-surface); border-radius: 8px; text-align: center; cursor: pointer; font-size: 12px; border: 1px solid var(--ge-border); position: relative;">
							<div style="font-weight: 600; margin-bottom: 2px;">TXT</div>
							<div style="color: var(--ge-text-muted-2); font-size: 10px;">纯文本</div>
						</div>
						<div class="format-option" data-format="json" style="flex: 1; padding: 10px; background: var(--ge-surface); border-radius: 8px; text-align: center; cursor: pointer; font-size: 12px; border: 1px solid var(--ge-border); position: relative;">
							<div style="font-weight: 600; margin-bottom: 2px;">JSON</div>
							<div style="color: var(--ge-text-muted-2); font-size: 10px;">结构化</div>
						</div>
						<div class="format-option" data-format="md" style="flex: 1; padding: 10px; background: var(--ge-surface); border-radius: 8px; text-align: center; cursor: pointer; font-size: 12px; border: 1px solid var(--ge-border); position: relative;">
							<div style="font-weight: 600; margin-bottom: 2px;">MD</div>
							<div style="color: var(--ge-text-muted-2); font-size: 10px;">Markdown</div>
						</div>
					</div>
				</div>

				<!-- 功能按钮区域 -->
				<div id="button-container" style="display: flex; flex-direction: column; gap: 12px;">
					<!-- 滚动导出按钮 -->
					<button id="capture-chat-scroll-button" style="
						width: 100%;
						padding: 12px;
						background: var(--ge-primary);
						color: var(--ge-on-primary);
						border: 1px solid var(--ge-primary-border);
						border-radius: 10px;
						cursor: pointer;
						font-size: 13px;
						font-weight: 600;
						transition: all 0.2s ease;
					">${buttonTextStartScroll}</button>

					<!-- Canvas导出按钮 -->
					<button id="capture-canvas-button" style="
						width: 100%;
						padding: 12px;
						background: var(--ge-success);
						color: var(--ge-on-primary);
						border: 1px solid var(--ge-success-border);
						border-radius: 10px;
						cursor: pointer;
						font-size: 13px;
						font-weight: 600;
						transition: all 0.2s ease;
					">${buttonTextCanvasExport}</button>

					<!-- 组合导出按钮 -->
					<button id="capture-combined-button" style="
						width: 100%;
						padding: 12px;
						background: var(--ge-neutral);
						color: var(--ge-on-primary);
						border: 1px solid var(--ge-neutral-border);
						border-radius: 10px;
						cursor: pointer;
						font-size: 13px;
						font-weight: 600;
						transition: all 0.2s ease;
					">${buttonTextCombinedExport}</button>

					<!-- 停止按钮 -->
					<button id="stop-scrolling-button" style="
						width: 100%;
						padding: 12px;
						background: var(--ge-danger);
						color: var(--ge-on-primary);
						border: 1px solid var(--ge-danger-border);
						border-radius: 10px;
						cursor: pointer;
						font-size: 13px;
						font-weight: 600;
						transition: all 0.2s ease;
						display: none;
					">${buttonTextStopScroll}</button>
				</div>

				<!-- 状态信息 -->
				<div id="extract-status-div" style="
					margin-top: 16px;
					padding: 10px;
					background: var(--ge-surface);
					border: 1px solid var(--ge-border);
					border-radius: 8px;
					font-size: 12px;
					line-height: 1.5;
					display: none;
					color: var(--ge-text-muted);
				"></div>

				<!-- 版权信息 -->
				<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--ge-border); text-align: center; font-size: 11px; color: var(--ge-text-muted-2);">
					v1.1.0 | sxuan © 2025-2026
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
		conversationDirectoryContainer = document.getElementById('conversation-directory');

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

		conversationDirectoryContainer.addEventListener('click', (event) => {
			const target = event.target.closest('.gemini-conversation-directory-item');
			if (!target) return;
			const anchorId = target.dataset.anchorId;
			if (!anchorId) return;
			const anchorEl = document.getElementById(anchorId);
			if (!anchorEl) return;
			anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
			target.classList.add('active');
			window.setTimeout(() => target.classList.remove('active'), 1200);
		});

		// 添加样式
		GM_addStyle(`
			#capture-chat-scroll-button:hover,
			#capture-canvas-button:hover,
			#capture-combined-button:hover,
			#stop-scrolling-button:hover {
				filter: brightness(1.05);
				transform: translateY(-1px);
			}

			#capture-chat-scroll-button:active,
			#capture-canvas-button:active,
			#capture-combined-button:active,
			#stop-scrolling-button:active {
				transform: translateY(0);
			}

			#capture-chat-scroll-button:disabled,
			#capture-canvas-button:disabled,
			#capture-combined-button:disabled,
			#stop-scrolling-button:disabled {
				opacity: 0.6;
				cursor: not-allowed;
				transform: none !important;
				background: var(--ge-neutral) !important;
				border-color: var(--ge-neutral-border) !important;
			}

			.success {
				background: var(--ge-success) !important;
				border-color: var(--ge-success-border) !important;
			}
			.error {
				background: var(--ge-danger) !important;
				border-color: var(--ge-danger-border) !important;
			}

			.format-option:hover {
				border-color: var(--ge-border-hover) !important;
			}
			.format-option.selected {
				border-color: var(--ge-success) !important;
			}

			#gemini-export-toggle:hover {
				right: 8px;
				transform: translateY(-50%) scale(1.06);
				background: var(--ge-primary-hover);
			}

			#gemini-export-panel::-webkit-scrollbar {
				width: 6px;
			}
			#gemini-export-panel::-webkit-scrollbar-track {
				background: var(--ge-panel-bg);
			}
			#gemini-export-panel::-webkit-scrollbar-thumb {
				background: var(--ge-scroll-thumb);
				border-radius: 3px;
			}
			#gemini-export-panel::-webkit-scrollbar-thumb:hover {
				background: var(--ge-scroll-thumb-hover);
			}

			#conversation-directory::-webkit-scrollbar {
				width: 6px;
			}
			#conversation-directory::-webkit-scrollbar-track {
				background: var(--ge-panel-bg);
			}
			#conversation-directory::-webkit-scrollbar-thumb {
				background: var(--ge-scroll-thumb);
				border-radius: 3px;
			}
			#conversation-directory::-webkit-scrollbar-thumb:hover {
				background: var(--ge-scroll-thumb-hover);
			}

			.gemini-conversation-directory-item {
				padding: 8px 10px;
				font-size: 12px;
				line-height: 1.4;
				color: var(--ge-panel-text);
				border-bottom: 1px solid var(--ge-divider);
				cursor: pointer;
			}
			.gemini-conversation-directory-item:hover {
				background: var(--ge-surface-hover);
			}
			.gemini-conversation-directory-item.active {
				outline: 1px solid var(--ge-success);
				outline-offset: -1px;
			}

			.directory-toggle-btn:hover {
				background: var(--ge-surface-hover) !important;
			}

			.directory-header:hover {
				background: var(--ge-surface);
			}
		`);

		startConversationDirectoryObserver();
		scheduleConversationDirectoryUpdate(0);
		updateConversationDirectoryPanelPosition();
		initDirectoryDrag();

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
		updateConversationDirectoryPanelPosition();
	}

	function updateConversationDirectoryPanelPosition() {
		if (!conversationDirectoryPanel || !sidePanel) return;
		// 仅在用户未手动拖拽过位置时，根据侧边栏状态调整
		const savedPos = loadDirectoryPosition();
		if (savedPos) return; // 用户已自定义位置，不自动调整
		const isOpen = sidePanel.style.right === '0px';
		conversationDirectoryPanel.style.right = isOpen ? '420px' : '44px';
	}

	function updateStatus(message) {
		if (statusDiv) {
			statusDiv.textContent = message;
			statusDiv.style.display = message ? 'block' : 'none';
		}
		console.log(`[Status] ${message}`);
	}


	// --- 核心业务逻辑 (滚动导出) ---

	// Canvas 内容提取和导出逻辑（支持 Monaco Editor 滚动提取）
	async function extractCanvasContent() {
		console.log("开始提取 Canvas 内容...");
		const canvasData = [];
		const seen = new Set();
		const wait = (ms) => new Promise(r => setTimeout(r, ms));

		// 内部帮助函数：滚动提取 Monaco 内容（针对长文件虚拟滚动）
		async function extractScrollableMonaco(panel) {
			try {
				const scrollable = panel.querySelector('.monaco-scrollable-element');
				const linesContainer = panel.querySelector('.view-lines, .lines-content');
				if (!scrollable || !linesContainer) return null;

				const { scrollHeight, clientHeight } = scrollable;
				// 只有当内容显著超过容器高度时才滚动
				if (scrollHeight <= clientHeight + 50) return null;

				const originalScrollTop = scrollable.scrollTop;
				const lineMap = new Map();
				let currentScroll = 0;
				const maxAttempts = 150;

				for (let i = 0; i < maxAttempts && currentScroll < scrollHeight; i++) {
					scrollable.scrollTop = currentScroll;
					await wait(80);
					const lines = linesContainer.querySelectorAll('.view-line');
					lines.forEach(line => {
						const top = parseInt(line.style.top || '0', 10);
						if (!isNaN(top)) lineMap.set(top, line.textContent || '');
					});
					currentScroll += clientHeight;
				}
				scrollable.scrollTop = originalScrollTop;

				if (lineMap.size === 0) return null;
				return Array.from(lineMap.entries()).sort((a, b) => a[0] - b[0]).map(e => e[1]).join('\n');
			} catch (e) {
				console.error('Scroll extraction failed', e);
				return null;
			}
		}

		// 查找所有的 immersive-panel 并锁定可见面板
		const panels = Array.from(document.querySelectorAll('immersive-panel, code-immersive-panel'));
		let targetPanel = panels.find(p => {
			const rect = p.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		}) || panels[0];

		if (targetPanel) {
			// 切换到代码模式
			const tabGroup = targetPanel.querySelector('mat-button-toggle-group');
			if (tabGroup) {
				const codeTab = Array.from(tabGroup.querySelectorAll('mat-button-toggle')).find(
					tab => tab.textContent?.includes('代码') || tab.textContent?.toLowerCase().includes('code')
				);
				if (codeTab && !codeTab.classList.contains('mat-button-toggle-checked')) {
					const btn = codeTab.querySelector('button');
					if (btn) btn.click();
					let attempts = 0;
					while (attempts < 30) {
						await wait(100);
						if (targetPanel.querySelectorAll('.view-line').length > 5) break;
						attempts++;
					}
				}
			}

			let codeContent = '';

			// 策略1: 滚动提取 (针对长文件)
			updateStatus('正在扫描 Canvas 代码...');
			const scrolledContent = await extractScrollableMonaco(targetPanel);
			if (scrolledContent) codeContent = scrolledContent;

			// 策略2: 简单提取 (短文件或失败回退)
			if (!codeContent) {
				// 再次确认加载
				let viewLines = targetPanel.querySelectorAll('.view-line');
				// 如果行数过少，多等一会儿
				if (viewLines.length <= 1) { await wait(500); viewLines = targetPanel.querySelectorAll('.view-line'); }

				if (viewLines.length > 0) {
					codeContent = Array.from(viewLines).map(line => line.textContent || '').join('\n').trim();
				}

				if (!codeContent) {
					const rawEl = targetPanel.querySelector('.lines-content, .monaco-scrollable-element');
					if (rawEl) codeContent = (rawEl.textContent || '').trim();
				}

				if (!codeContent) {
					const monacoEditor = targetPanel.querySelector('.monaco-editor');
					if (monacoEditor) codeContent = (monacoEditor.textContent || '').trim();
				}
			}

			if (codeContent) {
				const key = codeContent.substring(0, 100);
				if (!seen.has(key)) {
					seen.add(key);
					const langHint = targetPanel.querySelector('[data-mode-id]')?.getAttribute('data-mode-id')
						|| targetPanel.querySelector('.detected-link')?.textContent?.toLowerCase()
						|| 'html';
					canvasData.push({
						type: 'code', index: canvasData.length + 1, content: codeContent.trim(), language: langHint, source: 'canvas'
					});
				}
			}
		}

		// 2. 提取页面中的代码块 (code-block)
		const codeBlocks = document.querySelectorAll('code-block, pre code, .code-block');
		codeBlocks.forEach((block) => {
			// 跳过 immersive-panel 内部的，因为已经处理过了
			if (block.closest('immersive-panel, code-immersive-panel')) return;

			const codeContent = block.textContent || block.innerText;
			if (!codeContent || !codeContent.trim()) return;
			const trimmedContent = codeContent.trim();
			const key = trimmedContent.substring(0, 100);
			if (seen.has(key)) return;
			seen.add(key);
			canvasData.push({
				type: 'code',
				index: canvasData.length + 1,
				content: trimmedContent,
				language: block.querySelector('[data-lang]')?.getAttribute('data-lang') || 'unknown',
				source: 'code-block'
			});
		});

		// 3. 如果没有找到代码块，提取响应文本作为备用
		if (canvasData.length === 0) {
			const responseElements = document.querySelectorAll('.markdown, .model-response-text');
			responseElements.forEach((element) => {
				if (element.closest('code-block') || element.querySelector('code-block')) return;
				const textContent = element.textContent || element.innerText;
				if (!textContent || !textContent.trim()) return;
				const trimmedContent = textContent.trim();
				const key = trimmedContent.substring(0, 100);
				if (seen.has(key)) return;
				seen.add(key);
				canvasData.push({
					type: 'text',
					index: canvasData.length + 1,
					content: trimmedContent,
					source: 'response'
				});
			});
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
			const canvasData = await extractCanvasContent();

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
			const canvasData = await extractCanvasContent();

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
				md += `## 对话内容

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
				md += `## Canvas 内容

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
		scheduleConversationDirectoryUpdate(0);

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
			return s.replace(/`/g, '\u0060').replace(/</g, '&lt;');
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
			updateStatus('没有收集到任何有效滚动记录。');
			alert('滚动结束后未能收集到任何聊天记录，无法导出。');
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

	// TODO 2025-09-08: 后续可实现自动展开 Gemini 隐藏思维链（需要模拟点击“显示思路”按钮），当前以占位符标记
	// TODO 2025-09-08: Markdown 正式格式化尚未实现，当前仅输出占位头部，保持向后兼容

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
	console.log("Gemini_Chat_Export 导出脚本 (v1.1.0): 等待页面加载 (2.5秒)...");
	startThemeSync();
	setTimeout(createUI, 2500);

})();
