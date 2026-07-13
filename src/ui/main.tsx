import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('index.html is missing the #root element');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
