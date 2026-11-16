import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// pdfjs-dist 4.x uses Promise.withResolvers. Chromium builds on older
// macOS versions may lack it; define the standard behaviour before a PDF
// module is dynamically imported. This does not enable unsupported browsers.
if (!('withResolvers' in Promise)) {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    },
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('App root was not found.');
createRoot(root).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
