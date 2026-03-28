<script lang="ts">
	import { onMount } from "svelte";
	import Icon from "@iconify/svelte";
	import EnvironmentSwitcher from "@/components/forum/EnvironmentSwitcher.svelte";
	import PostList from "@/components/forum/PostList.svelte";
	import { getAdminCategories } from "@/forum/api/admin";
	import { getPosts, type ForumPostListQuery } from "@/forum/api/posts";
	import type { ForumCategory, ForumPostSummary } from "@/forum/types/post";

	const PAGE_SIZE = 20;
	const HIDDEN = -1;
	const ADJ_DIST = 2;
	const VISIBLE = ADJ_DIST * 2 + 1;

	let posts: ForumPostSummary[] = [];
	let categories: ForumCategory[] = [];
	let loading = true;
	let categoriesLoading = true;
	let search = "";
	const sortLabelMap: Record<string, string> = {
		latest: "最新发布",
		oldest: "最早发布",
		likes: "最多点赞",
		comments: "最多评论",
		views: "最多观看",
	};

	let sort = "latest";
	let category = "";
	let currentPage = 1;
	let total = 0;
	let lastPage = 1;
	let initialized = false;

	function sanitizePage(value: string | null) {
		const page = Number.parseInt(value || "1", 10);
		return Number.isFinite(page) && page > 0 ? page : 1;
	}

	function readQueryState() {
		const params = new URLSearchParams(window.location.search);
		search = params.get("search") || "";
		sort = params.get("sort") || "latest";
		category = params.get("category") || "";
		currentPage = sanitizePage(params.get("page"));
	}

	function writeQueryState() {
		const params = new URLSearchParams(window.location.search);
		if (search) {
			params.set("search", search);
		} else {
			params.delete("search");
		}
		if (sort && sort !== "latest") {
			params.set("sort", sort);
		} else {
			params.delete("sort");
		}
		if (category) {
			params.set("category", category);
		} else {
			params.delete("category");
		}
		if (currentPage > 1) {
			params.set("page", String(currentPage));
		} else {
			params.delete("page");
		}
		const queryString = params.toString();
		const target = queryString ? `?${queryString}` : window.location.pathname;
		window.history.replaceState({}, "", target);
	}

	async function loadPosts(page = currentPage, syncUrl = true) {
		loading = true;
		currentPage = page;
		if (syncUrl) {
			writeQueryState();
		}
		try {
			const query: ForumPostListQuery = {
				search: search || undefined,
				sort,
				category: category || undefined,
				page,
				pageSize: PAGE_SIZE,
			};
			const result = await getPosts(query);
			if (Array.isArray(result)) {
				posts = result;
				total = result.length;
				lastPage = 1;
				currentPage = 1;
				writeQueryState();
				return;
			}
			posts = result.items;
			total = result.total || 0;
			lastPage = Math.max(1, Math.ceil((result.total || 0) / PAGE_SIZE));
			if (currentPage > lastPage) {
				currentPage = lastPage;
				writeQueryState();
			}
		} catch (error) {
			console.error(error);
			posts = [];
			total = 0;
			lastPage = 1;
		} finally {
			loading = false;
		}
	}

	function submitSearch() {
		loadPosts(1);
	}

	function changeSort(nextSort: string) {
		if (sort === nextSort) {
			return;
		}
		sort = nextSort;
		loadPosts(1);
	}

	function changeCategory(nextCategory: string) {
		if (category === nextCategory) {
			return;
		}
		category = nextCategory;
		loadPosts(1);
	}

	function goToPage(page: number) {
		if (page < 1 || page > lastPage || page === currentPage || loading) {
			return;
		}
		loadPosts(page);
	}

	$: pages = (() => {
		let count = 1;
		let left = currentPage;
		let right = currentPage;
		while (0 < left - 1 && right + 1 <= lastPage && count + 2 <= VISIBLE) {
			count += 2;
			left -= 1;
			right += 1;
		}
		while (0 < left - 1 && count < VISIBLE) {
			count += 1;
			left -= 1;
		}
		while (right + 1 <= lastPage && count < VISIBLE) {
			count += 1;
			right += 1;
		}

		const values: number[] = [];
		if (left > 1) values.push(1);
		if (left === 3) values.push(2);
		if (left > 3) values.push(HIDDEN);
		for (let page = left; page <= right; page += 1) values.push(page);
		if (right < lastPage - 2) values.push(HIDDEN);
		if (right === lastPage - 2) values.push(lastPage - 1);
		if (right < lastPage) values.push(lastPage);
		return values;
	})();

	async function loadCategories() {
		categoriesLoading = true;
		try {
			categories = await getAdminCategories();
		} catch (error) {
			console.error(error);
			categories = [];
		} finally {
			categoriesLoading = false;
		}
	}

	onMount(() => {
		readQueryState();
		loadCategories();
		loadPosts(currentPage, false);
		initialized = true;

		const handlePopState = () => {
			readQueryState();
			loadPosts(currentPage, false);
		};

		window.addEventListener("popstate", handlePopState);
		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	});
