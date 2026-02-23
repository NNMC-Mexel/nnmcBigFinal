import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    LayoutDashboard,
    Kanban,
    Table,
    LogOut,
    Menu,
    X,
    Activity,
    User,
    Shield,
    Headphones,
    Calculator,
    BarChart2,
    Newspaper,
    Settings2,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore, useUserRole } from "../store/authStore";
import LanguageSwitcher from "../components/ui/LanguageSwitcher";

export default function AppLayout() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { user, logout } = useAuthStore();
    const {
        role,
        canEdit,
        isAdmin,
        isSuperAdmin,
        canViewDashboard,
        canViewBoard,
        canViewTable,
        canViewHelpdesk,
        canViewKpiIt,
        canViewKpiMedical,
        canViewKpiEngineering,
        canViewKpiTimesheet,
    } = useUserRole();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    // News feed — always visible to all authenticated users
    const newsNavItems = [
        {
            to: "/app/news",
            icon: Newspaper,
            label: "Новостная лента",
        },
    ];

    const projectNavItems = [
        canViewDashboard
            ? {
                  to: "/app/dashboard",
                  icon: LayoutDashboard,
                  label: t("nav.dashboard"),
              }
            : null,
        canViewBoard ? { to: "/app/board", icon: Kanban, label: t("nav.board") } : null,
        canViewTable ? { to: "/app/table", icon: Table, label: t("nav.table") } : null,
    ].filter(Boolean) as Array<{ to: string; icon: typeof LayoutDashboard; label: string }>;

    const helpdeskNavItems = [
        canViewHelpdesk
            ? {
                  to: "/app/helpdesk",
                  icon: Headphones,
                  label: t("nav.helpdesk", "Заявки"),
              }
            : null,
        ...(canViewKpiIt
            ? [
                  {
                      to: "/app/kpi-it",
                      icon: Calculator,
                      label: "KPI IT",
                  },
              ]
            : []),
        ...(canViewKpiMedical
            ? [
                  {
                      to: "/app/kpi-medical",
                      icon: Calculator,
                      label: "KPI Медоборудование",
                  },
              ]
            : []),
        ...(canViewKpiEngineering
            ? [
                  {
                      to: "/app/kpi-engineering",
                      icon: Calculator,
                      label: "KPI Инженерная служба",
                  },
              ]
            : []),
        ...(canViewKpiTimesheet
            ? [
                  {
                      to: "/app/kpi-timesheet",
                      icon: BarChart2,
                      label: "KPI Табель",
                  },
              ]
            : []),
    ].filter(Boolean) as Array<{ to: string; icon: typeof Headphones; label: string }>;

    const navItems = [...projectNavItems, ...helpdeskNavItems];

    // Страницы для администраторов (admin + superadmin)
    const adminNavItems =
        isAdmin || isSuperAdmin
            ? [
                  {
                      to: "/app/news-admin",
                      icon: Settings2,
                      label: "Управление новостями",
                  },
                  {
                      to: "/app/activity",
                      icon: Activity,
                      label: t("nav.activity", "История действий"),
                  },
              ]
            : [];

    // Панель только для супер-админа
    const superAdminItems = isSuperAdmin
        ? [
              {
                  to: "/app/admin",
                  icon: Shield,
                  label: t("nav.adminPanel", "Админ-панель"),
              },
          ]
        : [];

    const getFullName = () => {
        if (user?.firstName || user?.lastName) {
            return `${user.firstName || ""} ${user.lastName || ""}`.trim();
        }
        return user?.username || user?.email || "";
    };

    return (
        <div className='min-h-screen bg-slate-50 flex'>
            {/* Sidebar overlay for mobile */}
            {sidebarOpen && (
                <div
                    className='fixed inset-0 bg-black/50 z-40 lg:hidden'
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 w-64 h-screen bg-white border-r border-slate-200 transform transition-transform duration-200 lg:translate-x-0 ${
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`}>
                <div className='flex flex-col h-full'>
                    {/* Logo */}
                    <div className='p-4 border-b border-slate-100'>
                        <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center'>
                                <svg
                                    className='w-6 h-6 text-white'
                                    fill='none'
                                    viewBox='0 0 24 24'
                                    stroke='currentColor'>
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2'
                                    />
                                </svg>
                            </div>
                            <div>
                                <h1 className='font-display font-bold text-slate-800'>
                                    NNMC IT Board
                                </h1>
                                <p className='text-xs text-slate-500'>
                                    Project Management
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation - scrollable */}
                    <nav className='flex-1 min-h-0 p-4 space-y-1 overflow-y-auto'>
                        {/* News feed — always first */}
                        {newsNavItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                        isActive
                                            ? "bg-primary-50 text-primary-700 font-medium"
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                onClick={() => setSidebarOpen(false)}>
                                <item.icon className='w-5 h-5' />
                                {item.label}
                            </NavLink>
                        ))}

                        {/* Project / Helpdesk nav items */}
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                        isActive
                                            ? "bg-primary-50 text-primary-700 font-medium"
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                onClick={() => setSidebarOpen(false)}>
                                <item.icon className='w-5 h-5' />
                                {item.label}
                            </NavLink>
                        ))}

                        {/* External links */}
                        {/* <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-medium text-slate-400 uppercase">
                Сервисы
              </p>
            </div>
            <a
              href="http://192.168.101.25:13000/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-slate-600 hover:bg-slate-50"
              onClick={() => setSidebarOpen(false)}
            >
              <Calculator className="w-5 h-5" />
              KPI расчет
            </a> */}

                        {/* Admin items */}
                        {adminNavItems.length > 0 && (
                            <>
                                <div className='pt-4 pb-2'>
                                    <p className='px-3 text-xs font-medium text-slate-400 uppercase'>
                                        Администрирование
                                    </p>
                                </div>
                                {adminNavItems.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        className={({ isActive }) =>
                                            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                                isActive
                                                    ? "bg-primary-50 text-primary-700 font-medium"
                                                    : "text-slate-600 hover:bg-slate-50"
                                            }`
                                        }
                                        onClick={() => setSidebarOpen(false)}>
                                        <item.icon className='w-5 h-5' />
                                        {item.label}
                                    </NavLink>
                                ))}
                            </>
                        )}

                        {/* Super Admin Panel */}
                        {superAdminItems.length > 0 && (
                            <>
                                <div className='pt-4 pb-2'>
                                    <p className='px-3 text-xs font-medium text-red-400 uppercase'>
                                        Супер Админ
                                    </p>
                                </div>
                                {superAdminItems.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        className={({ isActive }) =>
                                            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                                isActive
                                                    ? "bg-red-50 text-red-700 font-medium"
                                                    : "text-red-600 hover:bg-red-50"
                                            }`
                                        }
                                        onClick={() => setSidebarOpen(false)}>
                                        <item.icon className='w-5 h-5' />
                                        {item.label}
                                    </NavLink>
                                ))}
                            </>
                        )}
                    </nav>

                    {/* User info & logout */}
                    <div className='p-4 border-t border-slate-100'>
                        {/* Кликабельный профиль */}
                        <button
                            onClick={() => {
                                navigate("/app/profile");
                                setSidebarOpen(false);
                            }}
                            className='w-full mb-3 p-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors text-left flex items-center gap-3'>
                            <div className='w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center text-white font-bold text-sm'>
                                {getFullName().charAt(0).toUpperCase() || "U"}
                            </div>
                            <div className='flex-1 min-w-0'>
                                <p className='font-medium text-slate-800 truncate'>
                                    {getFullName()}
                                </p>
                                <p className='text-xs text-slate-500 flex items-center gap-1'>
                                    <span
                                        className={`w-2 h-2 rounded-full ${canEdit ? "bg-primary-500" : "bg-slate-400"}`}
                                    />
                                    {t(`role.${role}`)}
                                </p>
                            </div>
                            <User className='w-4 h-4 text-slate-400' />
                        </button>

                        <button
                            onClick={handleLogout}
                            className='flex items-center gap-2 w-full px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors'>
                            <LogOut className='w-5 h-5' />
                            {t("nav.logout")}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className='flex-1 flex flex-col min-w-0'>
                {/* Top bar */}
                <header className='bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between lg:justify-end'>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className='lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg'>
                        {sidebarOpen ? (
                            <X className='w-5 h-5' />
                        ) : (
                            <Menu className='w-5 h-5' />
                        )}
                    </button>

                    <LanguageSwitcher />
                </header>

                {/* Page content */}
                <main className='flex-1 p-4 lg:p-6 overflow-auto'>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
