import React, { useState, useMemo } from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { 
  Folder as FolderIcon, 
  Search, 
  Plus, 
  MoreVertical, 
  Trash2, 
  Download, 
  Share2, 
  LogOut, 
  Shield, 
  Clock, 
  HardDrive,
  ChevronRight,
  Menu,
  FileText,
  Loader2,
  Cloud,
  FilePlus,
  FolderPlus,
  Lock,
  Eye,
  EyeOff,
  LayoutGrid,
  List as ListIcon,
  Maximize2,
  AlertCircle,
  FileImage,
  ShieldAlert,
  RefreshCcw,
  Video,
  Music,
  FileArchive,
  File as FileGeneric,
  Activity,
  ShieldCheck,
  Zap,
  Globe,
  Settings,
  Share
} from "lucide-react";
import { useToast } from "./Toast";
import { Modal } from "./Modal";
import { Field } from "./Field";
import { Session, VaultFile, Folder as VaultFolder } from "../types/domain";
import { fileApi } from "../lib/api/files";
import { securityApi, shareApi } from "../lib/api/security";
import { encryptFile, decryptFile, wrapKey } from "../lib/utils/crypto";
import { useVault } from "../hooks/useVault";
import { APP_NAME } from "../lib/constants";

type ViewMode = "list" | "grid";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 25 }
  }
} as const;

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      let width = img.width;
      let height = img.height;
      const MAX_DIM = 1920;
      if (width > height && width > MAX_DIM) {
        height *= MAX_DIM / width;
        width = MAX_DIM;
      } else if (height > MAX_DIM) {
        width *= MAX_DIM / height;
        height = MAX_DIM;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else resolve(file);
      }, 'image/webp', 0.82);
    };
    img.onerror = () => resolve(file);
  });
}

type FileCategory = 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'other';

function getFileCategory(contentType: string): FileCategory {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType === 'application/pdf') return 'pdf';
  if (['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip'].includes(contentType)) return 'archive';
  return 'other';
}

function getFileCategoryStyle(category: FileCategory): { bg: string; color: string } {
  const styles: Record<FileCategory, { bg: string; color: string }> = {
    image:   { bg: 'rgba(59, 130, 246, 0.08)',  color: '#3b82f6' },
    video:   { bg: 'rgba(139, 92, 246, 0.08)',  color: '#8b5cf6' },
    audio:   { bg: 'rgba(20, 184, 166, 0.08)',  color: '#14b8a6' },
    pdf:     { bg: 'rgba(239, 68, 68, 0.08)',   color: '#ef4444' },
    archive: { bg: 'rgba(245, 158, 11, 0.08)',  color: '#f59e0b' },
    other:   { bg: 'rgba(148, 163, 184, 0.08)', color: '#94a3b8' },
  };
  return styles[category];
}

function FileCategoryIcon({ category, size = 48, color }: { category: FileCategory; size?: number; color: string }) {
  switch (category) {
    case 'image':   return <FileImage size={size} color={color} />;
    case 'video':   return <Video     size={size} color={color} />;
    case 'audio':   return <Music     size={size} color={color} />;
    case 'pdf':     return <FileText  size={size} color={color} />;
    case 'archive': return <FileArchive size={size} color={color} />;
    default:        return <FileGeneric size={size} color={color} />;
  }
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() ?? 'FILE';
}

