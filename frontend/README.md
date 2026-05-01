# 💻 VaultSphere Frontend

The frontend of VaultSphere is a modern, high-performance React application designed for security and a premium user experience.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file in this directory based on the example:
   ```bash
   cp .env.example .env
   ```

3. **Development Mode**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   ```

## 🎨 UI/UX Features
- **Glassmorphism**: A modern, translucent UI style that feels premium.
- **Adaptive Side-Nav**: A unique navigation system that collapses to icons on desktop and uses an ultra-compact icon bar on mobile.
- **Interactive States**: Every button and card features smooth, spring-based animations using Framer Motion.
- **Security Indicator**: Real-time visual feedback for MFA and encryption status.

## 🧪 Technology Highlights
- **Vite**: Ultra-fast HMR (Hot Module Replacement).
- **TypeScript**: Full type-safety for API and component interactions.
- **SASS**: Structured styling using variables and media queries for total responsiveness.

## 📁 Architecture
- `src/components`: UI components (Auth, Vault, Modals, etc.)
- `src/hooks`: Custom React hooks (useVault, useAuth)
- `src/lib`: Core utility libraries (API client, Crypto utils)
- `src/styles`: SCSS design system

## 🛡️ Security Note
All sensitive file operations (encryption/decryption) are handled in `src/lib/utils/crypto.ts` using the browser's native Web Crypto API. No plain-text data ever leaves the client.
