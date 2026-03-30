import React, { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { logout, getCurrentUser } from "../api/auth";
import { getActionablePendingDocuments } from "../api/documents";
import { LogOut, FileText, Clock, PlusCircle } from "lucide-react";

export default function MainLayout() {
    const [user] = useState(getCurrentUser());
    const [pendingCount, setPendingCount] = useState(0);
    const location = useLocation();

    const loadPendingCount = async () => {
        try {
            const pending = await getActionablePendingDocuments();
            setPendingCount(pending.length);
        } catch (error) {
            console.error("Ошибка загрузки счётчика:", error);
        }
    };

    useEffect(() => {
        const initialTimer = setTimeout(() => {
            loadPendingCount();
        }, 0);

        const interval = setInterval(() => {
            loadPendingCount();
        }, 30000);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
        };
    }, []);

    const handleLogout = () => {
        logout();
        window.location.reload();
    };

    const isActive = (path) => {
        return location.pathname === path;
    };

    return (
        <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100'>
            <header className='bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50'>
                <div className='max-w-7xl mx-auto px-4 py-3'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <FileText className='w-8 h-8 text-indigo-600' />
                            <h1 className='text-xl font-bold text-gray-800'>
                                Электронная подпись
                            </h1>
                        </div>

                        <nav className='hidden md:flex items-center gap-2'>
                            <Link
                                to='/documents'
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                                    isActive("/documents")
                                        ? "bg-indigo-100 text-indigo-700"
                                        : "text-gray-700 hover:bg-gray-100"
                                }`}>
                                <FileText className='w-5 h-5' />
                                Мои документы
                            </Link>

                            <Link
                                to='/documents/pending'
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors relative ${
                                    isActive("/documents/pending")
                                        ? "bg-indigo-100 text-indigo-700"
                                        : "text-gray-700 hover:bg-gray-100"
                                }`}>
                                <Clock className='w-5 h-5' />
                                На подпись
                                {pendingCount > 0 && (
                                    <span className='absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center'>
                                        {pendingCount}
                                    </span>
                                )}
                            </Link>

                            <Link
                                to='/documents/new'
                                className='flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors'>
                                <PlusCircle className='w-5 h-5' />
                                Создать
                            </Link>
                        </nav>

                        <div className='flex items-center gap-3'>
                            <div className='hidden sm:block text-right'>
                                <p className='text-sm font-medium text-gray-900'>
                                    {user?.username}
                                </p>
                                <p className='text-xs text-gray-500'>
                                    {user?.email}
                                </p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className='flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors'>
                                <LogOut className='w-4 h-4' />
                                <span className='hidden sm:inline'>Выйти</span>
                            </button>
                        </div>
                    </div>

                    <nav className='md:hidden flex items-center gap-2 mt-3 overflow-x-auto'>
                        <Link
                            to='/documents'
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                isActive("/documents")
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "text-gray-700 hover:bg-gray-100"
                            }`}>
                            <FileText className='w-4 h-4' />
                            Мои
                        </Link>

                        <Link
                            to='/documents/pending'
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors relative ${
                                isActive("/documents/pending")
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "text-gray-700 hover:bg-gray-100"
                            }`}>
                            <Clock className='w-4 h-4' />
                            На подпись
                            {pendingCount > 0 && (
                                <span className='absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center'>
                                    {pendingCount}
                                </span>
                            )}
                        </Link>

                        <Link
                            to='/documents/new'
                            className='flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium whitespace-nowrap'>
                            <PlusCircle className='w-4 h-4' />
                            Создать
                        </Link>
                    </nav>
                </div>
            </header>

            <main>
                <Outlet />
            </main>
        </div>
    );
}
