const TRACKED_LINKS_QUEUE: string[] = [];
export let swupInitialized = false;

export function addLinkToQueue(url: string): void {
	if (!TRACKED_LINKS_QUEUE.includes(url)) {
		TRACKED_LINKS_QUEUE.push(url);
	}
}

export function processQueuedLinks(): void {
	if (!swupInitialized) return;
	while (TRACKED_LINKS_QUEUE.length > 0) {
		const url = TRACKED_LINKS_QUEUE.shift();
		if (url && window.swup?.navigate) {
			window.swup.navigate(url);
		}
	}
}

export function monitorSwupInitialization(): Promise<void> {
	return new Promise<void>((resolve) => {
		const checkInterval = setInterval(() => {
			const swup = (window as any).swup;
			if (swup && typeof swup.init === "function" && !swup.initialized) {
				swup.init();
				swupInitialized = true;
				clearInterval(checkInterval);
				processQueuedLinks();
				resolve();
			}
		}, 100);

		document.addEventListener(
			"swup:enable",
			() => {
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

			event.preventDefault();
			addLinkToQueue(href);
		},
		{ capture: true },
	);
}
