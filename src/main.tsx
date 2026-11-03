import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Install the offline service worker in the real app build (not in dev or the single-page artifact).
if (import.meta.env.PROD && !import.meta.env.VITE_ARTIFACT && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is optional; the app still works online without it.
    });
  });
}
