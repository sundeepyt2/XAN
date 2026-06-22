"use client";

// components/layout/Navbar.tsx
// ✅ "use client" — scroll listener + state

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Search, Menu, X, Play, Home as HomeIcon, Flame, History, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Home", href: "/home", icon: HomeIcon },
  { label: "Trending", href: "/trending", icon: Flame },
  { label: "History", href: "/history", icon: History },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) {
      window.location.href = `/search?q=${encodeURIComponent(q)}`;
    }
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-xan-border"
          : "bg-transparent",
      )}
    >
      <nav className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/home"
          className="flex items-center gap-2 group flex-shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-xan-crimson to-xan-violet flex items-center justify-center group-hover:scale-105 transition-transform">
            <Play className="h-4 w-4 text-white fill-white" />
          </div>
          <span className="font-display font-extrabold text-xl text-foreground">
            XAN
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "text-foreground bg-xan-card-hover"
                    : "text-muted-foreground hover:text-foreground hover:bg-xan-card",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Search + actions */}
        <div className="flex items-center gap-2">
          {/* Desktop search */}
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex items-center relative"
          >
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search anime..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-9 w-48 lg:w-64 bg-xan-card border-xan-border focus-visible:ring-xan-crimson/30"
            />
          </form>

          {/* Settings link (desktop) */}
          <Link
            href="/settings"
            className={cn(
              "hidden md:flex w-9 h-9 items-center justify-center rounded-lg transition-colors",
              pathname === "/settings"
                ? "text-foreground bg-xan-card-hover"
                : "text-muted-foreground hover:text-foreground hover:bg-xan-card",
            )}
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>

          {/* Mobile search toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Toggle search"
          >
            {searchOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </Button>

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </nav>

      {/* Mobile search */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-xan-border bg-background"
          >
            <form
              onSubmit={handleSearchSubmit}
              className="px-4 py-3 flex items-center relative"
            >
              <Search className="absolute left-7 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search anime..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                autoFocus
                className="pl-9 bg-xan-card border-xan-border"
              />
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-xan-border bg-background"
          >
            <div className="px-4 py-3 flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors",
                      isActive
                        ? "text-foreground bg-xan-card-hover"
                        : "text-muted-foreground hover:text-foreground hover:bg-xan-card",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
              <Link
                href="/settings"
                className={cn(
                  "px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors border-t border-xan-border mt-2 pt-3",
                  pathname === "/settings"
                    ? "text-foreground bg-xan-card-hover"
                    : "text-muted-foreground hover:text-foreground hover:bg-xan-card",
                )}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
