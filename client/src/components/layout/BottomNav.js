import { MoreHorizontal } from 'lucide-react';
import { shortNavLabel } from '../../utils/navigationMode';

export default function BottomNav({
  primaryItems,
  activeSection,
  overflowActive,
  hasOverflow,
  onNavClick,
  onMoreClick,
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 pb-safe"
      aria-label="Main navigation"
    >
      <div className="flex items-stretch h-bottom-nav max-w-lg mx-auto">
        {primaryItems.map(([key, item]) => {
          const Icon = item.icon;
          const isActive = activeSection === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavClick(key)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span className="text-[10px] font-medium truncate max-w-full leading-tight">
                {shortNavLabel(item.title)}
              </span>
            </button>
          );
        })}
        {hasOverflow && (
          <button
            type="button"
            onClick={onMoreClick}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 transition-colors ${
              overflowActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-label="More sections"
          >
            <MoreHorizontal size={20} className="flex-shrink-0" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        )}
      </div>
    </nav>
  );
}
