// 文章列表客户端排序（仅当前页面内排序）

interface PostData {
	id: string;
	title: string;
	published: string;
	pinned?: boolean;
}

type SortType = "date" | "alpha";
type SortOrder = "asc" | "desc";

class PostListManager {
	private posts: PostData[] = [];
	private currentSort: SortType = "date";
	private currentOrder: SortOrder = "desc";
	private articles: HTMLElement[] = [];

	constructor() {
		this.init();
	}

	private init() {
		if (typeof window === "undefined") return;

		this.posts = (window as any).__PAGE_POSTS_DATA__ || [];
		this.cacheArticles();
		this.loadState();
		this.bindEvents();
		this.render();
	}

	private cacheArticles() {
		const container = document.getElementById("post-list-container");
		if (!container) return;

		this.articles = Array.from(container.querySelectorAll("article"));
	}

	private loadState() {
		const saved = localStorage.getItem("post-sort-state");
		if (saved) {
			try {
				const state = JSON.parse(saved);
				this.currentSort = state.type || "date";
				this.currentOrder = state.order || "desc";
			} catch (e) {
				// ignore
			}
		}
	}

	private saveState() {
		const state = {
			type: this.currentSort,
			order: this.currentOrder,
		};
		localStorage.setItem("post-sort-state", JSON.stringify(state));
	}

	private bindEvents() {
		document.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;

			const sortBtn = target.closest("[data-sort-type]");
			if (sortBtn) {
				e.preventDefault();
				const type = sortBtn.getAttribute("data-sort-type") as SortType;
				this.setSort(type);
				return;
			}

			const orderBtn = target.closest("[data-sort-order]");
			if (orderBtn) {
				e.preventDefault();
				this.toggleOrder();
				return;
			}
		});
	}

	private setSort(type: SortType) {
		if (this.currentSort !== type) {
			this.currentSort = type;
			this.saveState();
			this.render();
		}
	}

	private toggleOrder() {
		this.currentOrder = this.currentOrder === "asc" ? "desc" : "asc";
		this.saveState();
		this.render();
	}

	private getSortedIndices(): number[] {
		const indices = this.posts.map((_, i) => i);

		indices.sort((i, j) => {
			const a = this.posts[i];
			const b = this.posts[j];

			if (this.currentSort === "date") {
				// 置顶优先
				if (a.pinned !== b.pinned) {
					return a.pinned ? -1 : 1;
				}
				const dateA = new Date(a.published).getTime();
				const dateB = new Date(b.published).getTime();
				return this.currentOrder === "desc" ? dateB - dateA : dateA - dateB;
			} else {
				const cmp = a.title.localeCompare(b.title, "zh-CN");
				return this.currentOrder === "desc" ? -cmp : cmp;
			}
		});

		return indices;
	}

	private render() {
		const container = document.getElementById("post-list-container");
		if (!container || this.articles.length === 0) return;

		const sortedIndices = this.getSortedIndices();

		// 添加过渡效果
		container.style.opacity = "0.6";
		container.style.transition = "opacity 0.2s";

		setTimeout(() => {
			// 按新顺序重新插入 DOM
			sortedIndices.forEach((index) => {
				if (this.articles[index]) {
					container.appendChild(this.articles[index]);
				}
			});

			container.style.opacity = "1";
		}, 100);

		this.updateSortControls();
	}

	private updateSortControls() {
		const dateBtn = document.querySelector('[data-sort-type="date"]');
		const alphaBtn = document.querySelector('[data-sort-type="alpha"]');
		const orderBtn = document.querySelector("[data-sort-order]");

		if (dateBtn && alphaBtn) {
			dateBtn.classList.toggle("active", this.currentSort === "date");
			alphaBtn.classList.toggle("active", this.currentSort === "alpha");
		}

		if (orderBtn) {
			const icon = orderBtn.querySelector("svg");
			const text = orderBtn.querySelector("span");
			if (icon) {
				icon.classList.toggle("rotate-180", this.currentOrder === "asc");
			}
			if (text) {
				text.textContent = this.currentOrder === "desc" ? "倒序" : "正序";
			}
		}
	}
}

// 初始化
if (typeof window !== "undefined") {
	document.addEventListener("DOMContentLoaded", () => {
		new PostListManager();
	});
}