export function VaultApp({ session, onLogout }: { session: Session; onLogout: () => void | Promise<void> }) {
  const [search, setSearch] = useState("");
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeTab, setActiveTab] = useState<"vault" | "shared" | "bin" | "security">("vault");
  
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);
  const [securitySettings, setSecuritySettings] = useState<any>(null);
  const [isSecurityLoading, setIsSecurityLoading] = useState(false);
  
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingItem, setSharingItem] = useState<{ id: number; name: string; type: 'file' | 'folder' } | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  
  const [currentFolderId, setCurrentFolderId] = useState<number>(0);
  const [activeFolderPassword, setActiveFolderPassword] = useState<string>("");
  
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; size: number; contentType: string } | null>(null);
  const [pendingFolderId, setPendingFolderId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ status: string; percent: number } | null>(null);
  
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPassword, setNewFolderPassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showPassCreate, setShowPassCreate] = useState(false);
  const [showPassUnlock, setShowPassUnlock] = useState(false);
  const [folderNameError, setFolderNameError] = useState("");
  const [unlockError, setUnlockError] = useState("");
  
  const { showToast } = useToast();

  const { 
    folders, 
    files, 
    stats, 
    isLoading, 
    isError, 
    createFolder, 
    uploadFile, 
    deleteFile, 
    purgeFile,
    restoreFile,
    deleteFolder,
    unlockFolder,
    isBusy 
  } = useVault(session, currentFolderId, activeFolderPassword, activeTab !== "vault" && activeTab !== "security" ? activeTab : undefined);

  const fetchSecurityData = async () => {
    setIsSecurityLoading(true);
    try {
      const [logsRes, settingsRes] = await Promise.all([
        securityApi.getLogs(session.accessToken),
        securityApi.getSettings(session.accessToken)
      ]);
      if (logsRes.success) setSecurityLogs(logsRes.data);
      if (settingsRes.success) setSecuritySettings(settingsRes.data);
    } catch (err) {
      showToast("error", "Failed to fetch security data");
    } finally {
      setIsSecurityLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === "security") {
      fetchSecurityData();
    }
  }, [activeTab]);

  const usagePercent = useMemo(() => {
    if (!stats || stats.storage_limit === 0) return 0;
    const p = (stats.total_size / stats.storage_limit) * 100;
    return Math.min(100, Math.max(stats.total_size > 0 ? 1 : 0, Math.round(p)));
  }, [stats]);

  async function handleViewFile(file: VaultFile) {
    try {
      const urlResponse = await fileApi.createDownloadUrl(session.accessToken, file.id, activeFolderPassword);
      const blob = await fileApi.downloadBlob(urlResponse.data.download_url);
      
      let finalBlob = blob;
      if (file.encryption_salt && file.encryption_iv && activeFolderPassword) {
        finalBlob = await decryptFile(blob, activeFolderPassword, file.encryption_salt, file.encryption_iv, file.content_type);
      }
      
      const url = URL.createObjectURL(finalBlob);
      setPreviewFile({ name: file.filename, url, size: file.size, contentType: file.content_type || '' });
      setShowPreviewModal(true);
    } catch (error) {
      showToast("error", "Decryption failure.");
    }
  }

  async function handleDownload(file: VaultFile) {
    if (isBusy) return;
    try {
      const urlResponse = await fileApi.createDownloadUrl(session.accessToken, file.id, activeFolderPassword);
      const blob = await fileApi.downloadBlob(urlResponse.data.download_url);
      
      let finalBlob = blob;
      if (file.encryption_salt && file.encryption_iv && activeFolderPassword) {
        finalBlob = await decryptFile(blob, activeFolderPassword, file.encryption_salt, file.encryption_iv, file.content_type);
      }

      const url = URL.createObjectURL(finalBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      showToast("success", "Securing download...");
    } catch (error) {
      showToast("error", "Download failed.");
    }
  }

  function handleFolderClick(folder: VaultFolder) {
    if (folder.is_locked && currentFolderId !== folder.id) {
      setPendingFolderId(folder.id);
      setShowUnlockModal(true);
    } else {
      setCurrentFolderId(folder.id);
      setActiveFolderPassword("");
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingFolderId) return;
    if (!unlockPassword.trim()) {
      setUnlockError("Decryption key is required.");
      return;
    }
    setUnlockError("");
    try {
      await unlockFolder({ folderId: pendingFolderId, password: unlockPassword });
      setCurrentFolderId(pendingFolderId);
      setActiveFolderPassword(unlockPassword);
      setShowUnlockModal(false);
      setUnlockPassword("");
      setPendingFolderId(null);
      showToast("success", "Vault unlocked successfully.");
    } catch (error) {
      setUnlockError("Invalid key. Please try again.");
      showToast("error", "Invalid decryption key.");
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setFolderNameError("Folder name is required.");
      return;
    }
    if (trimmedName.length > 100) {
      setFolderNameError("Folder name must be under 100 characters.");
      return;
    }
    setFolderNameError("");
    try {
      await createFolder({ name: trimmedName, password: newFolderPassword || undefined });
      showToast("success", `"${trimmedName}" vault created.`);
      setShowFolderModal(false);
      setNewFolderName("");
      setNewFolderPassword("");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : "Failed to create folder.";
      showToast("error", msg);
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    if (currentFolderId === 0) {
      showToast("error", "Select a folder first.");
      return;
    }

    const files = Array.from(fileList);
    const totalNewSize = files.reduce((sum, f) => sum + f.size, 0);
    if (stats && stats.total_size + totalNewSize > stats.storage_limit) {
      showToast("error", "Storage limit reached (2GB Max).");
      return;
    }

    const total = files.length;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const updateFileProgress = (p: number) => {
        const basePercent = Math.round((i / total) * 100);
        const chunkWeight = (1 / total) * p;
        setUploadProgress({ 
          status: `Securing ${file.name}${total > 1 ? ` (${i + 1}/${total})` : ''}...`, 
          percent: Math.min(99, Math.round(basePercent + chunkWeight)) 
        });
      };

      updateFileProgress(5);
      try {
        const compressedBlob = await compressImage(file);
        let finalPayload: Blob | File = new File([compressedBlob], file.name, { type: compressedBlob.type || file.type });
        let encryptionMetadata;

        if (activeFolderPassword) {
          const encrypted = await encryptFile(compressedBlob, activeFolderPassword);
          finalPayload = new File([encrypted.blob], file.name, { type: file.type });
          encryptionMetadata = { salt: encrypted.salt, iv: encrypted.iv };
        }

        await uploadFile({ 
          folderId: currentFolderId, 
          file: finalPayload, 
          password: activeFolderPassword, 
          metadata: encryptionMetadata,
          onProgress: (p) => updateFileProgress(p)
        });
        succeeded++;
      } catch (error: any) {
        failed++;
        showToast("error", `Failed: ${file.name.length > 20 ? file.name.slice(0, 20) + '...' : file.name}`);
      }
    }

    setUploadProgress({ status: "Secured!", percent: 100 });
    setTimeout(() => {
      setUploadProgress(null);
    }, 800);

    if (succeeded > 0) {
      setSearch("");
      showToast("success", total === 1 ? "File secured." : `${succeeded} of ${total} files secured.`);
    }
    if (event.target) event.target.value = '';
  }

  async function handleDeleteFile(id: number) {
    if (isBusy) return;
    try {
      await deleteFile({ fileId: id, password: activeFolderPassword });
      showToast("success", "Moved to bin.");
    } catch (error) {
      showToast("error", "Delete failed.");
    }
  }

  async function handlePurgeFile(id: number) {
    if (isBusy) return;
    try {
      await purgeFile(id);
      showToast("success", "Permanently deleted.");
    } catch (error) {
      showToast("error", "Purge failed.");
    }
  }

  async function handleRestoreFile(id: number) {
    if (isBusy) return;
    try {
      await restoreFile(id);
      showToast("success", "File restored to vault.");
    } catch (error) {
      showToast("error", "Restore failed.");
    }
  }

  async function handleDeleteFolder(id: number) {
    if (isBusy) return;
    try {
      await deleteFolder(id);
      showToast("success", "Folder moved to bin.");
    } catch (error) {
      showToast("error", "Delete folder failed.");
    }
  }

  const filteredFiles = files.filter(f => f.filename.toLowerCase().includes(search.toLowerCase()));
  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const userDisplayName = session.user.email.split('@')[0];

  const currentFolderName = useMemo(() => {
    if (activeTab !== "vault") return activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
    if (currentFolderId === 0) return "My Vault";
    return folders.find(f => f.id === currentFolderId)?.name || "Folder";
  }, [currentFolderId, folders, activeTab]);

  const pendingFolderName = useMemo(() => {
    if (!pendingFolderId) return "";
    return folders.find(f => f.id === pendingFolderId)?.name || "Vault";
  }, [pendingFolderId, folders]);

  const [requireSharePassword, setRequireSharePassword] = useState(false);
  const [sharePassword, setSharePassword] = useState("");

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!sharingItem) return;
    
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const expiresMinutes = parseInt(formData.get("expires") as string) || 60;
    const isOneTime = formData.get("one-time") === "on";
    const accessLevel = formData.get("access-level") as 'view' | 'download' | 'both';

    try {
      let wrappedKey: string | undefined = undefined;
      
      if (requireSharePassword && sharePassword) {
        if (activeFolderPassword) {
          wrappedKey = await wrapKey(activeFolderPassword, sharePassword);
        }
      }

      const res = await shareApi.createLink(session.accessToken, {
        fileId: sharingItem.type === 'file' ? sharingItem.id : undefined,
        folderId: sharingItem.type === 'folder' ? sharingItem.id : undefined,
        isOneTime,
        expiresMinutes,
        accessLevel,
        password: requireSharePassword ? sharePassword : undefined,
        wrappedKey
      });
      
      if (res.success) {
        let fullUrl = `${window.location.origin}/#/share/${res.data.token}`;
        
        if (!requireSharePassword && activeFolderPassword) {
          const encodedKey = btoa(activeFolderPassword);
          fullUrl += `?k=${encodedKey}`;
        }
        
        setShareLink(fullUrl);
        showToast("success", "Encrypted sharing link generated");
      }
    } catch (err) {
      showToast("error", "Failed to generate link");
    }
  }

  async function handleUpdateSecuritySettings(settings: any) {
    try {
      const res = await securityApi.updateSettings(session.accessToken, settings);
      if (res.success) {
        showToast("success", "Security settings hardened");
        fetchSecurityData();
      }
    } catch (err) {
      showToast("error", "Failed to update settings");
    }
  }

  return (
    <div className="vault-layout">
      {/* Sidebar Overhaul */}
      <LayoutGroup>
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              className="mobile-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
        </AnimatePresence>
        <motion.aside 
          className={`vault-sidebar ${isSidebarCollapsed || isMobile ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-open' : ''}`}
          initial={false}
          animate={{ 
            width: isMobile ? (isMobileMenuOpen ? 260 : 70) : (isSidebarCollapsed ? 90 : 280),
            x: 0 
          }}
          transition={{ type: "spring", stiffness: 350, damping: 35 }}
        >
          <div className="sidebar-header">
            <motion.div className="brand-lockup" layout>
              <div className="nav-icon logo-wrapper" style={{ padding: '0' }}>
                <motion.img 
                  src="/favicon.png" 
                  alt={APP_NAME} 
                  style={{ width: '32px', height: '32px', borderRadius: '8px' }}
                  whileHover={{ rotate: 5, scale: 1.05 }} 
                  layout 
                />
              </div>
              <AnimatePresence mode="wait">
                {!isSidebarCollapsed && (
                  <motion.div 
                    className="brand-info"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h2>{APP_NAME}</h2>
                    <span>{userDisplayName}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          <nav className="sidebar-nav">
            <motion.div 
              className={`nav-item ${activeTab === 'vault' && currentFolderId === 0 ? 'active' : ''}`} 
              onClick={() => { 
                setActiveTab("vault"); 
                setCurrentFolderId(0); 
                setActiveFolderPassword(""); 
                if (window.innerWidth <= 1024) setIsMobileMenuOpen(false); 
              }}
              whileTap={{ scale: 0.98 }}
              layout
            >
              <div className="nav-icon"><Cloud size={20} /></div>
              {(!isSidebarCollapsed && !isMobile || (isMobile && isMobileMenuOpen)) && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  My Storage
                </motion.span>
              )}
            </motion.div>
            
            
            <motion.div 
              className={`nav-item ${activeTab === 'shared' ? 'active' : ''}`} 
              onClick={() => {
                setActiveTab("shared");
                if (window.innerWidth <= 1024) setIsMobileMenuOpen(false);
              }}
              layout
            >
              <div className="nav-icon"><Share2 size={20} /></div>
              {!isSidebarCollapsed && <span>Shared</span>}
            </motion.div>

            <motion.div 
              className={`nav-item ${activeTab === 'security' ? 'active' : ''}`} 
              onClick={() => {
                setActiveTab("security");
                if (window.innerWidth <= 1024) setIsMobileMenuOpen(false);
              }}
              layout
            >
              <div className="nav-icon"><ShieldCheck size={20} /></div>
              {!isSidebarCollapsed && <span>Security Audit</span>}
            </motion.div>
            
            <motion.div 
              className={`nav-item ${activeTab === 'bin' ? 'active' : ''}`} 
              onClick={() => {
                setActiveTab("bin");
                if (window.innerWidth <= 1024) setIsMobileMenuOpen(false);
              }}
              layout
            >
              <div className="nav-icon"><Trash2 size={20} /></div>
              {!isSidebarCollapsed && <span>Bin</span>}
            </motion.div>
          </nav>

          <div className="sidebar-footer">
            <motion.div className="usage-card-new" layout>
              <div className="nav-icon usage-icon-wrapper">
                <HardDrive size={20} />
                {isSidebarCollapsed && (
                  <motion.span 
                    className="percent-overlay"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    {usagePercent}%
                  </motion.span>
                )}
              </div>
              {!isSidebarCollapsed && (
                <motion.div className="usage-details-box" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="usage-stats">
                    <span>{stats ? formatBytes(stats.total_size) : '...'} used</span>
                    <span>{usagePercent}%</span>
                  </div>
                  <div className="usage-bar-mini">
                    <motion.div className="usage-fill" animate={{ width: `${usagePercent}%` }} />
                  </div>
                </motion.div>
              )}
            </motion.div>

            <motion.button 
              className="logout-btn" 
              onClick={() => setShowLogoutModal(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              layout
            >
              <div className="nav-icon"><LogOut size={20} /></div>
              {!isSidebarCollapsed && <span>Sign Out</span>}
            </motion.button>
          </div>
        </motion.aside>
      </LayoutGroup>

      {/* Main Experience */}
      <main className="vault-main">
        <header className="main-header">
          <div className="header-left">
            <motion.button 
              className="sidebar-toggle" 
              onClick={() => {
                if (isMobile) {
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                } else {
                  setSidebarCollapsed(!isSidebarCollapsed);
                }
              }}
              whileTap={{ scale: 0.9 }}
            >
              <Menu size={22} />
            </motion.button>

            {/* Mobile Branding */}
            <div className="mobile-brand" style={{ display: 'none', alignItems: 'center', gap: '10px' }}>
              <img src="/favicon.png" alt="Logo" style={{ width: '28px', height: '28px', borderRadius: '8px' }} />
              <span style={{ fontSize: '1.125rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{APP_NAME}</span>
            </div>

            <div className="breadcrumb">
              <button onClick={() => { setActiveTab("vault"); setCurrentFolderId(0); setActiveFolderPassword(""); }}>Vault</button>
              <AnimatePresence>
                {activeTab !== "vault" ? (
                  <motion.span 
                    initial={{ opacity: 0, x: -5 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    className="flex items-center gap-2"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span className="separator"><ChevronRight size={14} /></span>
                    <button className="active-path">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</button>
                  </motion.span>
                ) : currentFolderId !== 0 ? (
                  <motion.span 
                    initial={{ opacity: 0, x: -5 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    className="flex items-center gap-2"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span className="separator"><ChevronRight size={14} /></span>
                    <button className="active-path">{currentFolderName}</button>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          <div className="header-right">
            {(activeTab === "vault" || activeTab === "bin" || activeTab === "shared") && (
              <motion.div className="search-wrapper" layout>
                <Search size={18} />
                <input type="text" placeholder={`Search ${activeTab === 'vault' ? 'your vault' : activeTab}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
              </motion.div>
            )}
            
            {activeTab === "vault" && (
              <div className="action-buttons">
                {currentFolderId === 0 ? (
                  <motion.button 
                    className="upload-trigger"
                    style={{ border: 'none', fontFamily: 'inherit' }}
                    onClick={() => setShowFolderModal(true)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FolderPlus size={20} strokeWidth={3} />
                    <span>Create Folder</span>
                  </motion.button>
                ) : (
                  <motion.label 
                    className="upload-trigger"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Plus size={20} strokeWidth={3} />
                    <span>Secure Upload</span>
                    <input type="file" hidden multiple onChange={handleUpload} />
                  </motion.label>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="content-container">
          {(activeTab === "vault" || activeTab === "bin" || activeTab === "shared") && (
            <div className="view-header">
              <div className="title-block">
                <motion.h1 
                  key={activeTab === 'vault' ? currentFolderId : activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {currentFolderName}
                </motion.h1>
                <p>
                  {activeTab === "bin" 
                    ? `${filteredFiles.length} items queued for deletion` 
                    : activeTab === "shared" 
                    ? "Collaborative items" 
                    : `${filteredFiles.length + (currentFolderId === 0 && activeTab === "vault" ? filteredFolders.length : 0)} items secured`}
                </p>
              </div>
              <div className="view-toggles">
                <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")}><LayoutGrid size={18} /></button>
                <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}><ListIcon size={18} /></button>
              </div>
            </div>
          )}

          {isError ? (
            <motion.div className="error-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AlertCircle size={48} color="#ef4444" />
              <h3>Sync Issue</h3>
              <p>Communication layer interrupted.</p>
            </motion.div>
          ) : (
            <SkeletonTheme baseColor="#f1f5f9" highlightColor="#f8fafc">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={viewMode === "grid" ? "file-grid" : "list-view-container"}
                  >
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} style={{padding: '20px'}}><Skeleton height={viewMode === "grid" ? 180 : 60} borderRadius={20} /></div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key={activeTab === 'security' ? 'security-view' : (currentFolderId + viewMode)}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {activeTab === 'security' ? (
                      <div className="security-audit-view" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div className="security-dashboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                          {/* Dead Man Switch Card */}
                          <div className="glass-card" style={{ padding: '24px', borderRadius: '24px', border: '1px solid #f1f5f9', background: 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444' }}>
                                <Zap size={20} />
                              </div>
                              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Dead Man Switch</h3>
                            </div>
                            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
                              If you don't access your vault for {securitySettings?.dead_man_days || 30} days, we will automatically notify your trusted email.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div className="field-group">
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Trusted Email</label>
                                <input 
                                  type="email" 
                                  placeholder="e.g. partner@email.com"
                                  defaultValue={securitySettings?.dead_man_email}
                                  onBlur={(e) => handleUpdateSecuritySettings({ dead_man_email: e.target.value })}
                                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9375rem' }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Login Protection Card */}
                          <div className="glass-card" style={{ padding: '24px', borderRadius: '24px', border: '1px solid #f1f5f9', background: 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' }}>
                                <ShieldAlert size={20} />
                              </div>
                              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Brute Force Protection</h3>
                            </div>
                            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
                              Automatically lock your account after too many failed login attempts.
                            </p>
                            <div className="field-group">
                              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Max Failed Attempts</label>
                              <select 
                                defaultValue={securitySettings?.max_failed_attempts || 5}
                                onChange={(e) => handleUpdateSecuritySettings({ max_failed_attempts: parseInt(e.target.value) })}
                                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9375rem' }}
                              >
                                {[3, 5, 7, 10].map(val => <option key={val} value={val}>{val} attempts</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Audit Timeline */}
                        <div className="glass-card" style={{ padding: '32px', borderRadius: '24px', border: '1px solid #f1f5f9', background: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.05)', color: '#0f172a' }}>
                                <Activity size={20} />
                              </div>
                              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Security Timeline</h3>
                            </div>
                            <button onClick={fetchSecurityData} className="icon-btn" style={{ width: '36px', height: '36px' }}>
                              <RefreshCcw size={16} />
                            </button>
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {securityLogs.length === 0 ? (
                              <p style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No security events logged yet.</p>
                            ) : (
                              securityLogs.map((log, idx) => (
                                <div key={idx} style={{ 
                                  display: 'flex', 
                                  gap: '20px', 
                                  padding: '16px 0', 
                                  borderBottom: idx === securityLogs.length - 1 ? 'none' : '1px solid #f1f5f9' 
                                }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ 
                                      width: '12px', 
                                      height: '12px', 
                                      borderRadius: '50%', 
                                      background: log.event_type.includes('failed') ? '#ef4444' : '#10b981',
                                      marginTop: '6px'
                                    }} />
                                    <div style={{ flex: 1, width: '2px', background: '#f1f5f9', margin: '4px 0' }} />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9375rem' }}>
                                        {log.event_type.replace(/_/g, ' ').toUpperCase()}
                                      </span>
                                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                        {new Date(log.created_at).toLocaleString()}
                                      </span>
                                    </div>
                                    <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 8px' }}>{log.details}</p>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={12} /> {log.ip_address}</span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Settings size={12} /> {log.user_agent.slice(0, 30)}...</span>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    ) : viewMode === "grid" ? (
                      <>
                        {/* Folders (only in root of vault) */}
                        {activeTab === "vault" && currentFolderId === 0 && filteredFolders.length > 0 && (
                          <div className="file-grid" style={{marginBottom: '40px'}}>
                            {filteredFolders.map(folder => (
                              <motion.div 
                                key={folder.id} 
                                variants={itemVariants}
                                className="grid-item" 
                                onClick={() => handleFolderClick(folder)}
                                whileHover={{ y: -6 }}
                              >
                                <div className="preview-canvas">
                                  <FolderIcon size={48} color={folder.is_locked ? "#6366f1" : "#3b82f6"} fill={folder.is_locked ? "rgba(99, 102, 241, 0.1)" : "rgba(59, 130, 246, 0.1)"} />
                                  {folder.is_locked && (
                                    <div className="sec-badge" style={{opacity: 1, transform: 'none', background: '#6366f1'}}>
                                      <Lock size={12} /> Encrypted
                                    </div>
                                  )}
                                </div>
                                <div className="item-meta">
                                  <div className="text-content">
                                    <h4>{folder.name}</h4>
                                    <span>{formatBytes(folder.total_size || 0)} • Vault</span>
                                  </div>
                                </div>
                                <div className="quick-actions">
                                  <button className="delete-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}><Trash2 size={16} /></button>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}

                        <div className="file-grid">
                          {filteredFiles.map(file => {
                            let daysLeft = 0;
                            if (activeTab === "bin" && file.deleted_at) {
                              const deletedDate = new Date(file.deleted_at).getTime();
                              daysLeft = 15 - Math.floor((Date.now() - deletedDate) / (1000 * 60 * 60 * 24));
                            }
                            return (
                              <motion.div 
                                key={file.id} 
                                variants={itemVariants}
                                layoutId={String(file.id)}
                                className="grid-item"
                              >
                                <div className="preview-canvas" onClick={() => handleViewFile(file)} style={{ background: !file.encryption_salt && file.content_type ? getFileCategoryStyle(getFileCategory(file.content_type)).bg : undefined }}>
                                  {file.encryption_salt ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                      <Shield size={44} color="#6366f1" fill="rgba(99,102,241,0.08)" />
                                      <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#6366f1', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Encrypted</span>
                                    </div>
                                  ) : (
                                    <FileCategoryIcon 
                                      category={getFileCategory(file.content_type || '')} 
                                      size={44} 
                                      color={getFileCategoryStyle(getFileCategory(file.content_type || '')).color} 
                                    />
                                  )}
                                  <div style={{ position: 'absolute', bottom: '12px', left: '12px' }}>
                                    <span style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.05em' }}>
                                      {getFileExtension(file.filename)}
                                    </span>
                                  </div>
                                  {activeTab === "bin" && (
                                    <div className="sec-badge" style={{opacity: 1, transform: 'none', background: '#ef4444', right: '12px', left: 'auto', border: 'none'}}>
                                      {daysLeft > 0 ? `${daysLeft}d left` : "Pending purge"}
                                    </div>
                                  )}
                                </div>
                                <div className="item-meta">
                                  <div className="text-content">
                                    <h4>{file.filename}</h4>
                                    <span>{formatBytes(file.size)}</span>
                                  </div>
                                  <button className="more-btn"><MoreVertical size={16} /></button>
                                </div>
                                <div className="quick-actions">
                                  {activeTab !== "bin" ? (
                                    <>
                                      <button disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleDownload(file); }} title="Download"><Download size={16} /></button>
                                      <button disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleViewFile(file); }} title="Preview"><Maximize2 size={16} /></button>
                                      <button disabled={isBusy} onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setSharingItem({ id: file.id, name: file.filename, type: 'file' });
                                        setShareLink(null);
                                        setShowShareModal(true);
                                      }} title="Secure Share"><Share size={16} /></button>
                                      <button className="delete-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }} title="Delete"><Trash2 size={16} /></button>
                                    </>
                                  ) : (
                                    <div style={{display: 'flex', width: '100%'}}>
                                      <button style={{flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)'}} disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleViewFile(file); }}><Maximize2 size={16} /></button>
                                      <button style={{flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)'}} disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleRestoreFile(file.id); }}><RefreshCcw size={16} /></button>
                                      <button className="delete-btn" disabled={isBusy} style={{flex: 1}} onClick={(e) => { e.stopPropagation(); handlePurgeFile(file.id); }}><Trash2 size={16} /></button>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="list-view-container">
                        <div className="list-header">
                          <div>Name</div>
                          <div>Size</div>
                          <div>Date</div>
                          <div style={{textAlign: 'right'}}>Actions</div>
                        </div>
                        <div className="list-body">
                          {/* Folders first in List View */}
                          {activeTab === "vault" && currentFolderId === 0 && filteredFolders.map(folder => (
                            <motion.div 
                              key={folder.id} 
                              variants={itemVariants}
                              className="row" 
                              onClick={() => handleFolderClick(folder)}
                            >
                              <div className="col-name">
                                <FolderIcon size={18} color={folder.is_locked ? "#6366f1" : "#3b82f6"} />
                                {folder.name}
                                {folder.is_locked && <Lock size={12} style={{marginLeft: '4px', opacity: 0.6}} />}
                              </div>
                              <div className="col-size">{formatBytes(folder.total_size || 0)}</div>
                              <div className="col-date">{folder.created_at ? new Date(folder.created_at).toLocaleDateString() : '--'}</div>
                              <div className="col-actions">
                                <button className="icon-btn delete-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}><Trash2 size={16} /></button>
                              </div>
                            </motion.div>
                          ))}
                          {filteredFiles.map(file => {
                            let daysLeft = 0;
                            if (activeTab === "bin" && file.deleted_at) {
                              const deletedDate = new Date(file.deleted_at).getTime();
                              daysLeft = 15 - Math.floor((Date.now() - deletedDate) / (1000 * 60 * 60 * 24));
                            }
                            return (
                              <motion.div 
                                key={file.id} 
                                variants={itemVariants}
                                className="row" 
                                onClick={() => handleViewFile(file)}
                              >
                                <div className="col-name">
                                  {file.content_type?.startsWith('image/') ? (
                                    file.encryption_salt ? <Shield size={18} color="#3b82f6" /> : <FileImage size={18} color="#94a3b8" />
                                  ) : (
                                    <FileText size={18} color="#94a3b8" />
                                  )}
                                  {file.filename}
                                  {!file.encryption_salt && <ShieldAlert size={12} style={{marginLeft: '6px', color: '#f59e0b', opacity: 0.7}} />}
                                </div>
                                <div className="col-size">{formatBytes(file.size)}</div>
                                <div className="col-date">{new Date(file.created_at).toLocaleDateString()}</div>
                                <div className="col-actions">
                                  {activeTab === "bin" ? (
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                      <span style={{fontSize: '0.7rem', color: '#ef4444', fontWeight: 800, marginRight: '4px'}}>
                                        {daysLeft > 0 ? `${daysLeft} days left` : "Pending purge"}
                                      </span>
                                      <button className="icon-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleViewFile(file); }}><Maximize2 size={16} /></button>
                                      <button className="icon-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleRestoreFile(file.id); }}><RefreshCcw size={16} /></button>
                                      <button className="icon-btn delete-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handlePurgeFile(file.id); }}><Trash2 size={16} /></button>
                                    </div>
                                  ) : (
                                    <>
                                      <button className="icon-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleDownload(file); }}><Download size={16} /></button>
                                      <button className="icon-btn delete-btn" disabled={isBusy} onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}><Trash2 size={16} /></button>
                                    </>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {filteredFiles.length === 0 && filteredFolders.length === 0 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        style={{
                          textAlign: 'center', 
                          padding: '80px 20px', 
                          color: '#94a3b8',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(255, 255, 255, 0.4)',
                          borderRadius: '24px',
                          border: '2px dashed rgba(148, 163, 184, 0.2)',
                          margin: '60px 20px',
                          minHeight: '50vh'
                        }}
                      >
                        <div style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          background: 'rgba(59, 130, 246, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '24px'
                        }}>
                          <Cloud size={40} strokeWidth={2} style={{color: '#3b82f6'}} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                          {activeTab === 'bin' 
                            ? 'Bin is empty' 
                            : activeTab === 'shared' 
                            ? 'No shared items' 
                            : currentFolderId === 0 
                            ? 'Your vault is empty' 
                            : `${currentFolderName} is empty`}
                        </h3>
                        <p style={{ maxWidth: '400px', margin: '0 auto 32px', lineHeight: 1.5, fontSize: '0.95rem' }}>
                          {activeTab === 'bin' 
                            ? 'Deleted files and folders will appear here.'
                            : activeTab === 'shared'
                            ? 'Files shared with you will appear here.'
                            : currentFolderId === 0
                            ? 'Start organizing your digital assets. Create a folder first.'
                            : 'This folder is empty. Upload your first file to secure it.'}
                        </p>
                        
                        {activeTab === 'vault' && (
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {currentFolderId === 0 ? (
                              <motion.button 
                                className="upload-trigger"
                                style={{ border: 'none', fontFamily: 'inherit' }}
                                onClick={() => setShowFolderModal(true)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <FolderPlus size={18} />
                                <span>Create Folder</span>
                              </motion.button>
                            ) : (
                              <motion.label 
                                className="upload-trigger"
                                style={{ fontFamily: 'inherit' }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <FilePlus size={18} />
                                <span>Upload File</span>
                                <input type="file" hidden multiple onChange={handleUpload} />
                              </motion.label>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </SkeletonTheme>
          )}
        </div>
      </main>

      {/* Modals with AnimatePresence & Fixed Autofill */}
      <Modal 
        isOpen={showFolderModal} 
        onClose={() => { setShowFolderModal(false); setFolderNameError(""); setNewFolderName(""); setNewFolderPassword(""); }} 
        title="Create New Vault"
      >
        <form onSubmit={handleCreateFolder} autoComplete="off" noValidate>
          <Field label="Vault Name" icon={<FolderPlus size={18} />}>
            <input 
              type="text" 
              name="vault-name-field"
              value={newFolderName} 
              onChange={(e) => { setNewFolderName(e.target.value); if (folderNameError) setFolderNameError(""); }} 
              placeholder="e.g. Personal Records" 
              autoFocus
              autoComplete="off"
              style={folderNameError ? { borderColor: '#ef4444' } : {}}
            />
            {folderNameError && (
              <p style={{ color: '#ef4444', fontSize: '0.8125rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={13} /> {folderNameError}
              </p>
            )}
          </Field>
          <Field label="Access Password (Optional)" icon={<Lock size={18} />}>
            <input 
              type={showPassCreate ? "text" : "password"} 
              name="vault-secret-new"
              value={newFolderPassword} 
              onChange={(e) => setNewFolderPassword(e.target.value)} 
              placeholder="Any key — e.g. 1234 or secret" 
              autoComplete="new-password"
            />
            <button type="button" className="password-toggle" onClick={() => setShowPassCreate(!showPassCreate)}>{showPassCreate ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </Field>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '-8px', marginBottom: '16px' }}>
            Password is optional. If set, files inside will be encrypted end-to-end.
          </p>
          <div className="modal-footer"><button type="submit" className="primary-btn" disabled={isBusy}>{isBusy ? <Loader2 className="spin" size={20} /> : "Create Vault"}</button></div>
        </form>
      </Modal>

      <Modal 
        isOpen={showUnlockModal} 
        onClose={() => { setShowUnlockModal(false); setUnlockError(""); setUnlockPassword(""); }}
        title={<>Unlock <span style={{color: '#3b82f6'}}>{pendingFolderName}</span></>}
      >
        <form onSubmit={handleUnlock} autoComplete="off" noValidate>
          {/* Dummy field to trick aggressive browsers */}
          <input type="text" style={{display:'none'}} />
          <input type="password" style={{display:'none'}} />
          
          <div style={{ padding: '0 0 20px', color: '#64748b', fontSize: '0.9375rem' }}>
            <p>This vault is restricted. Please enter your secondary decryption key to access the contents.</p>
          </div>
          <Field label="Decryption Key" icon={<Lock size={18} />}>
            <div className="input-wrapper" style={{width: '100%'}}>
              <input 
                autoFocus 
                type={showPassUnlock ? "text" : "password"} 
                name="vault-unlock-key"
                value={unlockPassword} 
                onChange={(e) => { setUnlockPassword(e.target.value); if (unlockError) setUnlockError(""); }} 
                placeholder="Enter key to unlock" 
                style={{ width: '100%', ...(unlockError ? { borderColor: '#ef4444' } : {}) }}
                autoComplete="off"
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassUnlock(!showPassUnlock)}>{showPassUnlock ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {unlockError && (
              <p style={{ color: '#ef4444', fontSize: '0.8125rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={13} /> {unlockError}
              </p>
            )}
          </Field>
          <div className="modal-footer"><button type="submit" className="primary-btn" disabled={isBusy}>{isBusy ? <Loader2 className="spin" size={20} /> : "Unlock Access"}</button></div>
        </form>
      </Modal>

      <AnimatePresence>
        {showPreviewModal && (
          <Modal isOpen={showPreviewModal} onClose={() => { setShowPreviewModal(false); if (previewFile?.url) URL.revokeObjectURL(previewFile.url); }} title="Secure Preview">
            <motion.div 
              className="media-preview-container"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              {previewFile?.url && (
                previewFile.contentType.startsWith('video/') ? (
                  <video 
                    src={previewFile.url} 
                    controls 
                    style={{ width: '100%', maxHeight: '60vh', borderRadius: '12px', background: '#000' }}
                  />
                ) : previewFile.contentType.startsWith('audio/') ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <Music size={64} color="#14b8a6" style={{ marginBottom: '20px' }} />
                    <audio src={previewFile.url} controls style={{ width: '100%' }} />
                  </div>
                ) : previewFile.contentType.startsWith('image/') ? (
                  <img src={previewFile.url} alt={previewFile.name} style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '12px' }} />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FileGeneric size={64} color="#94a3b8" style={{ marginBottom: '16px' }} />
                    <p>Preview not available for this file type.</p>
                    <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Download the file to view it.</p>
                  </div>
                )
              )}
              <div className="preview-meta">
                <p style={{color: '#0f172a'}}><strong>{previewFile?.name}</strong></p>
                <p style={{color: '#64748b'}}>{formatBytes(previewFile?.size || 0)} • {previewFile?.contentType || 'Unknown'}</p>
              </div>
              <button className="secondary-btn" onClick={() => setShowPreviewModal(false)}>Close Preview</button>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uploadProgress && (
          <Modal isOpen={true} onClose={() => {}} title="Secure Upload">
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <motion.div
                animate={{ y: uploadProgress.percent < 100 ? [0, -10, 0] : 0 }}
                transition={{ repeat: uploadProgress.percent < 100 ? Infinity : 0, duration: 2 }}
              >
                <Cloud size={56} color="#3b82f6" style={{ marginBottom: '20px' }} />
              </motion.div>
              <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '1.25rem', fontWeight: 800 }}>
                {uploadProgress.status}
              </h3>
              <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden', margin: '24px 0 12px' }}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress.percent}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                  style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: '10px' }}
                />
              </div>
              <p style={{ margin: 0, color: '#64748b', fontWeight: 800, fontSize: '1rem' }}>
                {uploadProgress.percent}%
              </p>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <Modal isOpen={showShareModal} onClose={() => { setShowShareModal(false); setShareLink(null); setRequireSharePassword(false); setSharePassword(""); }} title="Secure Sharing">
        <div style={{ padding: '10px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: '#f8fafc', borderRadius: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '10px', borderRadius: '12px', background: 'white', color: '#3b82f6', border: '1px solid #f1f5f9' }}>
              <FileGeneric size={24} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Sharing Securely</p>
              <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#0f172a' }}>{sharingItem?.name}</h4>
            </div>
          </div>

          {!shareLink ? (
            <form onSubmit={handleShare}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Permissions */}
                <div className="field-group">
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569', marginBottom: '8px', display: 'block' }}>Permissions</label>
                  <select name="access-level" defaultValue="both" style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9375rem', background: 'white' }}>
                    <option value="both">👁 View and Download</option>
                    <option value="view">👁 View Only (no download)</option>
                    <option value="download">⬇ Download Only</option>
                  </select>
                </div>

                {/* Expiration */}
                <div className="field-group">
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569', marginBottom: '8px', display: 'block' }}>
                    Link Expiry
                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8', marginLeft: '8px' }}>Link stops working after this time</span>
                  </label>
                  <select name="expires" defaultValue="60" style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9375rem', background: 'white' }}>
                    <option value="15">15 Minutes</option>
                    <option value="60">1 Hour</option>
                    <option value="1440">24 Hours</option>
                    <option value="10080">7 Days</option>
                  </select>
                </div>

                {/* One-time use */}
                <div style={{ padding: '14px 16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input type="checkbox" name="one-time" id="one-time" style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <label htmlFor="one-time" style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer', display: 'block', marginBottom: '4px' }}>
                        Single-use Link
                      </label>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.5 }}>
                        Link becomes invalid after the first download or view. Even if time has not expired.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Password protection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input 
                      type="checkbox" 
                      id="require-password" 
                      checked={requireSharePassword}
                      onChange={(e) => setRequireSharePassword(e.target.checked)}
                      style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0, accentColor: '#f59e0b' }} 
                    />
                    <div>
                      <label htmlFor="require-password" style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#b45309', cursor: 'pointer', display: 'block', marginBottom: '4px' }}>
                        Password Protect This Link
                      </label>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.5 }}>
                        Recipient must enter a password before the file can be accessed or decrypted.
                      </p>
                    </div>
                  </div>
                  
                  {requireSharePassword && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ overflow: 'hidden' }}>
                      <input 
                        type="text" 
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        placeholder="Enter a password for this link" 
                        required
                        autoComplete="off"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fcd34d', fontSize: '0.875rem', background: 'white', boxSizing: 'border-box' }}
                      />
                    </motion.div>
                  )}
                  
                  {!requireSharePassword && activeFolderPassword && (
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.5 }}>
                      ⚡ <strong>Passwordless mode:</strong> The decryption key is embedded in the link. Anyone with the link can open the file.
                    </p>
                  )}
                </div>

                {/* Info bar */}
                <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)', color: '#2563eb', fontSize: '0.8125rem', lineHeight: 1.5 }}>
                  <p style={{ margin: 0, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    Your file stays fully encrypted. Decryption only happens in the recipient's browser — never on the server.
                  </p>
                </div>

                <button type="submit" className="primary-btn" style={{ width: '100%', height: '52px', fontSize: '1rem' }}>Generate Secure Link</button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="field-group">
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569', marginBottom: '8px', display: 'block' }}>Your Secure Link</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    readOnly 
                    value={shareLink} 
                    style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #3b82f6', background: '#eff6ff', fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }}
                  />
                  <button 
                    onClick={() => { navigator.clipboard.writeText(shareLink); showToast("success", "Link copied to clipboard"); }}
                    className="primary-btn" 
                    style={{ width: 'auto', padding: '0 20px' }}
                  >
                    Copy
                  </button>
                </div>
              </div>
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>This link will expire automatically. Never share it with people you don't trust.</p>
              <button className="secondary-btn" onClick={() => setShowShareModal(false)}>Done</button>
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} title="Sign Out">
        <div style={{textAlign: 'center', padding: '10px 0'}}>
          <div style={{background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: '#ef4444', boxShadow: '0 10px 20px rgba(239, 68, 68, 0.1)'}}>
            <AlertCircle size={40} />
          </div>
          <h3 style={{fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '12px'}}>End Session?</h3>
          <p style={{color: '#64748b', fontSize: '1rem', marginBottom: '32px', maxWidth: '280px', margin: '0 auto 32px'}}>Your session keys will be purged from memory.</p>
          <div style={{display: 'flex', gap: '16px'}}>
            <button className="secondary-btn" style={{flex: 1}} onClick={() => setShowLogoutModal(false)} disabled={isLoggingOut}>Cancel</button>
            <button 
              className="primary-btn" 
              style={{background: '#ef4444', flex: 1}} 
              disabled={isLoggingOut}
              onClick={async () => {
                setIsLoggingOut(true);
                await onLogout();
                // We do not need to set it to false since the component will unmount
              }}
            >
              {isLoggingOut ? <Loader2 className="spin" size={20} /> : "Confirm"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
