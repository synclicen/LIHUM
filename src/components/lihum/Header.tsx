"use client";

import React from "react";
import type { User } from "firebase/auth";
import { Shield, LogOut } from "lucide-react";

interface HeaderProps {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  isAdminMode: boolean;
  setIsAdminMode: (mode: boolean) => void;
  role?: "admin" | "manager" | null;
}

export default function Header({
  user,
  onLogin,
  onLogout,
  isAdminMode,
  setIsAdminMode,
  role,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-[#4C2A85] border-b border-[#D4AF37]/30 shadow-xl shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo with Sleek Interface Style */}
        <div className="flex items-center gap-3 select-none">
          <div className="w-10 h-10 bg-[#D4AF37] rounded-lg flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
            <svg
              className="w-6 h-6 text-[#4C2A85]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight uppercase">
              LIHUM
            </span>
            <div className="text-[9px] text-[#D4AF37]/80 uppercase font-mono tracking-widest leading-none">
              Lihat, Unduh Mandiri!
            </div>
          </div>
        </div>

        {/* Action Controls & Badges */}
        <div className="flex items-center space-x-3">
          {/* Constant status indicator */}
          <div className="hidden sm:flex items-center bg-white/10 rounded-full px-3.5 py-1.5 border border-white/20">
            <div className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></div>
            <span className="text-white text-[11px] font-medium tracking-wide">
              Drive Sync Active
            </span>
          </div>

          {user ? (
            <div className="flex items-center space-x-2.5">
              {/* Toggle Admin/Manager mode */}
              <button
                id="toggle-admin-btn"
                onClick={() => setIsAdminMode(!isAdminMode)}
                className={`flex items-center space-x-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all ${
                  isAdminMode
                    ? "bg-[#D4AF37] text-[#4C2A85] shadow-lg shadow-[#D4AF37]/20 hover:bg-[#dfbb66]"
                    : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                }`}
                title={
                  role === "admin"
                    ? "Aktifkan Panel Admin"
                    : "Aktifkan Panel Manajer"
                }
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden md:inline">
                  {isAdminMode
                    ? `${role === "admin" ? "Console Admin: On" : "Console Manajer: On"}`
                    : `${role === "admin" ? "Console Admin: Off" : "Console Manajer: Off"}`}
                </span>
                <span className="md:hidden">Console</span>
              </button>

              {/* User badge */}
              <div className="hidden md:flex items-center space-x-2 bg-[#1F0F3D] border border-[#D4AF37]/20 rounded-full py-1 px-3">
                {user.photoURL ? (
                  <img
                    referrerPolicy="no-referrer"
                    src={user.photoURL || ""}
                    alt={user.displayName || "Pengelola"}
                    className="w-5 h-5 rounded-full border border-[#D4AF37]/35"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-amber-500 text-[10px] text-slate-950 flex items-center justify-center font-bold">
                    {role === "admin" ? "A" : "M"}
                  </div>
                )}
                <span className="text-[11px] text-white font-medium max-w-[100px] truncate">
                  {user.displayName?.split(" ")[0] ||
                    (role === "admin" ? "Admin" : "Manajer")}
                </span>
              </div>

              {/* Log Out button */}
              <button
                id="logout-btn"
                onClick={onLogout}
                className="flex items-center space-x-1 p-2 rounded-full text-slate-200 hover:text-red-400 hover:bg-white/5 transition-all"
                title="Keluar Akun"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-semibold">Keluar</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-end">
              <button
                id="login-btn"
                onClick={onLogin}
                className="bg-[#D4AF37] text-[#4C2A85] px-5 py-2 rounded-full font-bold text-xs tracking-wider uppercase shadow-xl hover:bg-[#dfbb66] active:scale-95 transition-all cursor-pointer"
              >
                Masuk Pengelola
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
