import { FormEvent, useState, useEffect } from "react";
import { AuthIndicator } from "./AuthIndicator";
import { motion, AnimatePresence } from "framer-motion";
import { 
  KeyRound, 
  Lock, 
  Mail, 
  ShieldCheck, 
  Zap,
  ChevronRight,
  Eye,
  EyeOff,
  Share2,
  Activity,
  PlayCircle,
  ShieldAlert
} from "lucide-react";
import { Field } from "./Field";
import { useToast } from "./Toast";
import { authApi } from "../lib/api/auth";
import { getErrorMessage } from "../lib/utils/format";
import { Session } from "../types/domain";
import { PasswordResetFlow } from "./PasswordResetFlow";
import { APP_NAME, APP_NAME_UPPER, COMPANY_NAME } from "../lib/constants";

type AuthMode = "login" | "signup" | "verify" | "reset" | "mfa";

interface Errors {
  [key: string]: string;
}

const emptySignup = { email: "", mobile: "", password: "", confirmPassword: "" };
const emptyLogin = { email: "", password: "" };

export function AuthShell({ onLogin }: { onLogin: (session: Session, remember: boolean) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [signup, setSignup] = useState(emptySignup);
  const [login, setLogin] = useState(emptyLogin);
  const [rememberMe, setRememberMe] = useState(true);
  const [otp, setOtp] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [totpData, setTotpData] = useState<{ secret: string; url: string } | null>(null);
  const [mfaEmail, setMfaEmail] = useState("");
  
  const { showToast } = useToast();

  useEffect(() => {
    setErrors({});
    setOtp("");
    setResetOtp("");
    setNewPassword("");
    if (mode === "login" || mode === "signup") {
      setSignup(emptySignup);
      setLogin(emptyLogin);
      setTotpData(null);
    }
  }, [mode]);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  async function submitSignup(event: FormEvent) {
    event.preventDefault();
    const newErrors: Errors = {};
    if (!validateEmail(signup.email)) newErrors.email = "Invalid email address.";
    if (signup.mobile.length < 10) newErrors.mobile = "Mobile number too short.";
    if (signup.password.length < 8) newErrors.password = "Password must be 8+ characters.";
    if (signup.password !== signup.confirmPassword) newErrors.confirmPassword = "Passwords do not match.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast("error", "Check your input.");
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const res = await authApi.signup({ email: signup.email, mobile: signup.mobile, password: signup.password });
      setTotpData({ secret: res.data.totp_secret, url: res.data.otpauth_url });
      setMode("verify");
      showToast("success", "Account created. Please link your Authenticator app.");
    } catch (error) {
      showToast("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify(event: FormEvent) {
    event.preventDefault();
    if (otp.length < 6) return;
    setBusy(true);
    try {
      await authApi.verifyOtp({ email: signup.email || login.email || mfaEmail, code: otp });
      setMode("login");
      showToast("success", "Identity verified successfully.");
    } catch (error) {
      showToast("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    const newErrors: Errors = {};
    if (!validateEmail(login.email)) newErrors.email = "Invalid email address.";
    if (!login.password) newErrors.password = "Password is required.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const res = await authApi.login({ ...login, mfa_code: otp, remember: rememberMe });
      if (res.data.mfa_required) {
        setMode("mfa");
        setMfaEmail(login.email);
        setOtp("");
      } else {
        onLogin(res.data, rememberMe);
        showToast("success", "Welcome back to your vault.");
      }
    } catch (error: any) {
      const msg = getErrorMessage(error);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  const sideContent: Record<AuthMode, { kicker: string; title: string; desc: string; steps?: string[]; features: any[] }> = {
    login: {
      kicker: "Welcome Back",
      title: "Secure your digital life in the cloud.",
      desc: "Access your zero-knowledge vault protected by multi-layer AES-256 encryption.",
      features: [
        { icon: <ShieldCheck size={20} />, label: "Encrypted Storage", desc: "Military-grade AES-256", color: "#10b981" },
        { icon: <Activity size={20} />, label: "Security Audit", desc: "Live IP & Device Tracking", color: "#3b82f6" },
        { icon: <KeyRound size={20} />, label: "Master Key", desc: "Your keys, your data", color: "#f59e0b" },
        { icon: <Lock size={20} />, label: "Zero-Knowledge", desc: "Privacy by design", color: "#6366f1" }
      ]
    },
    signup: {
      kicker: `Join ${APP_NAME}`,
      title: "The future of private storage starts here.",
      desc: "Get 2GB of encrypted space and take full control of your digital footprint.",
      features: [
        { icon: <Zap size={20} />, label: "Instant Setup", desc: "Account ready in seconds", color: "#f43f5e" },
        { icon: <Share2 size={20} />, label: "Secure Sharing", desc: "Expiring access links", color: "#a855f7" },
        { icon: <PlayCircle size={20} />, label: "Media Engine", desc: "Stream your private media", color: "#14b8a6" },
        { icon: <ShieldCheck size={20} />, label: "MFA Hardened", desc: "Authenticator required", color: "#10b981" }
      ]
    },
    verify: {
      kicker: "Security Check",
      title: "Hardening your digital perimeter.",
      desc: "Link your Authenticator app to enable industry-standard 2FA protection.",
      steps: [
        "Open Microsoft Authenticator app on your mobile device.",
        "Scan the QR code shown on the right side of this screen.",
        "Enter the 6-digit verification code to finalize account link."
      ],
      features: [
        { icon: <ShieldCheck size={20} />, label: "TOTP Protocol", desc: "Time-based OTP", color: "#10b981" },
        { icon: <Lock size={20} />, label: "Anti-Brute", desc: "Protects against attacks", color: "#3b82f6" },
        { icon: <Activity size={20} />, label: "Live Identity", desc: "Real-time verification", color: "#6366f1" },
        { icon: <KeyRound size={20} />, label: "Trust Sync", desc: "Secure device pairing", color: "#f59e0b" }
      ]
    },
    mfa: {
      kicker: "Identity Verified",
      title: "Your vault is one step away.",
      desc: "Please provide the 6-digit code from your linked Microsoft Authenticator app.",
      steps: [
        "Unlock your mobile device and open Microsoft Authenticator.",
        `Find the '${APP_NAME}' entry in your accounts list.`,
        "Type the current 6-digit code into the verification box."
      ],
      features: [
        { icon: <Lock size={20} />, label: "Deep Shield", desc: "Multi-layered defense", color: "#10b981" },
        { icon: <Zap size={20} />, label: "Auto-Verification", desc: "Instant unlocking", color: "#f43f5e" },
        { icon: <ShieldCheck size={20} />, label: "MFA Verified", desc: "Security check active", color: "#3b82f6" },
        { icon: <Activity size={20} />, label: "Audit Logged", desc: "Session recorded", color: "#6366f1" }
      ]
    },
    reset: {
      kicker: "Account Recovery",
      title: "Regaining access to your vault.",
      desc: "Follow the multi-step verification to safely reset your master credentials.",
      features: [
        { icon: <ShieldAlert size={20} />, label: "Safe Reset", desc: "Secured by MFA", color: "#ef4444" },
        { icon: <KeyRound size={20} />, label: "Credential Sync", desc: "Update master keys", color: "#f59e0b" },
        { icon: <ShieldCheck size={20} />, label: "Identity Check", desc: "Ownership validation", color: "#10b981" },
        { icon: <Activity size={20} />, label: "Security Trace", desc: "Alerting trusted email", color: "#3b82f6" }
      ]
    }
  };

  const currentSide = sideContent[mode];

  return (
    <main className="auth-page">
      <motion.section 
        className="auth-side-panel"
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        {/* Background Decorative Element */}
        <div className="bg-decorative"></div>

        <div className="company-logo">
          <img src="/favicon.png" alt={APP_NAME} />
          <span>{APP_NAME_UPPER}</span>
        </div>

        <div className="side-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="side-kicker">
                {currentSide.kicker}
              </span>
              <h1>
                {currentSide.title}
              </h1>
              <p className="side-desc">
                {currentSide.desc}
              </p>

              {currentSide.steps && (
                <div className="auth-steps">
                  {currentSide.steps.map((step: string, i: number) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 + 0.3 }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}
                    >
                      <div style={{ 
                        width: '28px', 
                        height: '28px', 
                        borderRadius: '50%', 
                        background: 'rgba(255, 255, 255, 0.2)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontSize: '0.875rem', 
                        fontWeight: 900,
                        color: 'white',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>
                        {i + 1}
                      </div>
                      <p style={{ margin: 0, fontSize: '1rem', color: 'white', opacity: 0.9, fontWeight: 500, lineHeight: 1.5 }}>
                        {step}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
              
              <div className="features-list">
                {currentSide.features.map((f, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 + 0.4 }}
                    className="feature-item"
                  >
                    <div className="feature-icon-wrapper" style={{ color: f.color }}>
                      {f.icon}
                    </div>
                    <div className="feature-text">
                      <h3>{f.label}</h3>
                      <p>{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="auth-footer-copyright">
          © 2026 {COMPANY_NAME}. All rights reserved.
        </div>
      </motion.section>

      <motion.section 
        className="auth-form-panel"
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="auth-form-container">
          {mode === "reset" ? (
            <PasswordResetFlow 
              onBack={() => setMode("login")} 
              initialEmail={login.email} 
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <header className="form-header">
                  {busy && <AuthIndicator />}
                  <h2>
                    {mode === "login" ? "Welcome Back" : mode === "signup" ? "Get Started" : "Verification"}
                  </h2>
                  <p>
                    {mode === "login" ? "Enter your vault credentials." : mode === "signup" ? "Create your account." : "Enter your 6-digit code."}
                  </p>
                </header>

                {mode === "login" && (
                  <form onSubmit={submitLogin} noValidate>
                    <Field label="Email" icon={<Mail size={20} />} error={errors.email}>
                      <input value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} type="email" placeholder="Email" />
                    </Field>
                    <Field label="Password" icon={<KeyRound size={20} />} error={errors.password}>
                      <input value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} type={showPassword ? "text" : "password"} placeholder="Password" />
                      <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </Field>
                    
                    <div className="form-options">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                        <span>Remember me</span>
                      </label>
                      <button type="button" className="link" onClick={() => setMode("reset")}>Forgot password?</button>
                    </div>

                    <motion.button className="primary-btn" disabled={busy} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>Unlock Vault <ChevronRight size={20} /></motion.button>
                    <div className="auth-footer-nav">
                      <span>Need a vault?</span>
                      <button type="button" onClick={() => setMode("signup")}>Register</button>
                    </div>
                  </form>
                )}

                {mode === "signup" && (
                  <form onSubmit={submitSignup} noValidate>
                    <Field label="Email" icon={<Mail size={20} />} error={errors.email}>
                      <input value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} type="email" placeholder="Email" />
                    </Field>
                    <Field label="Mobile" icon={<Zap size={20} />} error={errors.mobile}>
                      <input value={signup.mobile} onChange={(e) => setSignup({ ...signup, mobile: e.target.value })} placeholder="Mobile" />
                    </Field>
                    <Field label="Password" icon={<KeyRound size={20} />} error={errors.password}>
                      <input value={signup.password} onChange={(e) => setSignup({ ...signup, password: e.target.value })} type={showPassword ? "text" : "password"} placeholder="Password" />
                      <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </Field>
                    <Field label="Confirm" icon={<ShieldCheck size={20} />} error={errors.confirmPassword}>
                      <input value={signup.confirmPassword} onChange={(e) => setSignup({ ...signup, confirmPassword: e.target.value })} type={showPassword ? "text" : "password"} placeholder="Confirm" />
                    </Field>
                    <motion.button className="primary-btn" disabled={busy} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>Create Account</motion.button>
                    <div className="auth-footer-nav">
                      <span>Member?</span>
                      <button type="button" onClick={() => setMode("login")}>Sign In</button>
                    </div>
                  </form>
                )}

                {(mode === "verify" || mode === "mfa") && (
                  <form onSubmit={mode === "verify" ? submitVerify : submitLogin}>
                    {mode === "verify" && totpData && (
                      <div className="qr-container">
                        <div className="qr-image-wrapper">
                          {/* Image Loader */}
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '16px', zIndex: 1 }}>
                            <AuthIndicator />
                          </div>
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpData.url)}`} 
                            alt="QR" 
                            onLoad={(e) => {
                              const loader = (e.target as HTMLElement).previousElementSibling;
                              if (loader) (loader as HTMLElement).style.display = 'none';
                            }}
                            style={{ position: 'relative', zIndex: 2, display: 'block', width: '180px', borderRadius: '12px' }}
                          />
                        </div>
                        <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', width: '100%' }}>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>Manual Entry Key</p>
                          <p style={{ fontSize: '0.9375rem', color: '#0f172a', wordBreak: 'break-all', fontFamily: 'monospace', fontWeight: 600, margin: 0 }}>{totpData.secret}</p>
                        </div>
                      </div>
                    )}
                    <Field label="Authenticator Code" icon={<ShieldCheck size={20} />}>
                      <input 
                        value={otp} 
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setOtp(val);
                          if (val.length === 6) {
                            const form = e.target.form;
                            if (form) setTimeout(() => form.requestSubmit(), 10);
                          }
                        }} 
                        placeholder="······" 
                        maxLength={6}
                        autoFocus
                        className="otp-input"
                      />
                    </Field>
                    <motion.button className="primary-btn" disabled={busy} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      {mode === "verify" ? "Link Authenticator" : "Verify & Sign In"}
                    </motion.button>
                    <div className="auth-footer-nav">
                      <button type="button" onClick={() => setMode(mode === "verify" ? "signup" : "login")}>
                        {mode === "verify" ? "Back to Signup" : "Back to Credentials"}
                      </button>
                    </div>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.section>
    </main>

  );
}
