import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { installApiAuth } from './utils/apiAuth';
import { AuthGate } from './components/AuthGate';

// Install the global 401 interceptor before anything else runs. AuthGate then
// verifies the session (showing the login screen if needed), loads persisted
// data, and renders the app. The session itself rides in an httpOnly cookie the
// browser sends automatically, so there is no token to attach here.
installApiAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
