import { Shield } from "lucide-react";

type BrandLockupProps = {
  subtitle: string;
};

export function BrandLockup({ subtitle }: BrandLockupProps) {
  return (
    <div className="brand-lockup">
      <img src="/favicon.png" alt="VaultSphere" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
      <div>
        <p>VaultSphere</p>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
