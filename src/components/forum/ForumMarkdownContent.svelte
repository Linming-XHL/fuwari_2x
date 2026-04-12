<script lang="ts">
import { renderForumMarkdown } from "@/forum/utils/markdown";

export let content = "";
export let className = "";

let renderedHtml = "";

$: {
	const c = content;
	renderForumMarkdown(c).then((html) => (renderedHtml = html));
}

$: classes = [
	"custom-md prose prose-invert !max-w-none break-words text-white/75",
	className,
]
	.filter(Boolean)
	.join(" ");
</script>

<div class={classes}>
	{@html renderedHtml || "<p>暂无内容</p>"}
</div>
