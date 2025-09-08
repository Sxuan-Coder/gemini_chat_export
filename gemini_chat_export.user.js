// ==UserScript==
// @name         Gemini 聊天对话记录一键导出
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  一键导出 Google Gemini 的网页端对话聊天记录为 JSON / TXT / Markdown 文件。
// @author       sxuan
// @match        https://gemini.google.com/app*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCACAyNCIgZmlsbD0iIzAwNzhmZiI+PHBhdGggZD0iTTE5LjUgMi4yNWgtMTVjLTEuMjQgMC0yLjI1IDEuMDEtMi4yNSAyLjI1djE1YzAgMS4yNCAxLjAxIDIuMjUgMi4yNSAyLjI1aDE1YzEuMjQgMCAyLjI1LTEuMDEgMi4yNS0yLjI1di0xNWMwLTEuMjQtMS4wMS0yLjI1LTIuMjUtMi4yNXptLTIuMjUgNmgtMTAuNWMtLjQxIDAtLjc1LS4zNC0uNzUtLjc1cy4zNC0uNzUuNzUtLjc1aDEwLjVjLjQxIDAgLjc1LjM0Ljc1Ljc1cy0uMzQuNzUtLjc1Ljc1em0wIDRoLTEwLjVjLS40MSAwLS43NS0uMzQtLjc1LS43NXMuMzQtLjc1Ljc1LS43NWgxMC41Yy40MSAwIC43NS4zNC43NS43NXMtLjM0Ljc1LS4yNS43NXptLTMgNGgtNy41Yy0uNDEgMC0uNzUtLjM0LS43NS0uNzVzLjM0LS43NS43NS0uNzVoNy41Yy40MSAwIC43NS4zNC43NS43NXMtLjM0Ljc1LS43NS43NXoiLz48L3N2Zz4=
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
	const buttonTextStartScroll = "滚动导出TXT";
	const buttonTextStopScroll = "停止滚动";
	const buttonTextProcessingScroll = "处理滚动数据...";
	const successTextScroll = "滚动导出 TXT 成功!";
	const errorTextScroll = "滚动导出失败";

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
	let statusDiv = null;
	let hideButton = null;
	let buttonContainer = null;

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
		nodes.forEach((c, idx) => {
			let info = collectedData.get(c) || { domOrder: idx, type: 'unknown', userText: null, thoughtText: null, responseText: null };
			let changed = false;
			if (!collectedData.has(c)) { collectedData.set(c, info); newly++; }
			if (!info.userText) {
				const userTexts = Array.from(c.querySelectorAll('user-query .query-text-line, user-query .query-text p, user-query .query-text'))
					.map(el => el.innerText.trim()).filter(Boolean);
				if (userTexts.length) { info.userText = userTexts.join('\n'); changed = true; if (info.type === 'unknown') info.type = 'user'; }
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

		buttonContainer = document.createElement('div');
		buttonContainer.id = 'exporter-button-container';
		buttonContainer.style.cssText = `position: fixed; bottom: 30%; left: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;`;
		document.body.appendChild(buttonContainer);

		captureButtonScroll = document.createElement('button');
		captureButtonScroll.textContent = buttonTextStartScroll;
		captureButtonScroll.id = 'capture-chat-scroll-button';
		captureButtonScroll.style.cssText = `padding: 10px 15px; background-color: #1a73e8; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); transition: all 0.3s ease;`;
		captureButtonScroll.addEventListener('click', handleScrollExtraction);
		buttonContainer.appendChild(captureButtonScroll);

		stopButtonScroll = document.createElement('button');
		stopButtonScroll.textContent = buttonTextStopScroll;
		stopButtonScroll.id = 'stop-scrolling-button';
		stopButtonScroll.style.cssText = `padding: 10px 15px; background-color: #d93025; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); display: none; transition: background-color 0.3s ease;`;
		stopButtonScroll.addEventListener('click', () => {
			if (isScrolling) {
				updateStatus('手动停止滚动信号已发送..');
				isScrolling = false;
				stopButtonScroll.disabled = true;
				stopButtonScroll.textContent = '正在停止...';
			}
		});
		buttonContainer.appendChild(stopButtonScroll);

		hideButton = document.createElement('button');
		hideButton.textContent = '👁️';
		hideButton.id = 'hide-exporter-buttons';
		hideButton.style.cssText = `position: fixed; bottom: calc(30% + 85px); left: 20px; z-index: 10000; padding: 5px 8px; background-color: rgba(0, 0, 0, 0.3); color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 12px;`;
		hideButton.addEventListener('click', () => {
			const isHidden = buttonContainer.style.display === 'none';
			if (!isHidden) {
				// 隐藏按钮时显示提示
				alert('💡 提示：为了确保导出完整的对话记录，建议在开始滚动导出前，手动拉到对话的顶部，这样可以防止对话内容被漏读。');
			}
			buttonContainer.style.display = isHidden ? 'flex' : 'none';
			hideButton.textContent = isHidden ? '👁️' : '🙈';
		});
		document.body.appendChild(hideButton);


		statusDiv = document.createElement('div');
		statusDiv.id = 'extract-status-div';
		statusDiv.style.cssText = `position: fixed; bottom: 30%; left: 200px; z-index: 9998; padding: 5px 10px; background-color: rgba(0,0,0,0.7); color: white; font-size: 12px; border-radius: 3px; display: none;`;
		document.body.appendChild(statusDiv);

		GM_addStyle(`
                  #capture-chat-scroll-button:disabled, #stop-scrolling-button:disabled {
                      opacity: 0.6; cursor: not-allowed; background-color: #aaa !important;
                  }
                   #capture-chat-scroll-button.success { background-color: #1e8e3e !important; }
                   #capture-chat-scroll-button.error { background-color: #d93025 !important; }
        `);
		console.log("UI 元素创建完成");
	}

	function updateStatus(message) {
		if (statusDiv) {
			statusDiv.textContent = message;
			statusDiv.style.display = message ? 'block' : 'none';
		}
		console.log(`[Status] ${message}`);
	}


	// --- 核心业务逻辑 (滚动导出) ---
	function extractDataIncremental_AiStudio() {
		let newlyFoundCount = 0;
		let dataUpdatedInExistingTurn = false;
		const currentTurns = document.querySelectorAll('ms-chat-turn');

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
						extractedInfo.userText = userText;
						dataWasUpdatedThisTime = true;
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
		function escapeMd(s) {
			return s.replace(/`/g, '\u0060').replace(/</g, '&lt;'); // 简单避免破坏结构；代码块原样保存
		}
		if (mode === 'txt') {
			let header = context === 'scroll' ? 'Gemini 聊天记录 (滚动采集)' : 'Gemini 对话记录 (SDK 代码)';
			let body = `${header}\n=========================================\n\n`;
			sortedData.forEach(item => {
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
			sortedData.forEach(item => {
				if (item.userText) arr.push({ role: 'user', content: item.userText, id: `${item.domOrder}-user` });
				if (item.thoughtText) arr.push({ role: 'thought', content: item.thoughtText, id: `${item.domOrder}-thought` });
				if (item.responseText) arr.push({ role: 'assistant', content: item.responseText, id: `${item.domOrder}-assistant` });
			});
			return { blob: new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json;charset=utf-8' }), filename: `${base}.json` };
		}
		if (mode === 'md') { // 正式 Markdown 格式
			let md = `# ${projectName} 对话导出 (${context})\n\n`;
			md += `导出时间：${ts}\n\n`;
			sortedData.forEach((item, idx) => {
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
	console.log("Gemini_Chat_Export 导出脚本 (v1.0.4): 等待页面加载 (2.5秒)...");
	setTimeout(createUI, 2500);

})();
