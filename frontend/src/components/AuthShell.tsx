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
    <main className="auth-page" style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <motion.section 
        className="auth-side-panel"
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={{ 
          flex: '1.2', 
          position: 'relative', 
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
          padding: '60px', 
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden'
        }}
      >
        {/* Background Decorative Element */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1, backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

        <div className="company-logo" style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/favicon.png" alt={APP_NAME} style={{ width: '48px', height: '48px', borderRadius: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} />
          <span style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.05em' }}>{APP_NAME_UPPER}</span>
        </div>

        <div className="side-content" style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="side-kicker" style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.25em', fontSize: '0.875rem', display: 'block', marginBottom: '1.5rem' }}>
                {currentSide.kicker}
              </span>
              <h1 style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1, marginBottom: '2rem', letterSpacing: '-0.04em' }}>
                {currentSide.title}
              </h1>
              <p className="side-desc" style={{ fontSize: '1.25rem', opacity: 0.9, lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: '540px', fontWeight: 500 }}>
                {currentSide.desc}
              </p>

              {currentSide.steps && (
                <div className="auth-steps" style={{ marginBottom: '3rem' }}>
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
              
              <div className="features-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '640px' }}>
                {currentSide.features.map((f, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 + 0.4 }}
                    className="feature-item" 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.1)', 
                      padding: '24px', 
                      borderRadius: '28px', 
                      border: '1px solid rgba(255, 255, 255, 0.2)', 
                      backdropFilter: 'blur(16px)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '20px',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div style={{ 
                      color: f.color, 
                      background: 'white', 
                      minWidth: '48px', 
                      height: '48px', 
                      borderRadius: '16px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                      flexShrink: 0
                    }}>
                      {f.icon}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, marginBottom: '2px', color: 'white' }}>{f.label}</h3>
                      <p style={{ fontSize: '0.8125rem', opacity: 0.85, color: 'white', fontWeight: 600, margin: 0, whiteSpace: 'nowrap' }}>{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div style={{ position: 'relative', zIndex: 10, opacity: 0.6, fontSize: '0.875rem', fontWeight: 600 }}>
          © 2026 {COMPANY_NAME}. All rights reserved.
        </div>
      </motion.section>

      <motion.section 
        className="auth-form-panel"
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={{ flex: '0.8', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}
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
                <header className="form-header" style={{ position: 'relative' }}>
                  {busy && <AuthIndicator />}
                  <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                    {mode === "login" ? "Welcome Back" : mode === "signup" ? "Get Started" : "Verification"}
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '1rem' }}>
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
                      <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>
                        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }} />
                        <span>Remember me</span>
                      </label>
                      <button type="button" className="link" onClick={() => setMode("reset")} style={{ color: '#3b82f6', fontWeight: 800, fontSize: '0.875rem' }}>Forgot password?</button>
                    </div>

                    <motion.button className="primary-btn" disabled={busy} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>Unlock Vault <ChevronRight size={20} /></motion.button>
                    <div className="auth-footer-nav" style={{ marginTop: '32px', textAlign: 'center', color: '#64748b', fontSize: '0.9375rem' }}>
                      <span>Need a vault?</span>
                      <button type="button" onClick={() => setMode("signup")} style={{ color: '#3b82f6', fontWeight: 800, marginLeft: '8px' }}>Register</button>
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
                    <div className="auth-footer-nav" style={{ marginTop: '32px', textAlign: 'center', color: '#64748b', fontSize: '0.9375rem' }}>
                      <span>Member?</span>
                      <button type="button" onClick={() => setMode("login")} style={{ color: '#3b82f6', fontWeight: 800, marginLeft: '8px' }}>Sign In</button>
                    </div>
                  </form>
                )}

                {(mode === "verify" || mode === "mfa") && (
                  <form onSubmit={mode === "verify" ? submitVerify : submitLogin}>
                    {mode === "verify" && totpData && (
                      <div style={{ background: 'white', padding: '24px', borderRadius: '32px', marginBottom: '24px', textAlign: 'center', border: '1px solid #f1f5f9', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', position: 'relative', minHeight: '230px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'relative', width: '180px', height: '180px', marginBottom: '16px' }}>
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
                        style={{ textAlign: 'center', fontSize: '2rem', letterSpacing: '0.4em', fontFamily: 'monospace', fontWeight: 900 }}
                      />
                    </Field>
                    <motion.button className="primary-btn" disabled={busy} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      {mode === "verify" ? "Link Authenticator" : "Verify & Sign In"}
                    </motion.button>
                    <div className="auth-footer-nav" style={{ marginTop: '24px', textAlign: 'center' }}>
                      <button type="button" onClick={() => setMode(mode === "verify" ? "signup" : "login")} style={{ color: '#3b82f6', fontWeight: 800, fontSize: '0.875rem' }}>
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
