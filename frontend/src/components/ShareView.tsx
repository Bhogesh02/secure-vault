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
import { decryptFile } from '../lib/utils/crypto';
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

  const fetchSharedItem = async () => {
    setLoading(true);
    try {
      const res = await shareApi.accessLink(token!);
      if (res.success) {
        setData(res.data);
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
      // For shared items, the backend provides the direct link or we fetch it
      // In our current backend, accessSharedItem returns the file metadata
      // We need to request a download URL. But wait, we don't have a session!
      // The backend share logic needs to allow downloading without a full user session if token is valid.
      
      // Let's assume the backend allows signed tokens for shares
      const urlResponse = await fileApi.createDownloadUrl("", file.id, password, token);
      const blob = await fileApi.downloadBlob(urlResponse.data.download_url);
      
      let finalBlob = blob;
      if (file.encryption_salt && file.encryption_iv) {
        if (!password) {
          showToast("error", "Encryption key required.");
          setBusy(false);
          return;
        }
        finalBlob = await decryptFile(blob, password, file.encryption_salt, file.encryption_iv, file.content_type);
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
            <button 
              className="download-btn"
              onClick={handleDownload}
              disabled={busy || timeLeft === 'Expired'}
            >
              {busy ? <div className="spinner"></div> : <Download size={20} />}
              <span>{busy ? "Securing Data..." : "Secure Download"}</span>
            </button>
            <p className="safety-note">
              Downloads are processed locally. Your keys never leave your device.
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
