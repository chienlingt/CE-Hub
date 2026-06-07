import { X, ChevronRight } from 'lucide-react';

export default function MobileNavDrawer({
  isOpen,
  onClose,
  items,
  activeSection,
  onSelect,
  title = 'Navigation',
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <span className="text-lg font-bold text-gray-800">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-2">
            {items.map(([key, item]) => {
              const Icon = item.icon;
              const isActive = activeSection === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`w-full flex items-center px-3 py-3 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  <Icon
                    size={20}
                    className={`flex-shrink-0 ${
                      isActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-600'
                    }`}
                  />
                  <span className="ml-3 font-medium truncate">{item.title}</span>
                  <ChevronRight
                    size={16}
                    className={`ml-auto flex-shrink-0 ${
                      isActive ? 'text-white' : 'text-gray-400 group-hover:text-blue-600'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
