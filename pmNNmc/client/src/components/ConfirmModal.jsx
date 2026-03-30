import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Подтверждение",
    message = "Вы уверены?",
    confirmText = "Подтвердить",
    cancelText = "Отмена",
    type = "danger",
    isLoading = false,
    children,
}) {
    if (!isOpen) return null;

    const typeStyles = {
        danger: {
            iconBg: "bg-red-100",
            iconColor: "text-red-600",
            buttonBg: "bg-red-600 hover:bg-red-700",
            icon: Trash2,
        },
        warning: {
            iconBg: "bg-yellow-100",
            iconColor: "text-yellow-600",
            buttonBg: "bg-yellow-600 hover:bg-yellow-700",
            icon: AlertTriangle,
        },
        info: {
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600",
            buttonBg: "bg-blue-600 hover:bg-blue-700",
            icon: AlertTriangle,
        },
    };

    const style = typeStyles[type] || typeStyles.danger;
    const Icon = style.icon;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
            {/* Затемнённый фон с blur */}
            <div
                className='absolute inset-0 bg-black/40 backdrop-blur-sm'
                onClick={handleBackdropClick}
                style={{ animation: "fadeIn 0.2s ease-out" }}
            />

            {/* Модальное окно */}
            <div
                className='relative bg-white rounded-2xl shadow-2xl max-w-md w-full'
                style={{ animation: "scaleIn 0.2s ease-out" }}>
                {/* Заголовок */}
                <div className='flex items-center justify-between p-6 border-b border-gray-100'>
                    <h3 className='text-xl font-semibold text-gray-800'>
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className='p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors'>
                        <X className='w-5 h-5' />
                    </button>
                </div>

                {/* Контент */}
                <div className='p-6'>
                    <div className='flex items-start gap-4'>
                        <div
                            className={`p-3 rounded-full ${style.iconBg} flex-shrink-0`}>
                            <Icon className={`w-6 h-6 ${style.iconColor}`} />
                        </div>
                        <div className='flex-1 pt-1'>
                            <p className='text-gray-600 text-base leading-relaxed'>
                                {message}
                            </p>
                        </div>
                    </div>
                    {children && <div className='mt-4'>{children}</div>}
                </div>

                {/* Кнопки */}
                <div className='flex gap-3 p-6 pt-2 border-t border-gray-100'>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className='flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors disabled:opacity-50'>
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-1 py-2.5 px-4 ${style.buttonBg} text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}>
                        {isLoading ? (
                            <>
                                <svg
                                    className='animate-spin w-4 h-4'
                                    fill='none'
                                    viewBox='0 0 24 24'>
                                    <circle
                                        className='opacity-25'
                                        cx='12'
                                        cy='12'
                                        r='10'
                                        stroke='currentColor'
                                        strokeWidth='4'></circle>
                                    <path
                                        className='opacity-75'
                                        fill='currentColor'
                                        d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                                </svg>
                                Загрузка...
                            </>
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { 
                        opacity: 0; 
                        transform: scale(0.9) translateY(-10px); 
                    }
                    to { 
                        opacity: 1; 
                        transform: scale(1) translateY(0); 
                    }
                }
            `}</style>
        </div>
    );
}
