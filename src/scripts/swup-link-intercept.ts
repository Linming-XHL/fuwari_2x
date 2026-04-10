const TRACKED_LINKS_QUEUE: string[] = [];
export let swupInitialized = false;

export function addLinkToQueue(url: string): void {
	if (!TRACKED_LINKS_QUEUE.includes(url)) {
		TRACKED_LINKS_QUEUE.push(url);
		console.log(
			`[swup-link-intercept] 📥 入队: ${url} (当前队列长度: ${TRACKED_LINKS_QUEUE.length})`,
		);
	} else {
		console.log(`[swup-link-intercept] ⏭️ 跳过重复: ${url}`);
	}
}

export function processQueuedLinks(): void {
	if (!swupInitialized) {
		console.warn("[swup-link-intercept] ⛔ processQueuedLinks 被调用但 swup 尚未初始化，跳过");
		return;
	}
	console.log(
		`[swup-link-intercept] 🚀 开始处理队列，共 ${TRACKED_LINKS_QUEUE.length} 个链接:`,
		[...TRACKED_LINKS_QUEUE],
	);
	while (TRACKED_LINKS_QUEUE.length > 0) {
		const url = TRACKED_LINKS_QUEUE.shift();
		if (url && window.swup?.navigate) {
			console.log(`[swup-link-intercept] ➡️  导航至: ${url}`);
			window.swup.navigate(url);
		}
	}
	console.log(`[swup-link-intercept] ✅ 队列处理完毕`);
}

export function monitorSwupInitialization(): Promise<void> {
	return new Promise<void>((resolve) => {
		const checkInterval = setInterval(() => {
			const swup = (window as any).swup;
			if (swup && typeof swup.init === "function" && !swup.initialized) {
				console.log("[swup-link-intercept] 🔄 swup 对象已就绪，开始 init()...");
				swup.init();
				swupInitialized = true;
				console.log("[swup-link-intercept] ✅ swup 初始化完成（轮询触发）");
				clearInterval(checkInterval);
				processQueuedLinks();
				resolve();
			}
		}, 100);

		document.addEventListener(
			"swup:enable",
			() => {
				console.log("[swup-link-intercept] ✅ 收到 swup:enable 事件，swup 初始化完成");
				clearInterval(checkInterval);
				swupInitialized = true;
				processQueuedLinks();
				resolve();
			},
			{ capture: true },
		);
	});
}

export function setupLinkInterceptor(): void {
	document.addEventListener(
		"click",
		(event) => {
			const target = event.target as HTMLElement;
			const anchor = target.closest("a[href]");
			if (!anchor) return;

			const href = anchor.getAttribute("href");
			if (!href) return;

			if (href.startsWith("#")) return;

			const link = new URL(href, window.location.origin);
			const currentDomain = new URL(window.location.href).origin;

			if (link.origin !== currentDomain) return;

			const swup = (window as any).swup;
			if (swup && swup.initialized) {
				return;
			}

			console.log(
				`[swup-link-intercept] 🖱️  点击拦截: <${anchor.tagName.toLowerCase()} href="${href}"> ` +
					`(text: "${anchor.textContent?.trim().slice(0, 30)}", swup.initialized=${!!swup})`,
			);
			event.preventDefault();
			addLinkToQueue(href);
		},
		{ capture: true },
	);
}
