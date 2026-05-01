# 🔒 BlindLock

**BlindLock** is a production-grade, zero-knowledge, secure file storage and vault management system. Built for privacy and speed, it leverages modern cryptographic standards and distributed cloud infrastructure to provide a "Secure-by-Design" experience.

![VaultSphere Banner](https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=1200)

## 🚀 Core Philosophy
VaultSphere is built on the principle of **Zero-Knowledge Security**. Every piece of sensitive data—whether it's a folder name, a file, or a security audit log—is protected by multi-layered encryption. Even the server administrators cannot access your vaulted assets.

## ✨ Key Features
- **Zero-Knowledge Architecture**: Client-side encryption ensures only you hold the keys.
- **Advanced MFA**: Built-in support for Microsoft Authenticator and standard TOTP protocols.
- **Brute Force Protection**: Intelligent rate-limiting and automatic account lockout.
- **Security Auditing**: Real-time logging of all security events (logins, failed attempts, file access).
- **Dead Man Switch**: Automatic asset recovery/notification system for trusted contacts.
- **Ultra-Responsive UI**: A premium, glassmorphic interface that adapts perfectly to mobile, tablet, and desktop.
- **Distributed Power**: Backend powered by Cloudflare Workers (Edge Computing) for near-zero latency.

## 🛠️ Technology Stack
### Frontend
- **React 18** + **TypeScript**
- **Framer Motion** (High-end animations)
- **Lucide React** (Iconography)
- **SASS** (BEM-architected styles)
- **Vite** (Next-gen build tool)

### Backend
- **Cloudflare Workers** (Serverless Edge)
- **Cloudflare D1** (SQL Database)
- **Cloudflare R2** (Object Storage)
- **Web Crypto API** (Standardized cryptography)
- **JWT** (Stateless authentication)

## 📂 Project Structure
```text
.
├── frontend/          # Vite-React application
├── backend/           # Cloudflare Worker & D1 Migrations
└── LICENSE            # MIT License
```

## 🛠️ Getting Started
To get started with VaultSphere, follow the setup instructions in each sub-directory:
- [Backend Setup Guide](./backend/README.md)
- [Frontend Setup Guide](./frontend/README.md)

## 🛡️ Security Posture
VaultSphere implements:
- **AES-GCM** for file encryption.
- **PBKDF2** for key derivation.
- **HS256** for session integrity.
- **Secure-Only Cookies** and **Strict CORS** policies.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Built with ❤️ by the BlindLock Team.
