const interactive = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="textbox"]';

/** @param {Element} element */
export function isInteractive(element) {
  return element.matches(interactive);
}

/** Resolve only along the original event path; explicit markers take priority.
 * @param {{target: EventTarget|null, path: EventTarget[]}} snapshot
 * @param {string} attribute
 * @param {(element: Element) => boolean} matchElement
 * @returns {Element|null}
 */
export function resolveElement(snapshot, attribute, matchElement) {
  let nearest = null;
  const consider = (node) => {
    if (node?.nodeType !== 1) return null;
    if (node.hasAttribute(attribute)) return node;
    if (!nearest && matchElement(node)) nearest = node;
    return null;
  };
  if (snapshot.path.length) {
    for (const node of snapshot.path) {
      const marked = consider(node);
      if (marked) return marked;
    }
  } else {
    // Older environments without composedPath can only use the current ancestry.
    let node = snapshot.target;
    while (node) {
      const marked = consider(node);
      if (marked) return marked;
      node = node.parentNode || node.host;
    }
  }
  return nearest;
}
