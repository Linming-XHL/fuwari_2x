import { forumEnv } from "@/forum/stores/env";
import { get } from "svelte/store";

export interface SSEMessage {
	type:
		| "connected"
		| "subscribed"
		| "unsubscribed"
		| "new_comment"
		| "post_updated"
		| "pong";
	timestamp: number;
	postId?: string;
	payload?: Record<string, unknown>;
}

export interface NewCommentPayload {
	postId: string;
	comment: {
		content: string;
		author_name: string;
		author_id: number;
		parent_id: string | null;
		created_at: string;
	};
}

export interface PostUpdatedPayload {
	postId: string;
	title: string;
	content: string;
	category_id: number;
	updated_at: string;
}

export interface SubscribedPayload {
	postId: string;
	timestamp: number;
}

export interface ConnectedPayload {
	timestamp: number;
	postId?: string;
}

export type SSEEventHandler = (payload: Record<string, unknown>) => void;

export class ForumSSE {
	private eventSource: EventSource | null = null;
	private baseUrl: string;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private eventHandlers: Map<string, SSEEventHandler[]> = new Map();
	private currentPostId: string | null = null;
	private isConnecting = false;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.baseUrl = this.buildBaseUrl();
	}

	private buildBaseUrl(): string {
		const baseUrl = get(forumEnv.baseUrl);
		return baseUrl;
	}

	connect(postId?: string): void {
		if (
			this.isConnecting ||
			(this.eventSource && this.eventSource.readyState === EventSource.OPEN)
		) {
			console.log("[SSE] Already connected or connecting, skipping...");
			return;
		}

		this.isConnecting = true;
		this.currentPostId = postId || null;

		const url = postId
			? `${this.baseUrl}/api/sse?postId=${encodeURIComponent(postId)}`
			: `${this.baseUrl}/api/sse`;

		console.log("[SSE] Connecting to:", url);

		try {
			this.eventSource = new EventSource(url);

			this.eventSource.onopen = () => {
				console.log("[SSE] Connected successfully");
				this.isConnecting = false;
				this.reconnectAttempts = 0;
				this.emit("connected", {
					timestamp: Date.now(),
					postId: this.currentPostId,
				});
			};

			this.eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as SSEMessage;
					this.handleMessage(data);
				} catch (error) {
					console.error("[SSE] Failed to parse message:", error);
				}
			};

			this.eventSource.onerror = (error) => {
				console.error("[SSE] Connection error:", error);
				this.isConnecting = false;
				this.emit("error", { error: "Connection error" });
				this.handleReconnect();
			};
		} catch (error) {
			console.error("[SSE] Failed to create EventSource:", error);
			this.isConnecting = false;
			this.handleReconnect();
		}
	}

	private handleMessage(data: SSEMessage): void {
		console.log("[SSE] Received message:", data.type, data.payload);

		switch (data.type) {
			case "connected":
				this.emit("connected", {
					timestamp: data.timestamp,
					postId: data.postId,
				});
				break;
			case "subscribed":
				console.log("[SSE] Successfully subscribed to post:", data.postId);
				this.emit("subscribed", {
					postId: data.postId,
					timestamp: data.timestamp,
				});
				break;
			case "unsubscribed":
				this.emit("unsubscribed", { timestamp: data.timestamp });
				break;
			case "new_comment":
				console.log("[SSE] New comment received:", data.payload);
				this.emit("new_comment", data.payload || {});
				break;
			case "post_updated":
				console.log("[SSE] Post updated:", data.payload);
				this.emit("post_updated", data.payload || {});
				break;
			case "pong":
				break;
			default:
				console.log("[SSE] Unknown message type:", data.type);
		}
	}

	private handleReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error("[SSE] Max reconnection attempts reached");
			return;
		}

		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

		console.log(
			`[SSE] Reconnecting in ${delay / 1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
		);

		setTimeout(() => {
			this.connect(this.currentPostId || undefined);
		}, delay);
	}

	disconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.isConnecting = false;
		this.reconnectAttempts = 0;
		this.currentPostId = null;
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	on(event: string, handler: SSEEventHandler): void {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, []);
		}
		this.eventHandlers.get(event)!.push(handler);
	}

	off(event: string, handler: SSEEventHandler): void {
		const handlers = this.eventHandlers.get(event);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index !== -1) {
				handlers.splice(index, 1);
			}
		}
	}

	private emit(event: string, payload: Record<string, unknown>): void {
		const handlers = this.eventHandlers.get(event);
		if (handlers) {
			handlers.forEach((handler) => {
				try {
					handler(payload);
				} catch (error) {
					console.error(`[SSE] Error in event handler for ${event}:`, error);
				}
			});
		}
	}

	isConnected(): boolean {
		return (
			this.eventSource !== null &&
			this.eventSource.readyState === EventSource.OPEN
		);
	}

	getCurrentPostId(): string | null {
		return this.currentPostId;
	}
}

let forumSSEInstance: ForumSSE | null = null;

export function getForumSSE(): ForumSSE {
	if (!forumSSEInstance) {
		forumSSEInstance = new ForumSSE();
	}
	return forumSSEInstance;
}

export function disconnectForumSSE(): void {
	if (forumSSEInstance) {
		forumSSEInstance.disconnect();
		forumSSEInstance = null;
	}
}
