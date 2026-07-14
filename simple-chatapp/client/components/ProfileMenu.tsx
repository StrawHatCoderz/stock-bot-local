import { useEffect, useRef, useState } from "react";

interface ProfileMenuProps {
  name: string;
  role: string;
  storeId: string;
  onLogout?: () => void;
}

export function ProfileMenu({ name, role, storeId, onLogout }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Dropdown */}
      <div
        className={`absolute bottom-full left-0 right-0 mb-2 origin-bottom rounded-lg bg-gray-800 shadow-lg border border-gray-700 overflow-hidden transition-all duration-150 ${
          isOpen
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <button
          onClick={() => {
            setIsOpen(false);
            onLogout?.();
          }}
          className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
        >
          Log out
        </button>
      </div>

      {/* Pill */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-gray-700 cursor-pointer transition-colors ${
          isOpen ? "bg-gray-800" : "hover:bg-gray-800"
        }`}
      >
        <span className="shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">
          👤
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white truncate">{name}</span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-300">
              {role}
            </span>
          </span>
          <span className="block text-xs text-gray-400 truncate">{storeId}</span>
        </span>
      </button>
    </div>
  );
}
