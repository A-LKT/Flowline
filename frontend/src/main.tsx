import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { installApiAuth } from './utils/apiAuth';
import { AuthGate } from './components/AuthGate';

// Attach the stored API token to every fetch/EventSource before anything else
// runs. AuthGate verifies it (prompting if needed), loads persisted data, and
// then renders the app.
installApiAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
