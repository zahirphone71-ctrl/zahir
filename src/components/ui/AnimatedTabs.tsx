import React from 'react';
import { TOKENS, ICON_MAP } from '../../designTokens';
import { Icon } from './Icon';

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
}

export const AnimatedTabs: React.FC<{
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className = '' }) => {
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto custom-scrollbar p-1 bg-slate-950 border border-slate-800/80 rounded-2xl ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const iconName = tab.icon ? (ICON_MAP as Record<string, string>)[tab.icon] || tab.icon : undefined;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              height: TOKENS.dim.tab.h,
              padding: `0 ${TOKENS.dim.tab.px}px`,
              fontSize: TOKENS.dim.tab.font,
              borderRadius: TOKENS.radius.md,
              transitionDuration: TOKENS.motion.duration.fast,
            }}
            className={`flex items-center gap-2 font-bold whitespace-nowrap transition-all cursor-pointer relative select-none ${
              isActive
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            {iconName && <Icon name={iconName} size="sm" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
