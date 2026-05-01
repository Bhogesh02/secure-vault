import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ShieldCheck, KeyRound, ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import { Field } from './Field';
import { AuthIndicator } from './AuthIndicator';
import { authApi } from '../lib/api/auth';
import { getErrorMessage } from '../lib/utils/format';
import { useToast } from './Toast';

interface PasswordResetFlowProps {
  onBack: () => void;
  initialEmail?: string;
}

export const PasswordResetFlow: React.FC<PasswordResetFlowProps> = ({ onBack, initialEmail = "" }) => {
  const [step, setStep] = useState<'email' | 'mfa' | 'password'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authApi.forgotPassword(email);
      if (res.data.mfa_required) {
        setStep('mfa');
        showToast("info", "Verification code sent to your Authenticator.");
      }
    } catch (error) {
      showToast("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      setStep('password');
    } else {
      showToast("error", "Invalid 6-digit code.");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast("error", "Password must be 8+ characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("error", "Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword({ email, code, new_password: newPassword });
      showToast("success", "Password updated successfully.");
      onBack();
    } catch (error) {
      showToast("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div 
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <header className="form-header" style={{ position: 'relative' }}>
          {busy && <AuthIndicator />}
          <button 
            type="button" 
            onClick={onBack}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: '#3b82f6', 
              fontSize: '0.875rem', 
              fontWeight: 800, 
              marginBottom: '16px',
              padding: '4px 0'
            }}
          >
            <ArrowLeft size={16} /> Back to Login
          </button>
          <h2>
            {step === 'email' ? 'Reset Password' : step === 'mfa' ? 'Security Check' : 'New Credentials'}
          </h2>
          <p>
            {step === 'email' ? 'Identify your account to continue.' : 
             step === 'mfa' ? 'Enter the code from Microsoft Authenticator.' : 
             'Set a new master password for your vault.'}
          </p>
        </header>

        {step === 'email' && (
          <form onSubmit={handleSendCode} noValidate>
            <Field label="Recovery Email" icon={<Mail size={20} />}>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="Enter account email"
                required
              />
            </Field>
            <motion.button className="primary-btn" disabled={busy} whileTap={{ scale: 0.99 }}>
              Send Verification <ChevronRight size={20} />
            </motion.button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleVerifyCode}>
            <Field label="Authenticator Code" icon={<ShieldCheck size={20} />}>
              <input 
                value={code} 
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setCode(val);
                  if (val.length === 6) setTimeout(() => setStep('password'), 300);
                }} 
                placeholder="······" 
                maxLength={6}
                autoFocus
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5em', fontFamily: 'monospace' }}
              />
            </Field>
            <motion.button className="primary-btn" disabled={busy} whileTap={{ scale: 0.99 }}>
              Verify Identity
            </motion.button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleResetPassword}>
            <Field label="New Password" icon={<Lock size={20} />}>
              <input 
                type="password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                placeholder="Min 8 characters"
                required
              />
            </Field>
            <Field label="Confirm" icon={<KeyRound size={20} />}>
              <input 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                placeholder="Confirm new password"
                required
              />
            </Field>
            <motion.button className="primary-btn" disabled={busy} whileTap={{ scale: 0.99 }}>
              Update Password
            </motion.button>
          </form>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
