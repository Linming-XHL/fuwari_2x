export function getDefaultHue(): number {
	const fallback = "250";
	const configCarrier = document.getElementById("config-carrier");
	return Number.parseInt(configCarrier?.dataset.hue || fallback);
}

export function setHue(hue: number): void {
	document.documentElement.style.setProperty("--hue", String(hue));
}

export function getBgBlur(): number {
	const stored = localStorage.getItem("bg-blur");
	return stored ? Number.parseInt(stored) : 4; // Default blur is 4
}

export function setBgBlur(blur: number): void {
	localStorage.setItem("bg-blur", String(blur));
	const bgBox = document.getElementById("bg-box");
	if (bgBox) {
		// Retrieve existing hue-rotate value if any, or 0
		const currentFilter = bgBox.style.filter || "";
		const hueRotateMatch = currentFilter.match(/hue-rotate\((.*?)deg\)/);
		const hueRotate = hueRotateMatch ? hueRotateMatch[1] : "0";
		bgBox.style.setProperty(
			"filter",
			`blur(${blur / 16}rem) hue-rotate(${hueRotate}deg)`,
		);
	}
}

export function getHideBg(): boolean {
	const stored = localStorage.getItem("hide-bg");
	return stored === "true";
}

export function setHideBg(hide: boolean): void {
	localStorage.setItem("hide-bg", String(hide));
	const bgBox = document.getElementById("bg-box");
	if (bgBox) {
		bgBox.style.setProperty("opacity", hide ? "0" : "");
	}
}

export function getDevMode(): boolean {
	const stored = localStorage.getItem("dev-mode");
	return stored === "true";
}

export function setDevMode(enabled: boolean): void {
	localStorage.setItem("dev-mode", String(enabled));
}

export function getDevServer(): string {
	const stored = localStorage.getItem("dev-server");
	return stored || "";
}

export function setDevServer(server: string): void {
	localStorage.setItem("dev-server", server);
}
