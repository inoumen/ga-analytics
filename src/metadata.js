/** Extract an allowlist of developer-controlled metadata, never text or values.
 * @param {Element} element
 * @param {string} attribute
 * @param {Document} document
 * @returns {Record<string, string>}
 */
export function extractMetadata(element, attribute, document) {
  const tag = element.localName;
  const id = element.getAttribute('id');
  const name = element.getAttribute(attribute);
  const metadata = {
    element_type: tag,
    element_identifier: name || id || tag,
    page_path: document.location?.pathname || '/',
  };
  if (id) metadata.element_id = id;
  if (name) metadata.element_name = name;
  if ((tag === 'a' || tag === 'area') && element.hasAttribute('href')) {
    try {
      const url = new URL(element.getAttribute('href'), document.baseURI);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        metadata.link_url = url.origin + url.pathname;
      }
    } catch { /* Malformed destinations are omitted. */ }
  }
  return metadata;
}
