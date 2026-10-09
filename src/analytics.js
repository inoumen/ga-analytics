/** Send only when the host has already installed gtag; no queue or initialization.
 * @param {Window|null} view
 * @param {string} eventName
 * @param {Record<string, string|number|boolean>} metadata
 * @returns {boolean}
 */
export function sendEvent(view, eventName, metadata) {
  if (typeof view?.gtag !== 'function') return false;
  view.gtag('event', eventName, metadata);
  return true;
}
