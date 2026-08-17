// Minimal DOM helpers. Screens build markup as strings and hand back one root node —
// no framework, no virtual DOM, matching how the web app already works.

export const esc = s => {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
};

// Wrap an HTML string in a single element and return it.
export const h = (html, tag = 'div', cls = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.innerHTML = html;
  return node;
};
