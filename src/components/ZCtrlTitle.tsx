import React from 'react';

interface ZCtrlTitleProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  animated?: boolean;
}

export const ZCtrlTitle: React.FC<ZCtrlTitleProps> = ({
  className = '',
  size = 'md',
  animated = false,
}) => {
  const sizeClasses = {
    sm: 'text-sm font-black tracking-wider',
    md: 'text-lg font-black tracking-widest',
    lg: 'text-2xl font-black tracking-widest',
    xl: 'text-4xl sm:text-5xl font-black tracking-widest',
    '2xl': 'text-5xl sm:text-7xl font-black tracking-widest',
  };

  return (
    <span
      className={`uppercase font-sans select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] ${sizeClasses[size]} ${
        animated ? 'animate-zctrl-title' : 'bg-gradient-to-r from-amber-400 via-yellow-200 to-cyan-400 bg-clip-text text-transparent'
      } ${className}`}
    >
      ZCTRL
    </span>
  );
};

export default ZCtrlTitle;
