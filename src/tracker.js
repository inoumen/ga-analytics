import { isInteractive, resolveElement } from './elementResolver.js';
import { extractMetadata } from './metadata.js';
import { sendEvent } from './analytics.js';

/** @typedef {Record<string, string|number|boolean>} Metadata */
/** @typedef {{target: EventTarget|null, path: EventTarget[], timeStamp: number}} ClickSnapshot */
/**
 * @typedef {Object} TrackerOptions
 * @property {string} [eventName='element_click'] GA4 event name.
 * @property {string} [attribute='data-track'] Explicit developer-owned marker.
 * @property {boolean} [enabled=true] Whether start may attach the listener.
 * @property {() => boolean} [hasConsent] Must return true to track; defaults to false.
 * @property {(element: Element) => boolean} [matchElement] Replaces native matching; explicit markers still win.
 * @property {(element: Element, snapshot: ClickSnapshot) => Metadata} [getMetadata] Additional fields, overriding defaults. Must not expose personal data.
 * @property {(callback: () => void) => (() => void)} [schedule] Schedule asynchronously and return a cancellation function.
 * @property {(error: unknown) => void} [onError] Receives processing, scheduling, or consent errors.
 * @property {Document} [document] Document to observe; defaults to the global document.
 */

/** Create an inert tracker. Configuration is fixed for its lifetime.
 * @param {TrackerOptions} [options]
 * @returns {{start: () => void, stop: () => void}}
 */
export function createTracker(options = {}) {
  const {
    eventName = 'element_click', attribute = 'data-track', enabled = true,
    hasConsent = () => false, matchElement = isInteractive,
    getMetadata = () => ({}), onError = () => {},
    document: doc = globalThis.document,
    schedule = (callback) => {
      const timer = setTimeout(callback, 0);
      return () => clearTimeout(timer);
    },
  } = options;
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(eventName)) {
    throw new TypeError('eventName must be a GA4 event name of at most 40 characters.');
  }
  if (!/^data-[a-z0-9_.:-]+$/.test(attribute)) {
    throw new TypeError('attribute must be a lowercase data-* attribute.');
  }
  let active = false;
  const pending = new Set();
  const report = (error) => {
    try { onError(error); } catch { /* Analytics must not break the host page. */ }
  };
  const consent = () => {
    try { return hasConsent() === true; } catch (error) { report(error); return false; }
  };

  // This scope has no Event reference for the deferred callback to retain.
  const enqueue = (snapshot) => {
    const job = { cancel: () => {} };
    pending.add(job);
    try {
      job.cancel = schedule(() => {
        if (!pending.delete(job) || !active || !consent()) return;
        try {
          const element = resolveElement(snapshot, attribute, matchElement);
          if (!element) return;
          const metadata = {
            ...extractMetadata(element, attribute, doc),
            ...getMetadata(element, snapshot),
          };
          // Hooks may revoke consent or stop the tracker while processing.
          if (active && consent()) sendEvent(doc.defaultView, eventName, metadata);
        } catch (error) { report(error); }
      });
    } catch (error) {
      pending.delete(job);
      report(error);
    }
  };

  const capture = (event) => {
    if (!active || !consent()) return;
    enqueue({
      target: event.target,
      path: typeof event.composedPath === 'function' ? event.composedPath() : [],
      timeStamp: event.timeStamp,
    });
  };

  return {
    start() {
      if (active || !enabled) return;
      if (!doc?.addEventListener) throw new TypeError('A document is required to start tracking.');
      doc.addEventListener('click', capture, { capture: true, passive: true });
      active = true;
    },
    stop() {
      if (!active) return;
      active = false;
      doc.removeEventListener('click', capture, true);
      const jobs = [...pending];
      pending.clear();
      for (const job of jobs) {
        try { job.cancel(); } catch (error) { report(error); }
      }
    },
  };
}
