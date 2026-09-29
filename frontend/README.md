# VahanGrid Frontend

> React 19 + Vite web client for the VahanGrid unified EV charging platform.

**Status: Phase 3C.1 Complete — Frontend Authentication Integration**

---

## 1. Authentication Architecture (Phase 3C.1)

Authentication connects the React client to the Express + PostgreSQL backend using secure **HTTP-only cookie JWTs**.

```
React Frontend (Vite)
  │
  ├─ AuthProvider (React Context)
  │    └─ Initial GET /api/v1/auth/me (credentials: "include")
  │
  ├─ authService.js
  │    ├─ register({ name, email, phone, password })
  │    ├─ login({ email, password })
  │    ├─ logout()
  │    └─ getCurrentUser()
  │
  └─ HTTP Requests (fetch with credentials: "include")
       ↓
Express Backend + PostgreSQL
  └─ Set-Cookie: vg_token=<JWT>; HttpOnly; Secure; SameSite=Lax; Path=/
```

### Security Guarantees:
- **No JavaScript Token Storage**: The JWT is never stored in `localStorage`, `sessionStorage`, cookies created via JavaScript, or React state.
- **XSS Protection**: Because the cookie has the `HttpOnly` flag, malicious JavaScript cannot inspect or exfiltrate the authentication token.
- **Credentials Inclusion**: Every authenticated request passes `credentials: "include"`.
- **Session Persistence**: On browser refresh or page reload, the browser automatically transmits the cookie in the background to `GET /api/v1/auth/me`, restoring the user's active session without requiring re-login.

---

## 2. Using Authentication in Components

Wrap your application in `AuthProvider` (already configured in `src/main.jsx`):

```jsx
import { AuthProvider } from './context/AuthContext';

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
```

Consume user identity and authentication actions in any component via `useAuth()`:

```jsx
import { useAuth } from '../context/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, loading, login, register, logout } = useAuth();

  if (loading) {
    return <div>Connecting to VahanGrid...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please sign in</div>;
  }

  return (
    <div>
      <p>Welcome back, {user.name} ({user.email})</p>
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}
```

---

## 3. Protected UI & Guest Mode

- **Protected Pages**: `Dashboard`, `Charging Hub`, `VahanPass Wallet`, `Session History`, and `Driver Profile` require authentication.
- **Guest Station Exploration**: Unauthenticated visitors can view public charging stations and the interactive map in guest mode.
- **Accessing Protected Actions**: Initiating a charge, booking a slot, or navigating to account settings automatically presents the sign-in / registration portal.

---

## 4. Development & Build

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build
```
