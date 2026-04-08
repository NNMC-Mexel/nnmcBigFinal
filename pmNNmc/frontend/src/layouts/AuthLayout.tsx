import { Outlet } from 'react-router-dom';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-emerald-50 flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="ННМЦ" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="font-display font-bold text-lg text-slate-800">АО "ННМЦ"</h1>
            <p className="text-xs text-slate-500">Корпоративная система</p>
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-sm text-slate-500">
        © 2026 ТОО "Biocraft Digital"
      </footer>
    </div>
  );
}
