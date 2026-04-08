import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { FileText, Clock, PlusCircle } from "lucide-react";
import { ToastProvider } from "./components/Toast";
import DocumentList from "./components/DocumentList";
import DocumentCreate from "./components/DocumentCreate";
import DocumentView from "./components/DocumentView";
import BatchSignPage from "./components/BatchSignPage";
import { getActionablePendingDocuments } from "./api/signdocClient";

export default function SignDocModule({ user }) {
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
        const initialTimer = setTimeout(() => loadPendingCount(), 0);
        const interval = setInterval(() => loadPendingCount(), 30000);
        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
        };
    }, []);

    const isActive = (path) => {
        // Relative path matching within the module
        const currentPath = location.pathname;
        if (path === "documents" && currentPath.endsWith("/signdoc/documents")) return true;
        if (path === "documents/pending" && currentPath.endsWith("/signdoc/documents/pending")) return true;
        return false;
    };

    return (
        <ToastProvider>
            <div className='bg-white rounded-2xl border border-slate-200 shadow-sm'>
                {/* Internal navigation bar */}
                <div className='border-b border-slate-200 px-4 py-3'>
                    <div className='flex items-center justify-between flex-wrap gap-3'>
                        <div className='flex items-center gap-3'>
                            <FileText className='w-6 h-6 text-indigo-600' />
                            <h2 className='text-lg font-bold text-slate-800'>
                                Документооборот
                            </h2>
                        </div>

                        <div className='flex items-center gap-2'>
                            <NavLink
                                to='documents'
                                end
                                className={({ isActive }) =>
                                    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        isActive
                                            ? "bg-indigo-100 text-indigo-700"
                                            : "text-slate-600 hover:bg-slate-100"
                                    }`
                                }>
                                <FileText className='w-4 h-4' />
                                Мои документы
                            </NavLink>

                            <NavLink
                                to='documents/pending'
                                className={({ isActive }) =>
                                    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                                        isActive
                                            ? "bg-indigo-100 text-indigo-700"
                                            : "text-slate-600 hover:bg-slate-100"
                                    }`
                                }>
                                <Clock className='w-4 h-4' />
                                На подпись
                                {pendingCount > 0 && (
                                    <span className='absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center'>
                                        {pendingCount}
                                    </span>
                                )}
                            </NavLink>

                            <NavLink
                                to='documents/new'
                                className='flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors'>
                                <PlusCircle className='w-4 h-4' />
                                Создать
                            </NavLink>

                        </div>
                    </div>

                    {user && (
                        <div className='mt-2 text-xs text-slate-500'>
                            Пользователь: {user.fullName || user.username || user.email}
                        </div>
                    )}
                </div>

                {/* Module content */}
                <div className='p-0'>
                    <Routes>
                        <Route index element={<Navigate to='documents' replace />} />
                        <Route path='documents' element={<DocumentList type='my' />} />
                        <Route path='documents/pending' element={<DocumentList type='pending' />} />
                        <Route path='documents/new' element={<DocumentCreate />} />
                        <Route path='documents/:id' element={<DocumentView />} />
                        <Route path='documents/batch-sign' element={<BatchSignPage />} />
                    </Routes>
                </div>
            </div>
        </ToastProvider>
    );
}
