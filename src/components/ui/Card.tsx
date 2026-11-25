import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'elevated' | 'glass';
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'surface',
  header,
  footer,
  className = '',
  ...props
}) => {
  const variantClasses = {
    surface: 'bg-slate-900 border border-slate-800/90 shadow-md',
    elevated: 'bg-slate-850 border border-slate-700/80 shadow-lg',
    glass: 'bg-slate-900/80 backdrop-blur-md border border-slate-800/80 shadow-md'
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${variantClasses[variant]} ${className}`} {...props}>
      {header && <div className="p-4 border-b border-slate-800/80">{header}</div>}
      <div className="p-4">{children}</div>
      {footer && <div className="p-3 bg-slate-950/50 border-t border-slate-800/80">{footer}</div>}
    </div>
  );
};
