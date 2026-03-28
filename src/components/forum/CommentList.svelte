<script lang="ts">
	import ForumMarkdownEditor from "@/components/forum/ForumMarkdownEditor.svelte";
	import CommentItem from "@/components/forum/CommentItem.svelte";
	import type { ForumComment } from "@/forum/types/comment";
	import Icon from "@iconify/svelte";

	export let comments: ForumComment[] = [];
	export let loading = false;
	export let canReply = false;
	export let postId = "";
	export let activeReplyParentId: string | null = null;
	export let replyContent = "";
	export let submittingReply = false;
	export let onReplyToggle: (commentId: string | null) => void = () => {};
	export let onReplyContentChange: (value: string) => void = () => {};
	export let onReplySubmit: (comment: ForumComment) => void = () => {};
	export let onReplyEscape: () => void = () => {};
	export let onCommentPatched: (commentId: string, patch: Partial<ForumComment>) => void = () => {};
	export let currentUser = null;
	export let onCommentDeleted: () => void = () => {};

	function buildCommentTree(flatComments: ForumComment[]) {
		const map = new Map<string, ForumComment>();
		const roots: ForumComment[] = [];

		for (const comment of flatComments) {
			map.set(comment.id, { ...comment, replies: [] });
		}

		for (const comment of map.values()) {
			if (comment.parentId) {
				const parent = map.get(comment.parentId);
				if (parent) {
					parent.replies = [...(parent.replies || []), comment];
					continue;
				}
			}
			roots.push(comment);
		}

		return roots;
	}

	$: commentTree = buildCommentTree(comments);
</script>

<div class="space-y-3">
	{#if loading}
		<div class="card-base flex items-center gap-2 p-4 text-white/50">
			<Icon icon="svg-spinners:ring-resize" class="text-xl" />
			正在加载评论...
		</div>
	{:else if comments.length === 0}
		<div class="card-base p-4 text-white/50">暂无评论，来发表第一条吧。</div>
	{:else}
		{#each commentTree as comment (comment.id)}
			<CommentItem
				{comment}
				{activeReplyParentId}
				{replyContent}
				{canReply}
				{submittingReply}
				{onReplyToggle}
				{onReplyContentChange}
				{onReplySubmit}
				{onReplyEscape}
				{onCommentPatched}
				{currentUser}
				onCommentDeleted={onCommentDeleted}
			>
				<div slot="reply-editor" class="space-y-3">
					<ForumMarkdownEditor
						bind:value={replyContent}
						shellClass="reply-editor-shell"
						mode="reply"
						uploadType="comment"
						uploadPostId={postId}
						placeholder="写下你的回复（支持 Markdown）"
						submitting={submittingReply}
						minHeight={140}
						submitHint="Ctrl/Cmd + Enter 提交，Esc 收起"
						on:change={(event) => onReplyContentChange(event.detail.value)}
						on:submit={() => onReplySubmit(comment)}
						on:escape={onReplyEscape}
					/>
					<div class="flex items-center justify-end gap-2">
						<button class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/55" type="button" on:click={onReplyEscape}>取消</button>
						<button class="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-black/80 disabled:opacity-60" type="button" disabled={submittingReply || !replyContent.trim()} on:click={() => onReplySubmit(comment)}>回复</button>
					</div>
				</div>
			</CommentItem>
		{/each}
	{/if}
</div>
