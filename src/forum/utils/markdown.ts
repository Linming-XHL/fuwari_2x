import MarkdownIt from "markdown-it";
import { parse as parseHtml } from "node-html-parser";
import sanitizeHtml from "sanitize-html";
import { createHighlighter } from "shiki";

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

async function getHighlighter() {
	if (!highlighter) {
		highlighter = await createHighlighter({
			themes: ["github-dark"],
			langs: [
				"javascript",
				"typescript",
				"python",
				"bash",
				"json",
				"html",
				"css",
				"yaml",
				"markdown",
				"go",
				"rust",
				"java",
				"c",
				"cpp",
				"csharp",
				"php",
				"ruby",
				"swift",
				"sql",
				"dockerfile",
				"nginx",
				"toml",
				"xml",
				"graphql",
				"lua",
				"powershell",
				"ini",
			],
		});
	}
	return highlighter;
}

const markdown = MarkdownIt({
	html: false,
	linkify: true,
	breaks: true,
});

const sanitizeOptions: sanitizeHtml.IOptions = {
	allowedTags: sanitizeHtml.defaults.allowedTags.concat([
		"img",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"pre",
		"code",
		"blockquote",
		"hr",
		"table",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
	]),
	allowedAttributes: {
		...sanitizeHtml.defaults.allowedAttributes,
		a: ["href", "name", "target", "rel"],
		img: ["src", "alt", "title", "loading", "referrerpolicy"],
		code: ["class"],
	},
	allowedSchemes: ["http", "https", "mailto"],
};

function applyExternalLinkTarget(htmlText: string): string {
	const root = parseHtml(htmlText);
	for (const anchor of root.querySelectorAll("a")) {
		const href = anchor.getAttribute("href")?.trim();
		if (!href || !/^https?:\/\//i.test(href)) {
			continue;
		}
		anchor.setAttribute("target", "_blank");
		anchor.setAttribute("rel", "noopener noreferrer");
	}
	return root.toString();
}

async function highlightCodeBlocks(htmlText: string): Promise<string> {
	const root = parseHtml(htmlText);
	const codeBlocks = root.querySelectorAll("pre code");

	for (const codeBlock of codeBlocks) {
		const codeEl = codeBlock as { rawText?: string; textContent?: string };
		const rawCode = codeEl.rawText || codeEl.textContent || "";
		const className = codeBlock.getAttribute("class") || "";
		const langMatch = className.match(/language-(\w+)/);
		const lang = langMatch ? langMatch[1].toLowerCase() : "";

		if (!lang) {
			continue;
		}

		try {
			const hl = await getHighlighter();
			const loadedLangs = hl.getLoadedLanguages();
			if (!loadedLangs.includes(lang)) {
				continue;
			}

			const highlightedHtml = hl.codeToHtml(rawCode, {
				lang,
				theme: "github-dark",
			});

			const highlightedRoot = parseHtml(highlightedHtml);
			const newPre = highlightedRoot.querySelector("pre");
			if (newPre) {
				const parent = codeBlock.parentNode;
				if (parent) {
					parent.replaceWith(newPre);
				}
			}
		} catch {
			// 忽略高亮失败，保留原样
		}
	}

	return root.toString();
}

export async function renderForumMarkdown(
	markdownText?: string,
): Promise<string> {
	if (!markdownText) {
		return "";
	}

	const renderedHtml = markdown.render(markdownText);
	const sanitizedHtml = sanitizeHtml(renderedHtml, sanitizeOptions);
	const htmlWithTargets = applyExternalLinkTarget(sanitizedHtml);
	return highlightCodeBlocks(htmlWithTargets);
}

export function extractFirstImageUrlFromMarkdown(
	markdownText?: string,
): string | undefined {
	if (!markdownText) {
		return undefined;
	}

	const renderedHtml = markdown.render(markdownText);
	const sanitizedHtml = sanitizeHtml(renderedHtml, sanitizeOptions);
	const htmlWithTargets = applyExternalLinkTarget(sanitizedHtml);

	const html = parseHtml(htmlWithTargets);
	return html.querySelector("img")?.getAttribute("src") || undefined;
}
