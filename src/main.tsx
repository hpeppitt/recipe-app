import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { installGlobalErrorReporting } from './services/telemetry';

// Installed before render, so a failure during the first render is caught too.
// That is the one most worth seeing and the one a beacon started inside a
// component would miss.
installGlobalErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
