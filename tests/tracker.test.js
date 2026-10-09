import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTracker } from '../src/index.js';

let trackers;
const start = (options = {}) => {
  const tracker = createTracker({ hasConsent: () => true, ...options });
  trackers.push(tracker);
  tracker.start();
  return tracker;
};
const click = (element = document.querySelector('span')) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
const payload = () => window.gtag.mock.calls[0][2];
beforeEach(() => {
  vi.useFakeTimers();
  trackers = [];
  document.body.innerHTML = '<button id="signup-button" data-track="signup"><span>Private text</span></button>';
  window.gtag = vi.fn();
});
afterEach(() => {
  trackers.forEach((tracker) => tracker.stop());
  vi.useRealTimers();
  delete window.gtag;
});

it('defers matching, extraction, and GA4 delivery for nested clicks', () => {
  const getMetadata = vi.fn(() => ({ placement: 'hero' }));
  const matchElement = vi.fn((element) => element.localName === 'button');
  start({ getMetadata, matchElement });
  click();
  expect(matchElement).not.toHaveBeenCalled();
  expect(getMetadata).not.toHaveBeenCalled();
  expect(window.gtag).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledExactlyOnceWith('event', 'element_click', {
    element_type: 'button', element_id: 'signup-button', element_name: 'signup',
    element_identifier: 'signup', page_path: '/pricing', placement: 'hero',
  });
});
it('tracks dynamic native controls and ignores plain content', () => {
  start();
  const button = document.createElement('button');
  document.body.append(button);
  click(button);
  click(document.body);
  vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(1);
  expect(payload().element_identifier).toBe('button');
});
it('prioritizes explicit ancestors over unmarked controls', () => {
  document.body.innerHTML = '<section data-track="checkout"><button><span>Buy</span></button></section>';
  start(); click(); vi.runAllTimers();
  expect(payload().element_name).toBe('checkout');
});
it('retains the original path after target and ancestor removal', () => {
  start();
  const span = document.querySelector('span');
  const button = span.parentElement;
  button.addEventListener('click', () => { span.remove(); button.remove(); });
  click(span); vi.runAllTimers();
  expect(payload().element_id).toBe('signup-button');
});
it('reads metadata at processing time', () => {
  start(); click();
  document.querySelector('button').setAttribute('data-track', 'changed');
  vi.runAllTimers();
  expect(payload().element_name).toBe('changed');
});
it('resolves open shadow roots; closed roots expose only their host', () => {
  start();
  for (const mode of ['open', 'closed']) {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode });
    shadow.innerHTML = '<button data-track="shadow"><span>Icon</span></button>';
    click(shadow.querySelector('span'));
  }
  vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(1);
  expect(payload().element_name).toBe('shadow');
});
it('captures clicks even when bubbling stops', () => {
  start();
  document.querySelector('button').addEventListener('click', (event) => event.stopPropagation());
  click(); vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(1);
});
it('falls back to current ancestry without composedPath', () => {
  start();
  const event = new MouseEvent('click', { bubbles: true });
  Object.defineProperty(event, 'composedPath', { value: undefined });
  document.querySelector('span').dispatchEvent(event);
  vi.runAllTimers();
  expect(payload().element_name).toBe('signup');
});
it('defaults to denied consent without queueing', () => {
  start({ hasConsent: undefined }); click();
  expect(vi.getTimerCount()).toBe(0);
  expect(window.gtag).not.toHaveBeenCalled();
});
it('rechecks queued consent and allows future grants', () => {
  let granted = true;
  start({ hasConsent: () => granted }); click();
  granted = false; vi.runAllTimers();
  expect(window.gtag).not.toHaveBeenCalled();
  granted = true; click(); vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(1);
});
it('makes start/stop idempotent and cancels work across restarts', () => {
  const tracker = start(); tracker.start(); click(); vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(1);
  click(); tracker.stop(); tracker.stop();
  expect(vi.getTimerCount()).toBe(0);
  click(); tracker.start(); vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(1);
  click(); vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(2);
});
it('honors enabled false', () => {
  start({ enabled: false }); click();
  expect(vi.getTimerCount()).toBe(0);
});
it('handles missing gtag and discovers later installation', () => {
  start(); delete window.gtag; click();
  expect(() => vi.runAllTimers()).not.toThrow();
  window.gtag = vi.fn(); click(); vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(1);
});
it('fails closed on consent errors and isolates hook errors', () => {
  const onError = vi.fn();
  const tracker = start({ hasConsent: () => { throw Error('consent'); }, onError });
  click(); expect(onError).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0); tracker.stop();
  start({ getMetadata: () => { throw Error('metadata'); }, onError });
  click(); expect(() => vi.runAllTimers()).not.toThrow();
  expect(onError).toHaveBeenCalledTimes(2);
  expect(window.gtag).not.toHaveBeenCalled();
});
it('supports custom attributes, event names, and matching', () => {
  document.body.innerHTML = '<x-action data-analytics="save"></x-action><div class="action"></div>';
  start({ attribute: 'data-analytics', eventName: 'custom_click', matchElement: (el) => el.classList.contains('action') });
  click(document.querySelector('x-action')); click(document.querySelector('.action')); vi.runAllTimers();
  expect(window.gtag).toHaveBeenCalledTimes(2);
  expect(window.gtag.mock.calls[0][1]).toBe('custom_click');
  expect(payload().element_name).toBe('save');
});
it.each(['button', 'checkbox', 'link', 'tab', 'switch'])('recognizes ARIA %s', (role) => {
  document.body.innerHTML = `<div role="${role}"><span>Icon</span></div>`;
  start(); click(); vi.runAllTimers();
  expect(payload().element_type).toBe('div');
});
it('excludes values, text, labels, and arbitrary attributes', () => {
  document.body.innerHTML = '<input type="password" value="secret" aria-label="private" data-email="private@example.com"><textarea>secret</textarea>';
  start(); click(document.querySelector('input')); click(document.querySelector('textarea')); vi.runAllTimers();
  expect(payload()).toEqual({ element_type: 'input', element_identifier: 'input', page_path: '/pricing' });
  expect(JSON.stringify(window.gtag.mock.calls)).not.toMatch(/secret|private/);
});
it.each([
  ['https://user:pass@example.org/guide?token=secret#private', 'https://example.org/guide'],
  ['/guide?token=secret#private', 'https://example.com/guide'],
  ['mailto:private@example.org', undefined], ['tel:12345', undefined], ['javascript:void(0)', undefined],
])('sanitizes destination %s', (href, expected) => {
  const link = document.createElement('a'); link.href = href;
  link.addEventListener('click', (event) => event.preventDefault());
  document.body.append(link); start(); click(link); vi.runAllTimers();
  expect(payload().link_url).toBe(expected);
});
it('guards against stale custom scheduler callbacks', () => {
  let callback;
  const cancel = vi.fn();
  const tracker = start({ schedule: (task) => { callback = task; return cancel; } });
  click(); tracker.stop(); tracker.start(); callback();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(window.gtag).not.toHaveBeenCalled();
});
