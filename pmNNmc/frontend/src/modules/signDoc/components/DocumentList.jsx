import React, { useState, useEffect, useRef } from "react";
import {
    getMyDocuments,
    getActionablePendingDocuments,
    cancelDocument,
    getDepartments,
    getDocumentTypes,
    getSubdivisions,
    getUser as getCurrentUser,
} from "../api/signdocClient";
import {
    FileText,
    Clock,
    CheckCircle,
    XCircle,
    Eye,
    Download,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Calendar,
    X,
    Filter,
    Shield,
    CheckSquare,
    Square,
    AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "./Toast";
import ConfirmModal from "./ConfirmModal";

const ITEMS_PER_PAGE = 10;

export default function DocumentList({ type = "my" }) {
    const [documents, setDocuments] = useState([]);
    const [filteredDocuments, setFilteredDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [showFilters, setShowFilters] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [signerQuery, setSignerQuery] = useState("");
    const [documentTypes, setDocumentTypes] = useState([]);
    const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
    const [titleQuery, setTitleQuery] = useState("");
    const [subdivisions, setSubdivisions] = useState([]);
    const [subdivisionFilter, setSubdivisionFilter] = useState("all");
    const [subdivisionSearch, setSubdivisionSearch] = useState("");
    const [subdivisionDropdownOpen, setSubdivisionDropdownOpen] = useState(false);
    const subdivisionDropdownRef = useRef(null);
    const [goToPageInput, setGoToPageInput] = useState("");

    // Модальное окно
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [documentToCancel, setDocumentToCancel] = useState(null);
    const [isCancelling, setIsCancelling] = useState(false);

    // Массовое подписание
    const [selectedDocs, setSelectedDocs] = useState([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const user = getCurrentUser();
    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => {
        loadDocuments();
    }, [type]);

    useEffect(() => {
        applyFilters();
    }, [
        documents,
        filter,
        dateFrom,
        dateTo,
        departmentFilter,
        signerQuery,
        documentTypeFilter,
        titleQuery,
        subdivisionFilter,
    ]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filter, dateFrom, dateTo, departmentFilter, signerQuery, documentTypeFilter, titleQuery, subdivisionFilter]);

    // Сброс выбора при смене типа
    useEffect(() => {
        setSelectedDocs([]);
        setIsSelectionMode(false);
    }, [type]);

    useEffect(() => {
        loadDepartments();
        loadDocumentTypes();
    }, [type]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (subdivisionDropdownRef.current && !subdivisionDropdownRef.current.contains(e.target)) {
                setSubdivisionDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        setSubdivisionFilter("all");
        setSubdivisionSearch("");
        if (departmentFilter === "all") {
            setSubdivisions([]);
            return;
        }
        getSubdivisions(departmentFilter).then((data) => {
            const normalized = data.map((s) => ({
                id: s.id || s.documentId,
                name: s.name,
            }));
            normalized.sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", "ru")
            );
            setSubdivisions(normalized);
        }).catch(() => setSubdivisions([]));
    }, [departmentFilter]);

    const loadDocuments = async () => {
        setLoading(true);
        try {
            let docs;
            if (type === "pending") {
                docs = await getActionablePendingDocuments();
            } else {
                docs = await getMyDocuments();
            }

            docs.sort((a, b) => {
                const dateA = new Date(a.createdAt);
                const dateB = new Date(b.createdAt);
                return dateB - dateA;
            });

            setDocuments(docs);
        } catch (error) {
            console.error("Ошибка загрузки документов:", error);
            toast.error("Ошибка загрузки документов");
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const data = await getDepartments();
            const normalized = data.map((dept) => {
                if (dept?.attributes) {
                    return {
                        id: dept.id || dept.attributes.documentId,
                        name: dept.attributes.name,
                    };
                }
                return {
                    id: dept.id || dept.documentId,
                    name: dept.name,
                };
            });
            const sorted = normalized.sort((a, b) => {
                const nameA = (a.name || "").toLowerCase();
                const nameB = (b.name || "").toLowerCase();
                return nameA.localeCompare(nameB, "ru");
            });
            setDepartments(sorted);
        } catch (error) {
            console.error("Ошибка загрузки отделов:", error);
            toast.error("Ошибка загрузки отделов");
        }
    };

    const loadDocumentTypes = async () => {
        try {
            const data = await getDocumentTypes();
            const normalized = data.map((type) => {
                if (type?.attributes) {
                    return {
                        id: type.id || type.attributes.documentId,
                        name: type.attributes.name,
                    };
                }
                return {
                    id: type.id || type.documentId,
                    name: type.name,
                };
            });
            const sorted = normalized.sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", "ru")
            );
            setDocumentTypes(sorted);
        } catch (error) {
            console.error("Ошибка загрузки видов документов:", error);
            toast.error("Ошибка загрузки видов документов");
        }
    };

    const applyFilters = () => {
        let result = [...documents];

        if (filter !== "all") {
            result = result.filter((doc) => doc.status === filter);
        }

        const titleQ = titleQuery.trim().toLowerCase();
        if (titleQ) {
            result = result.filter((doc) =>
                (doc.title || "").toLowerCase().includes(titleQ)
            );
        }

        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            result = result.filter((doc) => {
                const docDate = new Date(doc.createdAt);
                return docDate >= fromDate;
            });
        }

        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            result = result.filter((doc) => {
                const docDate = new Date(doc.createdAt);
                return docDate <= toDate;
            });
        }

        if (departmentFilter !== "all") {
            result = result.filter((doc) => {
                const dept = doc.creator?.department;
                const deptData = dept?.data ? dept.data : dept;
                const deptId =
                    deptData?.id ||
                    deptData?.documentId ||
                    deptData?.attributes?.documentId;
                return String(deptId) === String(departmentFilter);
            });
        }

        if (documentTypeFilter !== "all") {
            result = result.filter((doc) => {
                const docType = doc.documentType;
                const docTypeData = docType?.data ? docType.data : docType;
                const docTypeId =
                    docTypeData?.id ||
                    docTypeData?.documentId ||
                    docTypeData?.attributes?.documentId;
                return (
                    String(docTypeId) === String(documentTypeFilter)
                );
            });
        }

        if (subdivisionFilter !== "all") {
            result = result.filter((doc) => {
                const sub = doc.subdivision;
                const subData = sub?.data ? sub.data : sub;
                const subId = subData?.id || subData?.documentId;
                return String(subId) === String(subdivisionFilter);
            });
        }

        const query = signerQuery.trim().toLowerCase();
        if (query) {
            result = result.filter((doc) => {
                const history = doc.signatureHistory || [];
                const signers = doc.signers || [];
                const hasInHistory = history.some((sig) =>
                    (sig.userName || "").toLowerCase().includes(query)
                );
                const hasInSigners = signers.some((sig) =>
                    (sig.userName || "").toLowerCase().includes(query)
                );
                return hasInHistory || hasInSigners;
            });
        }

        setFilteredDocuments(result);
    };

    const clearFilters = () => {
        setFilter("all");
        setDateFrom("");
        setDateTo("");
        setDepartmentFilter("all");
        setSignerQuery("");
        setDocumentTypeFilter("all");
        setTitleQuery("");
        setSubdivisionFilter("all");
        setSubdivisionSearch("");
        setSubdivisions([]);
    };

    const handleCancelClick = (doc) => {
        setDocumentToCancel(doc);
        setShowCancelModal(true);
    };

    const handleConfirmCancel = async () => {
        if (!documentToCancel) return;

        setIsCancelling(true);
        try {
            await cancelDocument(documentToCancel.documentId);
            toast.success("Документ успешно отозван");
            loadDocuments();
        } catch (error) {
            toast.error("Ошибка отзыва документа");
        } finally {
            setIsCancelling(false);
            setShowCancelModal(false);
            setDocumentToCancel(null);
        }
    };

    // Получить документы доступные для подписания (только ЭЦП)
    const getSignableDocuments = () => {
        return filteredDocuments.filter((doc) => {
            const signers = doc.signers || [];
            const mySigner = signers.find((s) => s.userId === user.id);

            if (!mySigner || mySigner.status !== "pending") return false;

            // Проверка последовательности
            if (doc.signatureSequential) {
                const myIndex = signers.findIndex((s) => s.userId === user.id);
                const allPreviousSigned = signers
                    .slice(0, myIndex)
                    .every((s) => s.status === "signed");
                if (!allPreviousSigned) return false;
            }

            // Только ЭЦП документы для массового подписания
            return doc.signatureType === "eds";
        });
    };

    // Выбор документа
    const handleSelectDoc = (docId) => {
        if (selectedDocs.includes(docId)) {
            setSelectedDocs(selectedDocs.filter((id) => id !== docId));
        } else {
            setSelectedDocs([...selectedDocs, docId]);
        }
    };

    // Выбрать все
    const handleSelectAll = () => {
        const signableDocs = getSignableDocuments();
        if (selectedDocs.length === signableDocs.length) {
            setSelectedDocs([]);
        } else {
            setSelectedDocs(signableDocs.map((doc) => doc.id));
        }
    };

    // Массовое подписание
    const handleBatchSign = () => {
        if (selectedDocs.length === 0) {
            toast.warning("Выберите документы для подписания");
            return;
        }

        // Передаём выбранные документы в страницу подписания
        navigate("/app/signdoc/documents/batch-sign", {
            state: {
                documentIds: selectedDocs,
            },
        });
    };

    // Проверка можно ли подписать документ
    const canSignDocument = (doc) => {
        const signers = doc.signers || [];
        const mySigner = signers.find((s) => s.userId === user.id);

        if (!mySigner || mySigner.status !== "pending") return false;

        if (doc.signatureSequential) {
            const myIndex = signers.findIndex((s) => s.userId === user.id);
            const allPreviousSigned = signers
                .slice(0, myIndex)
                .every((s) => s.status === "signed");
            return allPreviousSigned;
        }

        return true;
    };

    // Пагинация
    const totalPages = Math.ceil(filteredDocuments.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentDocuments = filteredDocuments.slice(startIndex, endIndex);

    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const getPageNumbers = () => {
        const pages = [];
        const maxVisiblePages = 5;

        if (totalPages <= maxVisiblePages) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 3) {
                for (let i = 1; i <= 4; i++) pages.push(i);
                pages.push("...");
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 2) {
                pages.push(1);
                pages.push("...");
                for (let i = totalPages - 3; i <= totalPages; i++)
                    pages.push(i);
            } else {
                pages.push(1);
                pages.push("...");
                for (let i = currentPage - 1; i <= currentPage + 1; i++)
                    pages.push(i);
                pages.push("...");
                pages.push(totalPages);
            }
        }

        return pages;
    };

    const handleGoToPage = (e) => {
        e.preventDefault();
        const page = parseInt(goToPageInput, 10);
        if (page >= 1 && page <= totalPages) {
            goToPage(page);
            setGoToPageInput("");
        }
    };

    const renderPagination = (position) => {
        if (totalPages <= 1) return null;
        const borderClass =
            position === "top"
                ? "mb-4 pb-4 border-b border-gray-200"
                : "mt-6 pt-6 border-t border-gray-200";

        return (
            <div className={`flex items-center justify-between ${borderClass} flex-wrap gap-3`}>
                <div className='text-sm text-gray-600'>
                    Показано {startIndex + 1}-
                    {Math.min(endIndex, filteredDocuments.length)} из{" "}
                    {filteredDocuments.length}
                </div>

                <div className='flex items-center gap-1'>
                    <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={`p-2 rounded-lg transition-colors ${
                            currentPage === 1
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-600 hover:bg-gray-100"
                        }`}>
                        <ChevronLeft className='w-5 h-5' />
                    </button>

                    {getPageNumbers().map((page, idx) => (
                        <button
                            key={idx}
                            onClick={() =>
                                typeof page === "number" && goToPage(page)
                            }
                            disabled={page === "..."}
                            className={`min-w-[40px] h-10 rounded-lg text-sm font-medium transition-colors ${
                                page === currentPage
                                    ? "bg-indigo-600 text-white"
                                    : page === "..."
                                    ? "text-gray-400 cursor-default"
                                    : "text-gray-600 hover:bg-gray-100"
                            }`}>
                            {page}
                        </button>
                    ))}

                    <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className={`p-2 rounded-lg transition-colors ${
                            currentPage === totalPages
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-600 hover:bg-gray-100"
                        }`}>
                        <ChevronRight className='w-5 h-5' />
                    </button>
                </div>

                <div className='flex items-center gap-2'>
                    <span className='text-sm text-gray-600'>
                        Стр. {currentPage} из {totalPages}
                    </span>
                    <form
                        onSubmit={handleGoToPage}
                        className='flex items-center gap-1'>
                        <input
                            type='number'
                            min={1}
                            max={totalPages}
                            value={goToPageInput}
                            onChange={(e) => setGoToPageInput(e.target.value)}
                            placeholder='№'
                            className='w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                        />
                        <button
                            type='submit'
                            className='px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors'>
                            Перейти
                        </button>
                    </form>
                </div>
            </div>
        );
    };

    const getStatusBadge = (status) => {
        const badges = {
            draft: {
                text: "Черновик",
                color: "bg-gray-100 text-gray-800",
                icon: Clock,
            },
            pending: {
                text: "Ожидает",
                color: "bg-yellow-100 text-yellow-800",
                icon: Clock,
            },
            in_progress: {
                text: "В процессе",
                color: "bg-blue-100 text-blue-800",
                icon: Clock,
            },
            completed: {
                text: "Завершён",
                color: "bg-green-100 text-green-800",
                icon: CheckCircle,
            },
            cancelled: {
                text: "Отменён",
                color: "bg-red-100 text-red-800",
                icon: XCircle,
            },
            revision: {
                text: "На корректировке",
                color: "bg-amber-100 text-amber-800",
                icon: AlertTriangle,
            },
        };

        const badge = badges[status] || badges.draft;
        const Icon = badge.icon;

        return (
            <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                <Icon className='w-3 h-3' />
                {badge.text}
            </span>
        );
    };

    const getSignerInfo = (signers) => {
        if (!signers || signers.length === 0) return "Нет подписантов";

        const signed = signers.filter((s) => s.status === "signed").length;
        const total = signers.length;

        return `${signed}/${total} подписей`;
    };

    const hasActiveFilters =
        filter !== "all" ||
        dateFrom ||
        dateTo ||
        departmentFilter !== "all" ||
        signerQuery.trim().length > 0 ||
        documentTypeFilter !== "all" ||
        titleQuery.trim().length > 0 ||
        subdivisionFilter !== "all";
    const signableDocsCount = getSignableDocuments().length;

    return (
        <div className='max-w-7xl mx-auto p-4 md:p-8'>
            <div className='bg-white rounded-2xl shadow-xl p-6'>
                <div className='flex items-center justify-between mb-6 flex-wrap gap-4'>
                    <h2 className='text-2xl font-bold text-gray-800'>
                        {type === "pending"
                            ? "Документы на подпись"
                            : "Мои документы"}
                    </h2>

                    <div className='flex items-center gap-2'>
                        {/* Кнопка массового подписания (только для pending) */}
                        {type === "pending" && signableDocsCount > 0 && (
                            <>
                                {isSelectionMode ? (
                                    <div className='flex items-center gap-2'>
                                        <button
                                            onClick={handleSelectAll}
                                            className='flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors'>
                                            {selectedDocs.length ===
                                            signableDocsCount ? (
                                                <CheckSquare className='w-4 h-4' />
                                            ) : (
                                                <Square className='w-4 h-4' />
                                            )}
                                            Выбрать все ({signableDocsCount})
                                        </button>
                                        <button
                                            onClick={handleBatchSign}
                                            disabled={selectedDocs.length === 0}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                selectedDocs.length === 0
                                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                            }`}>
                                            <Shield className='w-4 h-4' />
                                            Подписать ({selectedDocs.length})
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsSelectionMode(false);
                                                setSelectedDocs([]);
                                            }}
                                            className='flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors'>
                                            <X className='w-4 h-4' />
                                            Отмена
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setIsSelectionMode(true)}
                                        className='flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors'>
                                        <Shield className='w-4 h-4' />
                                        Массовое подписание
                                    </button>
                                )}
                            </>
                        )}

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                showFilters || hasActiveFilters
                                    ? "bg-indigo-600 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}>
                            <Filter className='w-4 h-4' />
                            Фильтры
                            {hasActiveFilters && (
                                <span className='bg-white text-indigo-600 text-xs rounded-full w-5 h-5 flex items-center justify-center'>
                                    !
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Инфо о режиме выбора */}
                {isSelectionMode && (
                    <div className='mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg'>
                        <div className='flex items-center gap-2 text-indigo-800'>
                            <Shield className='w-5 h-5' />
                            <span className='font-medium'>
                                Режим массового подписания
                            </span>
                            <span className='text-sm'>
                                — выберите документы для подписания через ЭЦП
                            </span>
                        </div>
                        <p className='text-xs text-indigo-600 mt-1'>
                            Доступно для выбора: {signableDocsCount} документов
                            (только ЭЦП)
                        </p>
                    </div>
                )}

                {showFilters && (
                    <div className='mb-6 p-4 bg-gray-50 rounded-xl'>
                        <div className='flex flex-wrap items-end gap-4'>
                            <div className='min-w-[240px]'>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Название документа
                                </label>
                                <input
                                    type='text'
                                    value={titleQuery}
                                    onChange={(e) =>
                                        setTitleQuery(e.target.value)
                                    }
                                    placeholder='Поиск по названию...'
                                    className='px-3 py-2 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                />
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Статус
                                </label>
                                <select
                                    value={filter}
                                    onChange={(e) =>
                                        setFilter(e.target.value)
                                    }
                                    className='px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                                    <option value='all'>Все</option>
                                    <option value='in_progress'>
                                        В процессе
                                    </option>
                                    <option value='completed'>
                                        Завершённые
                                    </option>
                                    <option value='cancelled'>
                                        Отменённые
                                    </option>
                                    <option value='revision'>
                                        На корректировке
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Отдел
                                </label>
                                <select
                                    value={departmentFilter}
                                    onChange={(e) =>
                                        setDepartmentFilter(e.target.value)
                                    }
                                    className='px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                                    <option value='all'>Все</option>
                                    {departments.map((dept) => (
                                        <option key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {subdivisions.length > 0 && (
                                <div ref={subdivisionDropdownRef} className='relative min-w-[320px]'>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Подразделение
                                    </label>
                                    <input
                                        type='text'
                                        placeholder={
                                            subdivisionFilter !== "all"
                                                ? subdivisions.find((s) => String(s.id) === String(subdivisionFilter))?.name || "Поиск..."
                                                : "Все"
                                        }
                                        value={subdivisionSearch}
                                        onChange={(e) => {
                                            setSubdivisionSearch(e.target.value);
                                            setSubdivisionDropdownOpen(true);
                                        }}
                                        onFocus={() => setSubdivisionDropdownOpen(true)}
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    />
                                    {subdivisionDropdownOpen && (
                                        <div className='absolute z-50 mt-1 min-w-full w-max max-w-lg bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto'>
                                            <div
                                                className='px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 text-gray-500'
                                                onMouseDown={() => {
                                                    setSubdivisionFilter("all");
                                                    setSubdivisionSearch("");
                                                    setSubdivisionDropdownOpen(false);
                                                }}>
                                                Все
                                            </div>
                                            {subdivisions
                                                .filter((s) =>
                                                    s.name.toLowerCase().includes(subdivisionSearch.toLowerCase())
                                                )
                                                .map((s) => (
                                                    <div
                                                        key={s.id}
                                                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${String(subdivisionFilter) === String(s.id) ? "bg-indigo-100 font-medium" : ""}`}
                                                        onMouseDown={() => {
                                                            setSubdivisionFilter(s.id);
                                                            setSubdivisionSearch("");
                                                            setSubdivisionDropdownOpen(false);
                                                        }}>
                                                        {s.name}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Вид документа
                                </label>
                                <select
                                    value={documentTypeFilter}
                                    onChange={(e) =>
                                        setDocumentTypeFilter(
                                            e.target.value
                                        )
                                    }
                                    className='px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                                    <option value='all'>Все</option>
                                    {documentTypes.map((type) => (
                                        <option key={type.id} value={type.id}>
                                            {type.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className='min-w-[240px]'>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Подписант
                                </label>
                                <input
                                    type='text'
                                    value={signerQuery}
                                    onChange={(e) =>
                                        setSignerQuery(e.target.value)
                                    }
                                    placeholder='ФИО подписанта'
                                    className='px-3 py-2 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                />
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Дата от
                                </label>
                                <div className='relative'>
                                    <Calendar className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' />
                                    <input
                                        type='date'
                                        value={dateFrom}
                                        onChange={(e) =>
                                            setDateFrom(e.target.value)
                                        }
                                        className='pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    />
                                </div>
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Дата до
                                </label>
                                <div className='relative'>
                                    <Calendar className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' />
                                    <input
                                        type='date'
                                        value={dateTo}
                                        onChange={(e) =>
                                            setDateTo(e.target.value)
                                        }
                                        className='pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    />
                                </div>
                            </div>

                            <div className='flex gap-2'>
                                <button
                                    onClick={() => {
                                        const today = new Date()
                                            .toISOString()
                                            .split("T")[0];
                                        setDateFrom(today);
                                        setDateTo(today);
                                    }}
                                    className='px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50'>
                                    Сегодня
                                </button>
                                <button
                                    onClick={() => {
                                        const today = new Date();
                                        const weekAgo = new Date(today);
                                        weekAgo.setDate(weekAgo.getDate() - 7);
                                        setDateFrom(
                                            weekAgo.toISOString().split("T")[0]
                                        );
                                        setDateTo(
                                            today.toISOString().split("T")[0]
                                        );
                                    }}
                                    className='px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50'>
                                    Неделя
                                </button>
                                <button
                                    onClick={() => {
                                        const today = new Date();
                                        const monthAgo = new Date(today);
                                        monthAgo.setMonth(
                                            monthAgo.getMonth() - 1
                                        );
                                        setDateFrom(
                                            monthAgo.toISOString().split("T")[0]
                                        );
                                        setDateTo(
                                            today.toISOString().split("T")[0]
                                        );
                                    }}
                                    className='px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50'>
                                    Месяц
                                </button>
                            </div>

                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className='flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200'>
                                    <X className='w-4 h-4' />
                                    Сбросить
                                </button>
                            )}
                        </div>

                        <div className='mt-3 text-sm text-gray-600'>
                            Найдено документов:{" "}
                            <strong>{filteredDocuments.length}</strong>
                            {hasActiveFilters && ` из ${documents.length}`}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className='text-center py-12'>
                        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto'></div>
                        <p className='mt-4 text-gray-600'>Загрузка...</p>
                    </div>
                ) : filteredDocuments.length === 0 ? (
                    <div className='text-center py-12'>
                        <FileText className='w-16 h-16 text-gray-400 mx-auto mb-4' />
                        <p className='text-gray-600'>
                            {hasActiveFilters
                                ? "Документы не найдены по выбранным фильтрам"
                                : "Документы не найдены"}
                        </p>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className='mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700'>
                                Сбросить фильтры
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {renderPagination("top")}
                        <div className='space-y-4'>
                            {currentDocuments.map((doc) => {
                                const isSignable =
                                    canSignDocument(doc) &&
                                    doc.signatureType === "eds";
                                const isSelected = selectedDocs.includes(
                                    doc.id
                                );

                                return (
                                    <div
                                        key={doc.id}
                                        className={`border rounded-xl p-4 transition-all ${
                                            isSelectionMode && isSignable
                                                ? isSelected
                                                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500"
                                                    : "border-gray-200 hover:border-indigo-300 cursor-pointer"
                                                : "border-gray-200 hover:shadow-md"
                                        }`}
                                        onClick={() => {
                                            if (isSelectionMode && isSignable) {
                                                handleSelectDoc(doc.id);
                                            }
                                        }}>
                                        <div className='flex items-start justify-between'>
                                            <div className='flex items-start gap-4 flex-1'>
                                                {/* Чекбокс в режиме выбора */}
                                                {isSelectionMode && (
                                                    <div className='flex-shrink-0 pt-1'>
                                                        {isSignable ? (
                                                            <div
                                                                className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                                                                    isSelected
                                                                        ? "bg-indigo-600 border-indigo-600"
                                                                        : "border-gray-300 hover:border-indigo-400"
                                                                }`}>
                                                                {isSelected && (
                                                                    <CheckCircle className='w-4 h-4 text-white' />
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className='w-6 h-6 rounded border-2 border-gray-200 bg-gray-100 flex items-center justify-center'>
                                                                <X className='w-3 h-3 text-gray-400' />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <FileText className='w-10 h-10 text-indigo-600 flex-shrink-0' />

                                                <div className='flex-1'>
                                                    <h3 className='text-lg font-semibold text-gray-800 mb-1'>
                                                        {doc.title}
                                                    </h3>

                                                    <div className='flex items-center gap-4 text-sm text-gray-600 mb-2'>
                                                        <span>
                                                            Создан:{" "}
                                                            {new Date(
                                                                doc.createdAt
                                                            ).toLocaleDateString(
                                                                "ru-RU",
                                                                {
                                                                    day: "2-digit",
                                                                    month: "2-digit",
                                                                    year: "numeric",
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                }
                                                            )}
                                                        </span>
                                                        <span>•</span>
                                                        <span>
                                                            {getSignerInfo(
                                                                doc.signers
                                                            )}
                                                        </span>
                                                        {doc.signatureType ===
                                                            "eds" && (
                                                            <>
                                                                <span>•</span>
                                                                <span className='flex items-center gap-1 text-indigo-600'>
                                                                    <Shield className='w-3 h-3' />
                                                                    ЭЦП
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>

                                                    {getStatusBadge(
                                                        doc.status
                                                    )}

                                                    {/* Показываем почему нельзя выбрать */}
                                                    {isSelectionMode &&
                                                        !isSignable &&
                                                        type === "pending" && (
                                                            <p className='text-xs text-gray-500 mt-2'>
                                                                {doc.signatureType !==
                                                                "eds"
                                                                    ? "Только простая подпись"
                                                                    : "Ожидание предыдущих подписей"}
                                                            </p>
                                                        )}

                                                    {doc.signatureHistory &&
                                                        doc.signatureHistory
                                                            .length > 0 && (
                                                            <div className='mt-3 space-y-1'>
                                                                <p className='text-xs font-medium text-gray-700'>
                                                                    История
                                                                    подписей:
                                                                </p>
                                                                {doc.signatureHistory.map(
                                                                    (
                                                                        sig,
                                                                        idx
                                                                    ) => {
                                                                        if (sig.type === "rejection" || sig.type === "recall" || sig.type === "resend") {
                                                                            const symbol = sig.type === "resend" ? "↻" : "✗";
                                                                            const label = sig.type === "rejection" ? "отклонил" : sig.type === "recall" ? "отозвал" : "отправил заново";
                                                                            return (
                                                                                <p key={idx} className={`text-xs ${sig.type === "resend" ? "text-blue-600" : "text-red-600"}`}>
                                                                                    {symbol} {sig.userName} — {label} — {new Date(sig.date).toLocaleString("ru-RU")}
                                                                                </p>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <p key={idx} className='text-xs text-gray-600'>
                                                                                ✓ {sig.userName} ({sig.role}) - {new Date(sig.signedAt).toLocaleString("ru-RU")}
                                                                            </p>
                                                                        );
                                                                    }
                                                                )}
                                                            </div>
                                                        )}
                                                </div>
                                            </div>

                                            {/* Кнопки действий (скрываем в режиме выбора) */}
                                            {!isSelectionMode && (
                                                <div className='flex items-center gap-2 ml-4'>
                                                    <button
                                                        onClick={() =>
                                                            navigate(
                                                                `/app/signdoc/documents/${doc.id}`
                                                            )
                                                        }
                                                        className='p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors'
                                                        title='Просмотр'>
                                                        <Eye className='w-5 h-5' />
                                                    </button>

                                                    {type === "my" &&
                                                        doc.creator?.id ===
                                                            user.id &&
                                                        doc.status !==
                                                            "completed" &&
                                                        doc.status !==
                                                            "cancelled" && (
                                                            <button
                                                                onClick={() =>
                                                                    handleCancelClick(
                                                                        doc
                                                                    )
                                                                }
                                                                className='p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors'
                                                                title='Отозвать'>
                                                                <Trash2 className='w-5 h-5' />
                                                            </button>
                                                        )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {renderPagination("bottom")}
                    </>
                )}
            </div>

            <ConfirmModal
                isOpen={showCancelModal}
                onClose={() => {
                    setShowCancelModal(false);
                    setDocumentToCancel(null);
                }}
                onConfirm={handleConfirmCancel}
                title='Отзыв документа'
                message={`Вы уверены, что хотите отозвать документ "${documentToCancel?.title}"? Это действие нельзя отменить.`}
                confirmText='Отозвать'
                cancelText='Отмена'
                type='danger'
                isLoading={isCancelling}
            />
        </div>
    );
}
