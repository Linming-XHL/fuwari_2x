export function emitSuccessToast(
	title: string,
	description: string,
	silent = false,
): void {
	if (!silent) {
		alert(`${title}\n\n${description}`);
	}
}

export function emitErrorToast(title: string, description: string): void {
	alert(`${title}\n\n${description}`);
}

export function emitInfoToast(
	title: string,
	description: string,
	silent = false,
): void {
	if (!silent) {
		alert(`${title}\n\n${description}`);
	}
}

export function emitWarningToast(title: string, description: string): void {
	alert(`${title}\n\n${description}`);
}
