import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, 
  ShieldAlert, 
  Clock, 
  Lock, 
  FileText, 
  FileImage, 
  Music, 
  Video, 
  FileArchive, 
  File as FileGeneric,
  ShieldCheck,
  Zap,
  ChevronRight,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound
} from 'lucide-react';
import { shareApi } from '../lib/api/security';
import { fileApi } from '../lib/api/files';
import { decryptFile, unwrapKey } from '../lib/utils/crypto';
import { useToast } from './Toast';
import { Field } from './Field';
import { Loader } from './Loader';
import { APP_NAME } from '../lib/constants';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const ShareView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const { showToast } = useToast();

  useEffect(() => {
    if (token) fetchSharedItem();
  }, [token]);

  useEffect(() => {
    if (!data?.expires_at) return;
    
    const interval = setInterval(() => {
      const expires = new Date(data.expires_at).getTime();
      const now = Date.now();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        clearInterval(interval);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(`${h > 0 ? `${h}h ` : ""}${m}m ${s}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [data]);

  const fetchSharedItem = async (providedPassword?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await shareApi.accessLink(token!, providedPassword);
      if (res.success) {
        if (res.data.passwordRequired) {
          setData({ passwordRequired: true });
        } else {
          setData(res.data);
        }
      } else {
        setError(res.message || "Failed to load link");
      }
    } catch (err: any) {
      setError(err.message || "Link expired or invalid");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!data?.item) return;
    setBusy(true);
    try {
      const file = data.item;
      let decryptionKey = password;
      
      const searchParams = new URLSearchParams(window.location.search);
      const urlKey = searchParams.get('k');
      
      if (data.wrapped_key && password) {
        decryptionKey = await unwrapKey(data.wrapped_key, password);
      } else if (urlKey) {
        decryptionKey = atob(urlKey);
      } else if (window.location.hash.includes('?k=')) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        if (hashParams.get('k')) {
            decryptionKey = atob(hashParams.get('k')!);
        }
      }
      
      const urlResponse = await fileApi.createDownloadUrl("", file.id, decryptionKey, token);
      const blob = await fileApi.downloadBlob(urlResponse.data.download_url);
      
      let finalBlob = blob;
      if (file.encryption_salt && file.encryption_iv) {
        if (!decryptionKey) {
          showToast("error", "Encryption key required.");
          setBusy(false);
          return;
        }
        finalBlob = await decryptFile(blob, decryptionKey, file.encryption_salt, file.encryption_iv, file.content_type);
      }

      const url = URL.createObjectURL(finalBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      showToast("success", "Securing download...");
    } catch (err) {
      showToast("error", "Download failed. Key might be wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader message="Verifying Secure Link..." />;

  if (error) {
    return (
      <div className="share-error-container">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="error-card"
        >
          <ShieldAlert size={64} color="#ef4444" />
          <h1>Link Inaccessible</h1>
          <p>{error}</p>
          <button onClick={() => window.location.href = "/"} className="back-btn">Return to Safety</button>
        </motion.div>
      </div>
    );
  }

  if (data?.passwordRequired) {
    return (
      <div className="share-error-container">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="error-card" style={{ maxWidth: '400px', width: '90%' }}>
          <Lock size={48} color="#3b82f6" style={{ margin: '0 auto 20px', display: 'block' }} />
          <h2 style={{ textAlign: 'center', marginBottom: '16px', color: '#0f172a', fontWeight: 800 }}>Password Protected</h2>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '24px' }}>This link is secured with a password.</p>
          <form onSubmit={(e) => { e.preventDefault(); fetchSharedItem(password); }}>
            <Field label="Link Password" icon={<KeyRound size={20} />}>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
              />
            </Field>
            <button type="submit" className="primary-btn" style={{ width: '100%', marginTop: '20px' }}>Access Link</button>
          </form>
        </motion.div>
      </div>
    );
  }

  const file = data?.item;
  const isEncrypted = file?.encryption_salt && file?.encryption_iv;

  return (
    <div className="share-view-root">
      <div className="share-background">
        <div className="blob"></div>
        <div className="blob blob-2"></div>
      </div>

      <nav className="share-nav">
        <div className="logo">
          <img src="/favicon.png" alt="Logo" />
          <span>{APP_NAME}</span>
        </div>
        <div className="security-tag">
          <ShieldCheck size={16} />
          <span>End-to-End Encrypted</span>
        </div>
      </nav>

      <main className="share-content">
        <motion.div 
          className="share-card"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="card-header">
            <div className="type-icon">
              {file?.content_type?.startsWith('image/') ? <FileImage size={32} /> :
               file?.content_type?.startsWith('video/') ? <Video size={32} /> :
               file?.content_type?.startsWith('audio/') ? <Music size={32} /> :
               file?.content_type === 'application/pdf' ? <FileText size={32} /> :
               <FileGeneric size={32} />}
            </div>
            <div className="status-badges">
              {timeLeft && (
                <div className={`badge expiration ${timeLeft === 'Expired' ? 'expired' : ''}`}>
                  <Clock size={14} />
                  <span>{timeLeft}</span>
                </div>
              )}
              {data.is_one_time === 1 && (
                <div className="badge one-time">
                  <Zap size={14} />
                  <span>One-time Access</span>
                </div>
              )}
            </div>
          </div>

          <div className="file-info">
            <h1>{file?.filename || "Shared Vault Item"}</h1>
            <div className="meta">
              <span>{formatBytes(file?.size || 0)}</span>
              <span className="dot">•</span>
              <span>{file?.content_type?.split('/')[1]?.toUpperCase() || "BINARY"}</span>
            </div>
          </div>

          <AnimatePresence>
            {isEncrypted && (
              <motion.div 
                className="decryption-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
              >
                <div className="encryption-notice">
                  <Lock size={16} />
                  <span>This file is locked with a custom key.</span>
                </div>
                <Field label="Decryption Key" icon={<KeyRound size={20} />}>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter the shared key"
                  />
                </Field>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="action-area">
            {data.access_level !== 'view' && (
              <button 
                className="download-btn"
                onClick={handleDownload}
                disabled={busy || timeLeft === 'Expired'}
                style={{ width: '100%', marginBottom: data.access_level === 'both' ? '12px' : '0' }}
              >
                {busy ? <div className="spinner"></div> : <Download size={20} />}
                <span>{busy ? "Securing Data..." : "Secure Download"}</span>
              </button>
            )}
            
            {data.access_level === 'view' && (
              <div style={{ padding: '16px', background: '#f1f5f9', borderRadius: '12px', textAlign: 'center', color: '#64748b' }}>
                <Eye size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>View-only Access</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>Downloading is disabled by the owner.</p>
                <button 
                  className="primary-btn"
                  onClick={async () => {
                    const originalClick = document.createElement;
                    // Intercept the download click from handleDownload to just show preview
                    const _orig = URL.createObjectURL;
                    URL.createObjectURL = (blob) => {
                       const url = _orig(blob);
                       showToast("success", "Preview ready");
                       window.open(url, "_blank"); // Open in new tab for preview
                       return url;
                    };
                    document.createElement = (tag: string) => {
                       if(tag === 'a') return { click: () => {} } as any;
                       return originalClick.call(document, tag);
                    };
                    await handleDownload();
                    URL.createObjectURL = _orig;
                    document.createElement = originalClick;
                  }}
                  disabled={busy || timeLeft === 'Expired'}
                  style={{ width: '100%', marginTop: '16px' }}
                >
                  <Eye size={18} style={{ marginRight: '8px' }} /> View Securely
                </button>
              </div>
            )}

            <p className="safety-note" style={{ marginTop: '16px' }}>
              Files are processed locally. Your keys never leave your device.
            </p>
          </div>
        </motion.div>

        <footer className="share-footer">
          <p>© 2026 {APP_NAME}. Protected by zero-knowledge security.</p>
        </footer>
      </main>
    </div>
  );
};
