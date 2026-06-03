import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

export const Icons = {
	cursor: (p: IconProps) => (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" {...p}>
			<path d="M5 12 L11 12 M11 7 L11 17" />
		</svg>
	),
	chevron: (p: IconProps) => (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" {...p}>
			<path d="M9 6 L15 12 L9 18" />
		</svg>
	),
	edit: (p: IconProps) => (
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
			<path d="M4 20 L4 16 L16 4 L20 8 L8 20 Z" />
			<path d="M13 7 L17 11" />
		</svg>
	),
	refresh: (p: IconProps) => (
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
			<path d="M3 12 a9 9 0 1 0 3-6.7" />
			<path d="M3 4 V10 H9" />
		</svg>
	),
	cal: (p: IconProps) => (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
			<rect x="3" y="5" width="18" height="16" rx="1.5" />
			<path d="M3 10 H21 M8 3 V7 M16 3 V7" />
		</svg>
	),
	check: (p: IconProps) => (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" {...p}>
			<path d="M5 12 L10 17 L19 7" />
		</svg>
	),
	checkBox: (p: IconProps) => (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
			<rect x="4" y="4" width="16" height="16" rx="1.5" />
			<path d="M9 12 L11 14 L15 10" />
		</svg>
	),
	arrowUp: (p: IconProps) => (
		<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" {...p}>
			<path d="M12 4 L20 14 H14 V20 H10 V14 H4 Z" />
		</svg>
	),
	arrowDown: (p: IconProps) => (
		<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" {...p}>
			<path d="M12 20 L4 10 H10 V4 H14 V10 H20 Z" />
		</svg>
	),
	bolt: (p: IconProps) => (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" {...p}>
			<path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" />
		</svg>
	),
	flame: (p: IconProps) => (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" {...p}>
			<path d="M12 2 C 14 7 18 8 18 14 a6 6 0 1 1 -12 0 c0 -3 2 -4 3 -7 c1 2 2 2 3 0 c0 -2 0 -4 0 -5z" />
		</svg>
	),
	search: (p: IconProps) => (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
			<circle cx="11" cy="11" r="6" />
			<path d="M20 20 L16 16" />
		</svg>
	),
	x: (p: IconProps) => (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" {...p}>
			<path d="M6 6 L18 18 M18 6 L6 18" />
		</svg>
	),
};
