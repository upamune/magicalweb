import React, { useState } from 'react';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="fixed w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <a href="/" className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            マヂカル.fm
          </a>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <a href="/episodes" className="hover:text-primary transition-colors">エピソード</a>
            <a href="/#hosts" className="hover:text-primary transition-colors">パーソナリティ</a>
            <a href="/#merch" className="hover:text-primary transition-colors">グッズ</a>
            <a href="/#contact" className="hover:text-primary transition-colors">お便り</a>
            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-4 md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 hover:from-primary/20 hover:to-secondary/20 transition-all duration-300"
              aria-label="メニュー"
            >
              <svg
                className={`w-6 h-6 transition-transform duration-300 ${isMenuOpen ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden transition-all duration-300 ease-in-out ${
            isMenuOpen
              ? 'max-h-64 opacity-100 mt-4'
              : 'max-h-0 opacity-0 overflow-hidden'
          }`}
        >
          <div className="flex flex-col gap-4 py-4">
            <a
              href="/episodes"
              className="px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              エピソード
            </a>
            <a
              href="/#hosts"
              className="px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              パーソナリティ
            </a>
            <a
              href="/#merch"
              className="px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              グッズ
            </a>
            <a
              href="/#contact"
              className="px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              お便り
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}