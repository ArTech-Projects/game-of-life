/**
 * Tiny DOM helpers for the shell. No virtual DOM, no frameworks.
 * User-supplied strings always go through textContent.
 */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = value; // static templates only
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }

  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  if (node) node.replaceChildren();
  return node;
}

export function fragment(...children) {
  const frag = document.createDocumentFragment();
  append(frag, children);
  return frag;
}

export function img(src, alt = '', className = '') {
  return el('img', { src, alt, class: className, decoding: 'async' });
}

/**
 * True when an icon value should render as an image rather than text/emoji.
 * Supports bundled `icons/...` paths and compressed `data:image/...` uploads.
 */
export function isImageSource(value) {
  const source = String(value ?? '').trim();
  return /^data:image\//i.test(source) || /^(?:\.\/)?icons\//i.test(source);
}

/** Render an icon value as an <img> when possible, else a text/emoji fallback. */
export function iconNode(value, { alt = '', className = '', fallback = '' } = {}) {
  if (isImageSource(value)) return img(value, alt, className);
  return el('span', { class: className, text: String(value ?? fallback) });
}

/** Gold progress bar used by the HUD and preview cards. */
export function progressBar(percent, { tone = 'gold', label = '' } = {}) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return el(
    'div',
    {
      class: `track track--${tone}`,
      role: 'progressbar',
      'aria-valuenow': value,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-label': label || undefined,
    },
    el('span', { class: 'track__fill', style: { width: `${value}%` } }),
  );
}
