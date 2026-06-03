import * as React from "react";

/**
 * Minimal Markdown renderer for chat bubbles. Supports:
 * - Code blocks (```\n...\n``` and ```lang\n...\n```)
 * - Inline code (`...`)
 * - Bold (**...**)
 * - Italic (*...* and _..._)
 * - Headers (# ## ###)
 * - Unordered lists (- ... or * ...)
 * - Ordered lists (1. ...)
 * - Links ([text](url))
 *
 * No external deps. Defensive against malformed input.
 */

interface Block {
	type: "code" | "para" | "list-ul" | "list-ol" | "heading" | "quote";
	lang?: string;          // for code blocks
	level?: number;         // for headings
	content: string;
	items?: string[];       // for lists
}

function parseBlocks(text: string): Block[] {
	const blocks: Block[] = [];
	const lines = text.split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();

		// Code fence ```
		if (line.startsWith("```")) {
			const lang = line.slice(3).trim();
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
				codeLines.push(lines[i] ?? "");
				i++;
			}
			i++; // skip closing ```
			blocks.push({ type: "code", lang, content: codeLines.join("\n") });
			continue;
		}

		// Heading
		const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (hMatch !== null) {
			blocks.push({ type: "heading", level: (hMatch[1] ?? "#").length, content: hMatch[2] ?? "" });
			i++;
			continue;
		}

		// Quote
		if (trimmed.startsWith("> ")) {
			const quoteLines: string[] = [];
			while (i < lines.length && (lines[i] ?? "").trim().startsWith("> ")) {
				quoteLines.push((lines[i] ?? "").trim().slice(2));
				i++;
			}
			blocks.push({ type: "quote", content: quoteLines.join("\n") });
			continue;
		}

		// Unordered list
		if (trimmed.match(/^[-*]\s+/) !== null) {
			const items: string[] = [];
			while (i < lines.length && ((lines[i] ?? "").trim().match(/^[-*]\s+/) !== null)) {
				items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
				i++;
			}
			blocks.push({ type: "list-ul", content: "", items });
			continue;
		}

		// Ordered list
		if (trimmed.match(/^\d+\.\s+/) !== null) {
			const items: string[] = [];
			while (i < lines.length && ((lines[i] ?? "").trim().match(/^\d+\.\s+/) !== null)) {
				items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
				i++;
			}
			blocks.push({ type: "list-ol", content: "", items });
			continue;
		}

		// Empty line — end paragraph
		if (trimmed.length === 0) {
			i++;
			continue;
		}

		// Paragraph (collect until blank line or other block)
		const paraLines: string[] = [];
		while (
			i < lines.length &&
			(lines[i] ?? "").trim().length > 0 &&
			!(lines[i] ?? "").startsWith("```") &&
			!(lines[i] ?? "").trim().match(/^(#{1,6}\s|>\s|[-*]\s|\d+\.\s)/)
		) {
			paraLines.push(lines[i] ?? "");
			i++;
		}
		blocks.push({ type: "para", content: paraLines.join("\n") });
	}
	return blocks;
}

