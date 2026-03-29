export type ForumToastType = "success" | "error" | "info" | "warning";

export interface ForumToastDetail {
	type: ForumToastType;
	title: string;
	description: string;
}

export const FORUM_TOAST_EVENT = "forum:toast";

export function emitToast(detail: ForumToastDetail) {
	window.dispatchEvent(new CustomEvent<ForumToastDetail>(FORUM_TOAST_EVENT, { detail }));
}

export function emitSuccessToast(title: string, description: string) {
	emitToast({ type: "success", title, description });
}

export function emitErrorToast(title: string, description: string) {
	emitToast({ type: "error", title, description });
}

export function emitInfoToast(title: string, description: string) {
	emitToast({ type: "info", title, description });
}

export function emitWarningToast(title: string, description: string) {
	emitToast({ type: "warning", title, description });
}
