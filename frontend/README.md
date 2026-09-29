# VahanGrid Frontend

> React 19 + Vite web client for the VahanGrid unified EV charging platform.

**Status: Phase 3C.2 Complete — Frontend Vehicle Integration**

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

## 2. Vehicle Integration (Phase 3C.2)

Vehicle management connects to the real PostgreSQL-backed REST API:

- `GET    /api/v1/vehicles` — List user's registered vehicles
- `POST   /api/v1/vehicles` — Add a new EV to account
- `GET    /api/v1/vehicles/:id` — Get single vehicle details
- `PATCH  /api/v1/vehicles/:id` — Update vehicle specifications
- `DELETE /api/v1/vehicles/:id` — Remove vehicle from account

All requests use `credentials: "include"`. Mock `VEHICLES` data has been completely eliminated from the frontend. Empty, loading, and error states are handled gracefully.

---

## 3. Using Services in Components

### Authentication
```jsx
import { useAuth } from '../context/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, loading, login, register, logout } = useAuth();
  ...
}
```

### Vehicles
```jsx
import { vehicleService } from '../services/vehicleService';

// Fetch vehicles
const vehicles = await vehicleService.getVehicles();

// Create vehicle
const newVehicle = await vehicleService.createVehicle({
  manufacturer: 'Tata',
  model: 'Nexon EV Max',
  battery_capacity_kwh: 40.5,
  connector_type: 'CCS2',
});

// Update vehicle
await vehicleService.updateVehicle(vehicleId, { variant: 'Dark Edition' });

// Delete vehicle
await vehicleService.deleteVehicle(vehicleId);
```

---

## 4. Protected UI & Guest Mode

- **Protected Pages**: `Dashboard`, `Charging Hub`, `VahanPass Wallet`, `Session History`, and `Driver Profile` require authentication.
- **Guest Station Exploration**: Unauthenticated visitors can view public charging stations and the interactive map in guest mode.
- **Accessing Protected Actions**: Initiating a charge, booking a slot, or navigating to account settings automatically presents the sign-in / registration portal.

---

## 5. Development & Build

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build
```
