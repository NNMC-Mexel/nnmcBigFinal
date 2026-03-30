import React, {
    useState,
    useEffect,
    createContext,
    useContext,
    useCallback,
} from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

// Контекст для уведомлений
const ToastContext = createContext(null);

// Типы уведомлений
const TOAST_TYPES = {
    success: {
        icon: CheckCircle,
        bgColor: "bg-green-50",
        borderColor: "border-green-500",
        iconColor: "text-green-500",
        textColor: "text-green-800",
        progressColor: "bg-green-500",
    },
    error: {
        icon: XCircle,
        bgColor: "bg-red-50",
        borderColor: "border-red-500",
        iconColor: "text-red-500",
        textColor: "text-red-800",
        progressColor: "bg-red-500",
    },
    warning: {
        icon: AlertTriangle,
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-500",
        iconColor: "text-yellow-500",
        textColor: "text-yellow-800",
        progressColor: "bg-yellow-500",
    },
    info: {
        icon: Info,
        bgColor: "bg-blue-50",
        borderColor: "border-blue-500",
        iconColor: "text-blue-500",
        textColor: "text-blue-800",
        progressColor: "bg-blue-500",
    },
};

// Компонент одного уведомления
function ToastItem({ id, type, message, onClose, duration = 5000 }) {
    const [isExiting, setIsExiting] = useState(false);
    const [progress, setProgress] = useState(100);
    const config = TOAST_TYPES[type] || TOAST_TYPES.info;
    const Icon = config.icon;

    useEffect(() => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
            setProgress(remaining);

            if (remaining <= 0) {
                clearInterval(interval);
                handleClose();
            }
        }, 50);

        return () => clearInterval(interval);
    }, [duration]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => {
            onClose(id);
        }, 300);
    };

    return (
        <div
            className={`
                relative overflow-hidden
                w-80 max-w-sm
                ${config.bgColor} ${config.textColor}
                border-l-4 ${config.borderColor}
                rounded-lg shadow-lg
                transform transition-all duration-300 ease-in-out
                ${
                    isExiting
                        ? "opacity-0 translate-x-full"
                        : "opacity-100 translate-x-0"
                }
            `}>
            <div className='p-4'>
                <div className='flex items-start gap-3'>
                    <Icon
                        className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`}
                    />
                    <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium break-words'>
                            {message}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className={`flex-shrink-0 ${config.iconColor} hover:opacity-70 transition-opacity`}>
                        <X className='w-4 h-4' />
                    </button>
                </div>
            </div>

            {/* Прогресс-бар */}
            <div className='absolute bottom-0 left-0 right-0 h-1 bg-gray-200'>
                <div
                    className={`h-full ${config.progressColor} transition-all duration-50 ease-linear`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

// Контейнер для всех уведомлений
function ToastContainer({ toasts, removeToast }) {
    return (
        <div className='fixed top-4 right-4 z-50 flex flex-col gap-3'>
            {toasts.map((toast) => (
                <ToastItem
                    key={toast.id}
                    id={toast.id}
                    type={toast.type}
                    message={toast.message}
                    duration={toast.duration}
                    onClose={removeToast}
                />
            ))}
        </div>
    );
}

// Провайдер контекста
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((type, message, duration = 5000) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, type, message, duration }]);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const toast = {
        success: (message, duration) => addToast("success", message, duration),
        error: (message, duration) => addToast("error", message, duration),
        warning: (message, duration) => addToast("warning", message, duration),
        info: (message, duration) => addToast("info", message, duration),
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
}

// Хук для использования уведомлений
export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

export default ToastProvider;
