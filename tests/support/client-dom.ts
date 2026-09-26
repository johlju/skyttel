// jsdom has no layout. Keep real focus scrolling in Chromium and integration tests.
if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value() {},
  });
}
