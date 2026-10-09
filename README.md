# Vanilla JavaScript Event Tracker

Lightweight, framework-agnostic Google Analytics click tracker built with vanilla JavaScript. Features centralized event delegation, deferred DOM processing, and automatic interaction tracking.

Zero runtime dependencies, ES modules, JSDoc editor hints, and an MIT license. Works with dynamically rendered DOM without a MutationObserver.

## Installation and demo

Clone this repository, then run:

```sh
npm install
npm test
npm run demo
```

Open `http://127.0.0.1:5173/examples/`. The demo uses a local `gtag` stub; nothing is sent to Google. Development tools require Node 22.12 or newer. The browser library uses ES2020+ JavaScript.

To integrate into a website, copy the entire [src](./src/) directory and import its entry point. Serve modules over HTTP, not `file://`. No build step is required. These instructions do not assume npm registry publication.

```html
<button id="signup-button" data-track="signup"><span>Sign up</span></button>
<script type="module">
  import { createTracker } from './src/index.js';
  const tracker = createTracker({
    eventName: 'element_click',
    attribute: 'data-track',
    enabled: true,
    hasConsent: () => window.analyticsConsent === true,
  });
  tracker.start();
  // On teardown: tracker.stop();
</script>
```

## Architecture

The public export is in [index.js](./src/index.js). [tracker.js](./src/tracker.js) manages lifecycle and scheduling; [elementResolver.js](./src/elementResolver.js), [metadata.js](./src/metadata.js), and [analytics.js](./src/analytics.js) handle resolution, extraction, and GA4 delivery.

1. One passive, capture-phase click listener on document checks consent and snapshots target, composed path, and timestamp. No DOM traversal or metadata extraction happens here.
2. `setTimeout(callback, 0)` schedules analysis in a subsequent task. The snapshot contains references, not the original Event.
3. The resolver scans the original path for the nearest explicit tracking marker. Otherwise it uses the nearest native control or interactive ARIA role.
4. Metadata is extracted, custom fields are merged, consent is rechecked, and the existing `gtag` function receives the event.

Delegation automatically covers nested icons and future DOM additions. Capture phase sees clicks before descendant handlers, including handlers that stop bubbling. An earlier window/document listener can still prevent capture. The tracker never prevents default browser behavior.

The captured path retains original ancestors even if application handlers remove or reparent nodes. A removed element can still be tracked. Attributes and page pathname are read at processing time, so changes made during dispatch are reflected. Without `composedPath()`, fallback resolution walks current ancestry and cannot recover detached ancestors. Processing is proportional to path depth, with no document-wide queries.

### Event loop behavior

A zero-delay timeout schedules a subsequent **task**, after the current JavaScript task finishes and its microtasks drain. It does not guarantee immediate execution, a paint first, or execution between rendering frames. Timer clamping, background throttling, and other work may delay execution.

Deferral moves analysis out of synchronous event dispatch. It does **not** eliminate main-thread blocking or reduce total work automatically. Keep custom hooks inexpensive. Promise callbacks and `queueMicrotask` do not create the same task boundary. An optional scheduler hook allows experiments while retaining `setTimeout` as the default.

## API

`createTracker(options)` creates an inactive tracker. `start()` and `stop()` are idempotent. Stop removes the listener and cancels pending work; restart is supported. Duplicate registration is prevented per instance: use one instance per document to avoid duplicate events. Options are fixed for the instance lifetime.

| Option | Default | Purpose |
| --- | --- | --- |
| `eventName` | `element_click` | Letter followed by letters, digits or underscores; at most 40 characters |
| `attribute` | `data-track` | Lowercase data attribute; presence opts in, value supplies a name |
| `enabled` | `true` | False makes start a no-op |
| `hasConsent` | `() => false` | Synchronous check, must return exactly true; errors deny consent |
| `matchElement` | Native controls and interactive ARIA roles | Replaces default matching; explicit markers still win |
| `getMetadata` | `() => ({})` | Synchronous `(element, snapshot)` hook; fields override defaults |
| `schedule` | Cancellable zero-delay timeout | `(callback) => cancel`; must defer asynchronously, invoke at most once, and release callback on cancellation |
| `onError` | No-op | Receives consent, scheduling, processing, or delivery errors |
| `document` | Global document | Optional alternate document |