</script>

<div class="space-y-6">
	<div class="card-base p-6 md:p-8">
		<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<div class="mb-2 flex items-center gap-2">
					<Icon icon="material-symbols:forum-outline-rounded" class="text-3xl text-[var(--primary)]" />
					<h1 class="text-2xl font-bold text-white">论坛广场</h1>
				</div>
				<p class="text-sm text-white/45">i.2x.nz 论坛已将前端接入官网，如遇前端Bug，请反馈至 <a href="https://github.com/afoim/fuwari/issues" target="_blank" rel="noreferrer" class="text-[var(--primary)] underline decoration-dashed underline-offset-4">Fuwari</a>，如遇后端Bug，请反馈至 <a href="https://github.com/afoim/forum_for_cloudflare/issues" target="_blank" rel="noreferrer" class="text-[var(--primary)] underline decoration-dashed underline-offset-4">forum_for_cloudflare</a>。如果你不知道某个Bug是哪个端导致的，可以前往置顶帖评论反馈</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<a href="/forum/new/" class="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-black/80">发布帖子</a>
				<a href="/forum/me/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">个人中心</a>
				<a href="https://github.com/afoim/forum_for_cloudflare" target="_blank" rel="noreferrer" class="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70"><Icon icon="mdi:github" class="text-base" />Github</a>
			</div>
		</div>
		<EnvironmentSwitcher />
		<div class="mt-5 flex flex-col gap-3 lg:flex-row">
			<div class="flex min-w-0 flex-1 gap-3">
				<input bind:value={search} class="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="搜索帖子标题或内容，回车提交" on:keydown={(event) => event.key === "Enter" && submitSearch()} />
				<button
					type="button"
					class="inline-flex h-[3.125rem] w-[3.125rem] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/75 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
					aria-label="搜索帖子"
					on:click={submitSearch}
				>
					<Icon icon="material-symbols:search-rounded" class="text-xl" />
				</button>
			</div>
			<select value={category} class="forum-select rounded-xl border border-white/10 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" on:change={(event) => changeCategory((event.currentTarget as HTMLSelectElement).value)} disabled={categoriesLoading}>
				<option value="">全部分类</option>
				{#each categories as item}
					<option value={item.id}>{item.name}</option>
				{/each}
			</select>
			<select value={sort} class="forum-select rounded-xl border border-white/10 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" on:change={(event) => changeSort((event.currentTarget as HTMLSelectElement).value)}>
				<option value="latest">最新发布</option>
				<option value="oldest">最早发布</option>
				<option value="likes">最多点赞</option>
				<option value="comments">最多评论</option>
				<option value="views">最多观看</option>
			</select>
		</div>
	</div>
	<PostList {posts} {loading} emptyText="当前环境暂无可展示的帖子。" />
	{#if !loading && lastPage > 1}
		<div class="flex flex-col items-center gap-3">
			<div class="flex flex-row justify-center gap-3">
				<button class="btn-card overflow-hidden rounded-lg text-[var(--primary)] w-11 h-11 disabled:opacity-40" aria-label="上一页" disabled={currentPage === 1} on:click={() => goToPage(currentPage - 1)}>
					<Icon icon="material-symbols:chevron-left-rounded" class="text-[1.75rem]" />
				</button>
				<div class="flex flex-row items-center rounded-lg bg-[var(--card-bg)] font-bold text-neutral-300" style="backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
					{#each pages as page}
						{#if page === HIDDEN}
							<div class="flex h-11 w-8 items-center justify-center text-white/50">
								<Icon icon="material-symbols:more-horiz" class="mx-1" />
							</div>
						{:else if page === currentPage}
							<div class="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--primary)] font-bold text-black/70">{page}</div>
						{:else}
							<button class="flex h-11 w-11 items-center justify-center rounded-lg overflow-hidden text-white/75 transition hover:bg-[var(--btn-card-bg-hover)] active:scale-[0.85] active:bg-[var(--btn-card-bg-active)]" aria-label={`第 ${page} 页`} on:click={() => goToPage(page)}>{page}</button>
						{/if}
					{/each}
				</div>
				<button class="btn-card overflow-hidden rounded-lg text-[var(--primary)] w-11 h-11 disabled:opacity-40" aria-label="下一页" disabled={currentPage === lastPage} on:click={() => goToPage(currentPage + 1)}>
					<Icon icon="material-symbols:chevron-right-rounded" class="text-[1.75rem]" />
				</button>
			</div>
			<p class="text-center text-sm text-white/40">第 {currentPage} / {lastPage} 页，共 {total} 帖</p>
		</div>
	{/if}
	{#if initialized && !loading && total === 0 && (search || sort !== "latest" || category)}
		<p class="text-center text-sm text-white/35">当前筛选条件：{search ? `搜索“${search}”` : "全部帖子"}{category ? ` · 分类 ${categories.find((item) => item.id === category)?.name || category}` : ""}{sort !== "latest" ? ` · 排序 ${sortLabelMap[sort] || sort}` : ""}</p>
	{/if}
</div>
