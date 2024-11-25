import React, { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [currentTheme, setCurrentTheme] = useState<string>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof localStorage !== 'undefined') {
      setCurrentTheme(localStorage.getItem('theme') ?? 'light');
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', currentTheme);
    }
  }, [currentTheme, mounted]);

  if (!mounted) {
    return <div className="w-10 h-10" />; // Placeholder to prevent layout shift
  }

  return (
    <button
      onClick={() => setCurrentTheme(currentTheme === 'dark' ? 'light' : 'dark')}
      className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 hover:from-primary/20 hover:to-secondary/20 transition-all duration-300"
      aria-label="テーマ切り替え"
    >
      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
        currentTheme === 'dark' ? 'rotate-180 opacity-0' : 'rotate-0 opacity-100'
      }`}>
        <span className="text-xl">🌞</span>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
        currentTheme === 'dark' ? 'rotate-0 opacity-100' : '-rotate-180 opacity-0'
      }`}>
        <span className="text-xl">✨</span>
      </div>
    </button>
  );
}