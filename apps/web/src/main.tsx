import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import 'virtual:uno.css';
import { App } from './App';
import './styles/main.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
