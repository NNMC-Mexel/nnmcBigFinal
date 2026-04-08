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
    CalendarRange,
    BookOpen,
    FileSignature,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore, useUserRole } from "../store/authStore";
import LanguageSwitcher from "../components/ui/LanguageSwitcher";

export default function AppLayout() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { user } = useAuthStore();
    const {
        role,
        canEdit,
        isSuperAdmin,
        canViewDashboard,
        canViewBoard,
        canViewTable,
        canViewHelpdesk,
        canViewKpiIt,
        canViewKpiMedical,
        canViewKpiEngineering,
        canViewKpiTimesheet,
        canAccessConf,
        canAccessJournal,
        canAccessSigndoc,
        canManageNews,
        canViewActivityLog,
    } = useUserRole();

    const handleLogout = () => {
        // Clear ALL tokens and Zustand state
        useAuthStore.getState().logout();
        localStorage.removeItem('auth-storage');
        // Redirect to /logged-out (works with or without Keycloak)
        window.location.href = '/logged-out';
    };

    // No longer needed — services use department flags directly

    // News feed — always visible to all authenticated users
    const newsNavItems = [
        {
            to: "/app/news",
            icon: Newspaper,
            label: "Новостная лента",
            iconColor: "text-orange-500",
            activeBg: "bg-orange-50",
            activeText: "text-orange-700",
        },
    ];

    const projectNavItems = [
        canViewDashboard
            ? {
                  to: "/app/dashboard",
                  icon: LayoutDashboard,
                  label: t("nav.dashboard"),
                  iconColor: "text-blue-500",
                  activeBg: "bg-blue-50",
                  activeText: "text-blue-700",
              }
            : null,
        canViewBoard ? { to: "/app/board", icon: Kanban, label: t("nav.board"), iconColor: "text-violet-500", activeBg: "bg-violet-50", activeText: "text-violet-700" } : null,
        canViewTable ? { to: "/app/table", icon: Table, label: t("nav.table"), iconColor: "text-cyan-500", activeBg: "bg-cyan-50", activeText: "text-cyan-700" } : null,
    ].filter(Boolean) as Array<{ to: string; icon: typeof LayoutDashboard; label: string; iconColor: string; activeBg: string; activeText: string }>;

    const helpdeskNavItems = [
        canViewHelpdesk
            ? {
                  to: "/app/helpdesk",
                  icon: Headphones,
                  label: t("nav.helpdesk", "Заявки"),
                  iconColor: "text-emerald-500",
                  activeBg: "bg-emerald-50",
                  activeText: "text-emerald-700",
              }
            : null,
        ...(canViewKpiIt
            ? [
                  {
                      to: "/app/kpi-it",
                      icon: Calculator,
                      label: "KPI IT",
                      iconColor: "text-teal-500",
                      activeBg: "bg-teal-50",
                      activeText: "text-teal-700",
                  },
              ]
            : []),
        ...(canViewKpiMedical
            ? [
                  {
                      to: "/app/kpi-medical",
                      icon: Calculator,
                      label: "KPI Медоборудование",
                      iconColor: "text-rose-500",
                      activeBg: "bg-rose-50",
                      activeText: "text-rose-700",
                  },
              ]
            : []),
        ...(canViewKpiEngineering
            ? [
                  {
                      to: "/app/kpi-engineering",
                      icon: Calculator,
                      label: "KPI Инженерная служба",
                      iconColor: "text-amber-500",
                      activeBg: "bg-amber-50",
                      activeText: "text-amber-700",
                  },
              ]
            : []),
        ...(canViewKpiTimesheet
            ? [
                  {
                      to: "/app/kpi-timesheet",
                      icon: BarChart2,
                      label: "KPI Табель",
                      iconColor: "text-indigo-500",
                      activeBg: "bg-indigo-50",
                      activeText: "text-indigo-700",
                  },
              ]
            : []),
    ].filter(Boolean) as Array<{ to: string; icon: typeof Headphones; label: string; iconColor: string; activeBg: string; activeText: string }>;

    const navItems = [...projectNavItems, ...helpdeskNavItems];

    const adminNavItems = [
        ...(canManageNews ? [{
            to: "/app/news-admin",
            icon: Settings2,
            label: "Управление новостями",
        }] : []),
        ...(canViewActivityLog ? [{
            to: "/app/activity",
            icon: Activity,
            label: t("nav.activity", "История действий"),
        }] : []),
    ];

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
        <div className='min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-50 flex'>
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
                            <img src="/logo.png" alt="ННМЦ" className="w-10 h-10 object-contain" />
                            <div>
                                <h1 className='font-display font-bold text-slate-800'>
                                    АО "ННМЦ"
                                </h1>
                                <p className='text-xs text-slate-500'>
                                    Корпоративная система
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
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                                        isActive
                                            ? `${item.activeBg} ${item.activeText} font-medium`
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                onClick={() => setSidebarOpen(false)}>
                                {({ isActive }) => (
                                    <>
                                        <item.icon className={`w-5 h-5 ${isActive ? item.activeText : item.iconColor}`} />
                                        <span>{item.label}</span>
                                    </>
                                )}
                            </NavLink>
                        ))}

                        {/* Project / Helpdesk nav items */}
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                                        isActive
                                            ? `${item.activeBg} ${item.activeText} font-medium`
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                onClick={() => setSidebarOpen(false)}>
                                {({ isActive }) => (
                                    <>
                                        <item.icon className={`w-5 h-5 ${isActive ? item.activeText : item.iconColor}`} />
                                        <span>{item.label}</span>
                                    </>
                                )}
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

                        {/* Services — visible based on department flags */}
                        {(canAccessConf || canAccessJournal || canAccessSigndoc) && (
                            <div className='pt-4 pb-2'>
                                <p className='px-3 text-xs font-medium text-slate-400 uppercase'>
                                    Сервисы
                                </p>
                            </div>
                        )}
                        {canAccessConf && (
                            <NavLink
                                to="/app/rooms"
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                                        isActive
                                            ? "bg-sky-50 text-sky-700 font-medium"
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                onClick={() => setSidebarOpen(false)}>
                                {({ isActive }) => (
                                    <>
                                        <CalendarRange className={`w-5 h-5 ${isActive ? "text-sky-700" : "text-sky-500"}`} />
                                        <span>Конференц-залы</span>
                                    </>
                                )}
                            </NavLink>
                        )}
                        {canAccessJournal && (
                            <NavLink
                                to="/app/journal"
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                                        isActive
                                            ? "bg-purple-50 text-purple-700 font-medium"
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                onClick={() => setSidebarOpen(false)}>
                                {({ isActive }) => (
                                    <>
                                        <BookOpen className={`w-5 h-5 ${isActive ? "text-purple-700" : "text-purple-500"}`} />
                                        <span>Журнал приёмной</span>
                                    </>
                                )}
                            </NavLink>
                        )}
                        {canAccessSigndoc && (
                            <NavLink
                                to="/app/signdoc"
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                                        isActive
                                            ? "bg-fuchsia-50 text-fuchsia-700 font-medium"
                                            : "text-slate-600 hover:bg-slate-50"
                                    }`
                                }
                                onClick={() => setSidebarOpen(false)}>
                                {({ isActive }) => (
                                    <>
                                        <FileSignature className={`w-5 h-5 ${isActive ? "text-fuchsia-700" : "text-fuchsia-500"}`} />
                                        <span>Документооборот</span>
                                    </>
                                )}
                            </NavLink>
                        )}

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
