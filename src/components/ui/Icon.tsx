import React from 'react';
import * as Lucide from 'lucide-react';
import { TOKENS } from '../../designTokens';

export const Icon: React.FC<{
  name: keyof typeof Lucide | string;
  size?: keyof typeof TOKENS.dim.icon | number;
  className?: string;
  strokeWidth?: number;
  color?: string;
}> = ({ name, size = 'md', className = '', strokeWidth = 2, color }) => {
  const Comp = (Lucide as Record<string, any>)[name] as React.FC<any>;
  if (!Comp) return null;
  const pixelSize = typeof size === 'number' ? size : TOKENS.dim.icon[size] ?? 16;
  return (
    <Comp
      size={pixelSize}
      strokeWidth={strokeWidth}
      className={className}
      style={color ? { color } : undefined}
    />
  );
};
