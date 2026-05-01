import { ReactNode } from "react";

type FieldProps = {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  error?: string;
};

export function Field({ label, icon, children, error }: FieldProps) {
  return (
    <div className={`field-group ${error ? 'has-error' : ''}`}>
      <label>{label}</label>
      <div className="input-wrapper">
        {icon && <span className="icon">{icon}</span>}
        {children}
      </div>
      {error && <span className="field-error-msg">{error}</span>}
    </div>
  );
}
