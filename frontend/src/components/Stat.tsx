import { ReactNode } from "react";

type StatProps = {
  label: string;
  value: string | number;
  icon: ReactNode;
};

export function Stat({ label, value, icon }: StatProps) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-info">
        <label>{label}</label>
        <span>{value}</span>
      </div>
    </div>
  );
}
