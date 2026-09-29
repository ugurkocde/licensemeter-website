/**
 * Wraps every markdown table in <div class="table-wrap">, so the wrapper can carry the rounded border
 * and horizontal scrolling while the table itself keeps full width.
 */
export default function rehypeTableWrap() {
	const walk = (node) => {
		if (!node.children) return;
		node.children = node.children.map((child) => {
			if (child.type === 'element' && child.tagName === 'table') {
				return {
					type: 'element',
					tagName: 'div',
					properties: { className: ['table-wrap'] },
					children: [child],
				};
			}
			walk(child);
			return child;
		});
	};
	return (tree) => walk(tree);
}