Default matches include links with href, buttons, non-hidden inputs, selects, textareas, summaries, and common interactive ARIA roles. Explicit ancestor markers take priority over unmarked nested controls, allowing component-level identity. Among marked ancestors, the nearest wins. Blank markers opt in but identity falls back to ID or tag.

```js
const tracker = createTracker({
  attribute: 'data-analytics',
  eventName: 'navigation_click',
  hasConsent: () => consentManager.analyticsAllowed(),
  matchElement: (element) => element.matches('a[href], button, .custom-action'),
  getMetadata: (element) => ({
    placement: element.getAttribute('data-placement') || 'unspecified',
    site_variant: 'portfolio',
  }),
  onError: (error) => console.warn('Click tracking failed', error),
});
tracker.start();
```

The snapshot passed to metadata hooks contains `target`, `path`, and `timeStamp`. Hook exceptions drop the interaction and call `onError`; errors from `onError` are contained. Missing DOM is allowed during creation, but starting requires a document.

## GA4 integration

Install the Google tag separately through your usual consent-aware setup. The tracker never injects scripts, initializes a measurement ID, grants Google consent, or creates a queue. It looks up `document.defaultView.gtag` at delivery time. If absent, the event is dropped without retry.

A signup click on `/pricing` produces:

```js
gtag('event', 'element_click', {
  element_type: 'button',
  element_id: 'signup-button',
  element_name: 'signup',
  element_identifier: 'signup',
  page_path: '/pricing',
});
```

For links, `link_url` contains only HTTP(S) origin and pathname, excluding credentials, query strings, and fragments. Other schemes, including mailto and tel, are omitted. `element_identifier` uses tracking name, then ID, then tag. Tag fallback is deliberately coarse; stable developer-owned markers yield better reports without complex CSS selectors.

Verify real delivery using GA4 Realtime or DebugView. Register custom dimensions for parameters needed in reports. Follow Google's reserved event-name and parameter policies; local validation checks only basic event-name syntax.

**Enhanced Measurement can overlap:** outbound link clicks and file downloads may already generate GA4 events. Coordinate matching, names, and Enhanced Measurement settings to avoid double counting.

## Consent and privacy

Consent defaults to denied. Denied clicks are not queued or replayed after a grant. Consent is checked during capture, before processing, and immediately before sending; keep the check cheap and side-effect free. Configure Google's own consent settings separately.

Defaults never collect input values, passwords, text content, accessible labels, or arbitrary attributes. The allowlist contains tag, ID, explicit tracking name, sanitized destination, and page pathname. IDs, tracking names, and URL paths can themselves contain personal data: use controlled identifiers, exclude sensitive routes in your consent predicate, and override sensitive path fields through `getMetadata` where necessary. Custom hooks are responsible for their own privacy policy and GA4 parameter limits.

Google's installed tag may independently attach page location or other context. Sanitize its configuration separately; this library's URL handling does not sanitize other Google collection.

## Limitations and trade-offs

- Navigation or teardown can happen before deferred processing. Delivery is best effort, with no navigation delay, persistence, retry, or unload flush.
- Open Shadow DOM exposes its composed path. Closed roots hide internal elements; mark the host to track those clicks. Non-composed events do not cross shadow boundaries.
- Each iframe requires its own tracker. Cross-origin documents are inaccessible.
- Only clicks are observed, including keyboard-generated and synthetic clicks. Value changes, submissions, and non-click gestures are outside scope.
- Metadata and route state reflect deferred execution, not an immutable click-time snapshot. Exact click-time attributes require more synchronous work.
- Each consented click schedules one timer, even if later found irrelevant. References stay alive until processing or cancellation; large synthetic bursts can create timer pressure.
- Calling stop during dispatch cancels earlier queued work, including that click. Custom schedulers must honor the documented asynchronous cancellation contract.

## Tests

[Tests](./tests/tracker.test.js) use Vitest, jsdom, and fake timers to verify delegation, dynamic DOM, deferred extraction, removal, mutation, Shadow DOM, missing GA4, consent, lifecycle, custom attributes, matching, scheduling, and sensitive-data exclusion. jsdom does not model rendering or real navigation guarantees; the [browser demo](./examples/index.html) supports manual inspection.

## License

[MIT](./LICENSE)