/** Renders inline markdown (bold, italic, inline-code, links) into React nodes. */
function renderInline(text: string, keyPrefix: string = ""): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	// Token-by-token scan
	let i = 0;
	let buffer = "";
	const flushText = (): void => {
		if (buffer.length > 0) {
			nodes.push(buffer);
			buffer = "";
		}
	};
	while (i < text.length) {
		const c = text[i];
		// Inline code `...`
		if (c === "`") {
			const end = text.indexOf("`", i + 1);
			if (end !== -1) {
				flushText();
				nodes.push(<code key={`${keyPrefix}c-${i}`}>{text.slice(i + 1, end)}</code>);
				i = end + 1;
				continue;
			}
		}
		// Bold **...**
		if (c === "*" && text[i + 1] === "*") {
			const end = text.indexOf("**", i + 2);
			if (end !== -1) {
				flushText();
				nodes.push(<strong key={`${keyPrefix}b-${i}`}>{renderInline(text.slice(i + 2, end), `${keyPrefix}b${i}.`)}</strong>);
				i = end + 2;
				continue;
			}
		}
		// Italic *...* or _..._
		if ((c === "*" || c === "_") && text[i + 1] !== c) {
			const ch = c;
			const end = text.indexOf(ch, i + 1);
			if (end !== -1 && end > i + 1) {
				const inner = text.slice(i + 1, end);
				// Avoid false-positives like a * b
				if (!inner.includes("\n") && inner.trim().length > 0 && !inner.startsWith(" ") && !inner.endsWith(" ")) {
					flushText();
					nodes.push(<em key={`${keyPrefix}i-${i}`}>{renderInline(inner, `${keyPrefix}i${i}.`)}</em>);
					i = end + 1;
					continue;
				}
			}
		}
		// Link [text](url)
		if (c === "[") {
			const closeBracket = text.indexOf("]", i + 1);
			if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
				const closeParen = text.indexOf(")", closeBracket + 2);
				if (closeParen !== -1) {
					flushText();
					const linkText = text.slice(i + 1, closeBracket);
					const url = text.slice(closeBracket + 2, closeParen);
					nodes.push(
						<a key={`${keyPrefix}l-${i}`} href={url} target="_blank" rel="noreferrer">
							{linkText}
						</a>
					);
					i = closeParen + 1;
					continue;
				}
			}
		}
		buffer += c;
		i++;
	}
	flushText();
	return nodes;
}

interface CodeBlockProps {
	lang: string;
	content: string;
}

function CodeBlock({ lang, content }: CodeBlockProps): JSX.Element {
	const [copied, setCopied] = React.useState(false);
	const copy = (): void => {
		try {
			navigator.clipboard.writeText(content);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch (_) { /* ignore */ }
	};
	return (
		<div className="md-codeblock">
			<div className="md-codeblock-header">
				<span className="md-codeblock-lang">{lang || "code"}</span>
				<button className="md-copy-btn" onClick={copy}>{copied ? "✓ kopiert" : "kopieren"}</button>
			</div>
			<pre><code>{content}</code></pre>
		</div>
	);
}

export function renderMarkdown(text: string): React.ReactNode {
	const blocks = parseBlocks(text);
	return (
		<div className="md-content">
			{blocks.map((b, i) => {
				switch (b.type) {
					case "code":
						return <CodeBlock key={i} lang={b.lang ?? ""} content={b.content} />;
					case "heading": {
						const level = Math.min(Math.max(b.level ?? 1, 1), 6);
						const className = `md-h md-h${level}`;
						if (level === 1) return <h1 key={i} className={className}>{renderInline(b.content, `${i}.`)}</h1>;
						if (level === 2) return <h2 key={i} className={className}>{renderInline(b.content, `${i}.`)}</h2>;
						if (level === 3) return <h3 key={i} className={className}>{renderInline(b.content, `${i}.`)}</h3>;
						return <h4 key={i} className={className}>{renderInline(b.content, `${i}.`)}</h4>;
					}
					case "list-ul":
						return (
							<ul key={i} className="md-list">
								{(b.items ?? []).map((it, j) => <li key={j}>{renderInline(it, `${i}.${j}.`)}</li>)}
							</ul>
						);
					case "list-ol":
						return (
							<ol key={i} className="md-list">
								{(b.items ?? []).map((it, j) => <li key={j}>{renderInline(it, `${i}.${j}.`)}</li>)}
							</ol>
						);
					case "quote":
						return <blockquote key={i} className="md-quote">{renderInline(b.content, `${i}.`)}</blockquote>;
					case "para":
					default:
						return <p key={i} className="md-para">{renderInline(b.content, `${i}.`)}</p>;
				}
			})}
		</div>
	);
}
