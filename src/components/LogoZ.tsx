import React from 'react';

interface LogoZProps {
  size?: number;
  className?: string;
  disableGlow?: boolean;
}

export const LogoZ: React.FC<LogoZProps> = ({ size = 80, className = '', disableGlow = false }) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center select-none bg-transparent ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Optional subtle static lighting highlight */}
      {!disableGlow && (
        <div
          className="absolute inset-0 rounded-full bg-amber-500/10 scale-90 pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Executive 3D Gold & Cyber Vector Logo */}
      <img
        src="/icon.svg"
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src.endsWith('/icon.svg')) {
            target.src = '/icon.png';
          }
        }}
        alt="ZCtrl Logo"
        width={size}
        height={size}
        className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(245,158,11,0.2)]"
        referrerPolicy="no-referrer"
        draggable={false}
      />
    </div>
  );
};
