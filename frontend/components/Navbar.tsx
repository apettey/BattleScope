'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Search, Settings, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { CharacterAvatar } from './CharacterAvatar';
import api from '@/lib/api';

export function Navbar() {
  const pathname = usePathname();
  const { user, logout: storeLogout } = useAuth();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout', {});
      storeLogout();
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!user) return null;

  return (
    <nav className="bg-gray-900/95 border-b border-gray-800 sticky top-0 z-40 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-eve-blue rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">B</span>
            </div>
            <span className="text-xl font-bold text-white">BattleScope</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            <NavLink href="/dashboard" active={pathname === '/dashboard'}>
              Dashboard
            </NavLink>
            <NavLink href="/battles" active={pathname?.startsWith('/battles')}>
              Battles
            </NavLink>
            <NavLink href="/intel" active={pathname?.startsWith('/intel')}>
              Intel
            </NavLink>
            <NavLink href="/search" active={pathname === '/search'}>
              Search
            </NavLink>
            {user.roles.includes('admin') && (
              <NavLink href="/admin" active={pathname?.startsWith('/admin')}>
                Admin
              </NavLink>
            )}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center space-x-4">
            <Link
              href="/search"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <Search className="h-5 w-5" />
            </Link>
            <Link
              href="/notifications"
              className="text-gray-400 hover:text-white transition-colors relative"
            >
              <Bell className="h-5 w-5" />
            </Link>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-2"
                aria-label="User menu"
              >
                {user.primary_character && (
                  <CharacterAvatar
                    characterId={user.primary_character.character_id}
                    characterName={user.primary_character.character_name}
                    size={32}
                  />
                )}
              </button>

              {/* Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-lg z-50">
                  <div className="p-3 border-b border-gray-800">
                    <p className="text-sm font-medium text-white truncate">
                      {user.primary_character?.character_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.primary_character?.corp_name}
                    </p>
                  </div>
                  <Link
                    href="/characters"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Characters
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-gray-400 hover:text-white"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            {showMobileMenu ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {showMobileMenu && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900">
          <div className="px-4 py-3 space-y-1">
            <MobileNavLink
              href="/dashboard"
              active={pathname === '/dashboard'}
              onClick={() => setShowMobileMenu(false)}
            >
              Dashboard
            </MobileNavLink>
            <MobileNavLink
              href="/battles"
              active={pathname?.startsWith('/battles')}
              onClick={() => setShowMobileMenu(false)}
            >
              Battles
            </MobileNavLink>
            <MobileNavLink
              href="/intel"
              active={pathname?.startsWith('/intel')}
              onClick={() => setShowMobileMenu(false)}
            >
              Intel
            </MobileNavLink>
            <MobileNavLink
              href="/search"
              active={pathname === '/search'}
              onClick={() => setShowMobileMenu(false)}
            >
              Search
            </MobileNavLink>
            <MobileNavLink
              href="/characters"
              active={pathname === '/characters'}
              onClick={() => setShowMobileMenu(false)}
            >
              Characters
            </MobileNavLink>
            {user.roles.includes('admin') && (
              <MobileNavLink
                href="/admin"
                active={pathname?.startsWith('/admin')}
                onClick={() => setShowMobileMenu(false)}
              >
                Admin
              </MobileNavLink>
            )}
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-gray-800 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  active,
  children,
  onClick,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-gray-800 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}
