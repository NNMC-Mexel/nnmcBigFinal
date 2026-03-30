import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    getMyDocuments,
    getPendingDocuments,
    updateDocument,
    uploadFile,
    getDocumentFileUrl,
    presignDocumentFile,
    getUser as getCurrentUser,
} from "../api/signdocClient";
import {
    FileText,
    Clock,
    CheckCircle,
    Download,
    ArrowLeft,
    AlertCircle,
    Shield,
    Pen,
    FileKey,
    Eye,
    XCircle,
    RotateCcw,
    Upload,
    AlertTriangle,
} from "lucide-react";
import DocumentSignatureApp from "./DocumentSignatureApp";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

const VITE_SIGNDOC_API_BASE =
    typeof import.meta !== "undefined" && import.meta.env
        ? import.meta.env.VITE_SIGNDOC_API_BASE
        : "";
const API_BASE = VITE_SIGNDOC_API_BASE
    ? VITE_SIGNDOC_API_BASE.replace(/\/api$/, "")
    : `${window.location.protocol}//${window.location.hostname}:12015`;

export default function DocumentView() {
    const toast = useToast();
    const { id } = useParams();
    const navigate = useNavigate();
    const [documentData, setDocumentData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [canSign, setCanSign] = useState(false);
    const [mySignerInfo, setMySignerInfo] = useState(null);
    const [showSignature, setShowSignature] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showRecallModal, setShowRecallModal] = useState(false);
    const [rejectComment, setRejectComment] = useState("");
    const [recallComment, setRecallComment] = useState("");
    const [resendFile, setResendFile] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [signFileUrl, setSignFileUrl] = useState(null);

    const currentUser = getCurrentUser();

    // Extracts the MinIO object key from a full MinIO URL (removes endpoint+bucket prefix)
    const extractMinioKey = (url) => {
        try {
            const parsed = new URL(url);
            const parts = parsed.pathname.split("/").filter(Boolean);
            return parts.slice(1).join("/"); // skip bucket segment
        } catch {
            return null;
        }
    };

    // Used for legacy relative /uploads/... CMS file paths
    const buildFileUrl = (fileUrl) => {
        if (!fileUrl) return null;
        if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
            return fileUrl;
        }
        return `${API_BASE}${fileUrl}`;
    };

    useEffect(() => {
        loadDocument();
    }, [id]);

    useEffect(() => {
        if (!documentData) return;
        let cancelled = false;

        getDocumentFileUrl(documentData.documentId)
            .then((url) => {
                if (!cancelled) setPdfPreviewUrl(url);
            })
            .catch((err) => console.error("PDF preview load error:", err));

        return () => {
            cancelled = true;
        };
    }, [documentData]);

    const loadDocument = async () => {
        setLoading(true);
        try {
            // Ищем документ и в своих, и в назначенных на подпись
            const [myDocs, pendingDocs] = await Promise.all([
                getMyDocuments(),
                getPendingDocuments(),
            ]);

            // Объединяем и убираем дубликаты
            const allDocs = [...myDocs];
            pendingDocs.forEach((pd) => {
                if (!allDocs.find((d) => d.id === pd.id)) {
                    allDocs.push(pd);
                }
            });

            const doc = allDocs.find((d) => d.id === parseInt(id));

            if (!doc) {
                toast.error("Документ не найден");
                navigate("/documents");
                return;
            }

            setDocumentData(doc);

            const signers = doc.signers || [];
            const mySigner = signers.find((s) => s.userId === currentUser.id);

            if (mySigner) {
                setMySignerInfo(mySigner);

                if (mySigner.status === "pending") {
                    if (doc.signatureSequential) {
                        const myIndex = signers.findIndex(
                            (s) => s.userId === currentUser.id,
                        );
                        const allPreviousSigned = signers
                            .slice(0, myIndex)
                            .every((s) => s.status === "signed");

                        setCanSign(allPreviousSigned);
                    } else {
                        setCanSign(true);
                    }
                }
            }
        } catch (error) {
            console.error("Ошибка загрузки документа:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSignatureComplete = async (
        signedPdfBlob,
        cmsBlob,
        signatureData,
    ) => {
        try {
            const uploadedFile = await uploadFile(signedPdfBlob);

            let cmsFileUrl = null;
            let cmsFileName = null;

            if (cmsBlob) {
                const cmsFileNameGenerated = `${
                    documentData.title
                }_${currentUser.username}_${Date.now()}.cms`;
                const cmsFileObj = new File([cmsBlob], cmsFileNameGenerated, {
                    type: "application/pkcs7-signature",
                });
                const uploadedCmsFile = await uploadFile(cmsFileObj);
                cmsFileUrl = uploadedCmsFile?.url || null;
                cmsFileName = uploadedCmsFile?.name || cmsFileNameGenerated;
            }

            const updatedSigners = documentData.signers.map((s) => {
                if (s.userId === currentUser.id) {
                    return {
                        ...s,
                        status: "signed",
                        role:
                            signatureData.position ||
                            signatureData.name ||
                            "Подписант",
                        signedAt: new Date().toISOString(),
                    };
                }
                return s;
            });

            const updatedHistory = [
                ...(documentData.signatureHistory || []),
                {
                    userId: currentUser.id,
                    userName: currentUser.fullName || currentUser.username,
                    role:
                        signatureData.position ||
                        signatureData.name ||
                        "Подписант",
                    signedAt: new Date().toISOString(),
                    signatureType: signatureData.type,
                    cmsFileUrl: cmsFileUrl,
                    cmsFileName: cmsFileName,
                    iin: signatureData.iin || null,
                },
            ];

            const allSigned = updatedSigners.every(
                (s) => s.status === "signed",
            );
            const newStatus = allSigned ? "completed" : "in_progress";

            await updateDocument(documentData.documentId, {
                currentFile: uploadedFile.id,
                signers: updatedSigners,
                signatureHistory: updatedHistory,
                status: newStatus,
            });

            toast.success("Документ успешно подписан!");
            navigate("/documents/pending");
        } catch (error) {
            console.error("Ошибка подписания:", error);
            toast.error("Ошибка при подписании документа");
        }
    };

    const handleDownload = async () => {
        try {
            const presignedUrl = await getDocumentFileUrl(documentData.documentId);
            const response = await fetch(presignedUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = window.document.createElement("a");
            link.href = url;
            link.download = documentData.title + ".pdf";
            window.document.body.appendChild(link);
            link.click();
            window.document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Ошибка скачивания:", error);
            toast.error("Ошибка при скачивании файла");
        }
    };

    const handleStartSigning = async () => {
        try {
            const url = await getDocumentFileUrl(documentData.documentId);
            setSignFileUrl(url);
            setShowSignature(true);
        } catch (err) {
            console.error("Ошибка получения файла:", err);
            toast.error("Ошибка: не удалось получить файл документа");
        }
    };

    // Скачивание CMS файла по URL
    const handleDownloadCms = async (cmsFileUrl, cmsFileName, userName) => {
        try {
            if (!cmsFileUrl) {
                toast.warning("CMS файл не найден");
                return;
            }

            let fetchUrl;
            if (
                cmsFileUrl.startsWith("http://") ||
                cmsFileUrl.startsWith("https://")
            ) {
                // MinIO absolute URL — extract key and presign
                const key = extractMinioKey(cmsFileUrl);
                fetchUrl = await presignDocumentFile(
                    documentData.documentId,
                    key
                );
            } else if (cmsFileUrl.startsWith("/uploads/")) {
                // Legacy /uploads/hash.ext path — file was migrated to MinIO
                // The MinIO key is the same as the filename (Strapi stores as {hash}{ext})
                const key = cmsFileUrl.replace(/^\/uploads\//, "");
                fetchUrl = await presignDocumentFile(
                    documentData.documentId,
                    key
                );
            } else {
                fetchUrl = buildFileUrl(cmsFileUrl);
            }

            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error("Ошибка загрузки файла");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = window.document.createElement("a");
            link.href = url;
            link.download = cmsFileName || `signature_${userName}.cms`;
            window.document.body.appendChild(link);
            link.click();
            window.document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Ошибка скачивания CMS:", error);
            toast.warning("CMS файл не найден");
        }
    };

    // Скачать все CMS файлы
    const handleDownloadAllCms = async () => {
        const history = documentData.signatureHistory || [];
        const cmsSignatures = history.filter((sig) => sig.cmsFileUrl);

        if (cmsSignatures.length === 0) {
            toast.info("Нет CMS файлов для скачивания");
            return;
        }

        for (const sig of cmsSignatures) {
            await handleDownloadCms(
                sig.cmsFileUrl,
                sig.cmsFileName,
                sig.userName,
            );
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    };

    const isCreator = documentData?.creator?.id === currentUser.id;

    const getLastRevisionEntry = () => {
        const history = documentData?.signatureHistory || [];
        for (let i = history.length - 1; i >= 0; i--) {
            if (
                history[i].type === "rejection" ||
                history[i].type === "recall"
            ) {
                return history[i];
            }
        }
        return null;
    };

    const handleReject = async () => {
        setActionLoading(true);
        try {
            const updatedSigners = documentData.signers.map((s) => {
                if (s.userId === currentUser.id) {
                    return { ...s, status: "rejected" };
                }
                return s;
            });

            const updatedHistory = [
                ...(documentData.signatureHistory || []),
                {
                    type: "rejection",
                    userId: currentUser.id,
                    userName:
                        currentUser.fullName || currentUser.username,
                    comment: rejectComment || null,
                    date: new Date().toISOString(),
                },
            ];

            await updateDocument(documentData.documentId, {
                status: "revision",
                signers: updatedSigners,
                signatureHistory: updatedHistory,
            });

            toast.success("Документ отклонён");
            setShowRejectModal(false);
            setRejectComment("");
            loadDocument();
        } catch (error) {
            console.error("Ошибка отклонения:", error);
            toast.error("Ошибка при отклонении документа");
        } finally {
            setActionLoading(false);
        }
    };

    const handleRecall = async () => {
        setActionLoading(true);
        try {
            const updatedHistory = [
                ...(documentData.signatureHistory || []),
                {
                    type: "recall",
                    userId: currentUser.id,
                    userName:
                        currentUser.fullName || currentUser.username,
                    comment: recallComment || null,
                    date: new Date().toISOString(),
                },
            ];

            await updateDocument(documentData.documentId, {
                status: "in_progress",
                signatureHistory: updatedHistory,
            });

            toast.success("Документ отозван на корректировку");
            setShowRecallModal(false);
            setRecallComment("");
            loadDocument();
        } catch (error) {
            console.error("Ошибка отзыва:", error);
            toast.error("Ошибка при отзыве документа");
        } finally {
            setActionLoading(false);
        }
    };

    const handleResend = async () => {
        if (!resendFile) {
            toast.warning("Загрузите исправленный файл");
            return;
        }
        setActionLoading(true);
        try {
            const uploadedFile = await uploadFile(resendFile);

            const creatorId =
                documentData?.creator?.id ||
                documentData?.creator ||
                currentUser.id;
            const creatorName =
                documentData?.creator?.fullName ||
                documentData?.creator?.username ||
                currentUser.fullName ||
                currentUser.username;
            const creatorEmail =
                documentData?.creator?.email || currentUser.email;

            const resetSigners = (documentData.signers || []).map((s) => ({
                ...s,
                status: "pending",
                signedAt: null,
                role: null,
            }));

            const hasCreator = resetSigners.some(
                (s) => s.userId === creatorId
            );
            const nextSigners = hasCreator
                ? resetSigners
                : [
                      {
                          userId: creatorId,
                          userName: creatorName,
                          userEmail: creatorEmail,
                          order: 1,
                          role: "Создатель",
                          status: "pending",
                      },
                      ...resetSigners,
                  ];

            nextSigners.forEach((s, i) => {
                s.order = i + 1;
            });

            const updatedHistory = [
                ...(documentData.signatureHistory || []),
                {
                    type: "resend",
                    userId: currentUser.id,
                    userName:
                        currentUser.fullName || currentUser.username,
                    date: new Date().toISOString(),
                },
            ];

            await updateDocument(documentData.documentId, {
                status: "in_progress",
                originalFile: uploadedFile.id,
                currentFile: uploadedFile.id,
                signers: nextSigners,
                signatureHistory: updatedHistory,
            });

            toast.success("Документ отправлен заново");
            setResendFile(null);
            loadDocument();
        } catch (error) {
            console.error("Ошибка отправки:", error);
            toast.error("Ошибка при повторной отправке");
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center'>
                <div className='text-center'>
                    <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto'></div>
                    <p className='mt-4 text-gray-600'>Загрузка документа...</p>
                </div>
            </div>
        );
    }

    if (!documentData) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center'>
                <div className='text-center'>
                    <AlertCircle className='w-16 h-16 text-red-500 mx-auto mb-4' />
                    <p className='text-xl text-gray-800'>Документ не найден</p>
                </div>
            </div>
        );
    }

    if (showSignature && canSign) {
        if (!signFileUrl) return null;

        const signedCount = documentData.signatureHistory?.length || 0;

        return (
            <DocumentSignatureApp
                documentId={documentData.id}
                preloadedFileUrl={signFileUrl}
                onSignatureComplete={handleSignatureComplete}
                isSigningDocument={true}
                signatureType={documentData.signatureType}
                signatureIndex={signedCount}
            />
        );
    }

    const getStatusColor = (status) => {
        const colors = {
            pending: "text-yellow-600 bg-yellow-100",
            signed: "text-green-600 bg-green-100",
            rejected: "text-red-600 bg-red-100",
            skipped: "text-gray-600 bg-gray-100",
        };
        return colors[status] || colors.pending;
    };

    const signatureType = documentData.signatureType;
    const signatureHistory = documentData.signatureHistory || [];
    const hasCmsFiles = signatureHistory.some((sig) => sig.cmsFileUrl);

    return (
        <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
            <div className='max-w-5xl mx-auto'>
                <button
                    onClick={() => navigate(-1)}
                    className='mb-4 flex items-center gap-2 text-indigo-600 hover:text-indigo-700'>
                    <ArrowLeft className='w-5 h-5' />
                    Назад
                </button>

                <div className='bg-white rounded-2xl shadow-xl p-8'>
                    <div className='flex items-start justify-between mb-6 flex-wrap gap-4'>
                        <div>
                            <h1 className='text-3xl font-bold text-gray-800 mb-2'>
                                {documentData.title}
                            </h1>
                            <p className='text-gray-600'>
                                Создан:{" "}
                                {new Date(
                                    documentData.createdAt,
                                ).toLocaleString("ru-RU")}
                            </p>
                        </div>
                        <div className='flex items-center gap-2 flex-wrap'>
                            {documentData.currentFile && (
                                <button
                                    onClick={handleDownload}
                                    className='flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors'>
                                    <Download className='w-5 h-5' />
                                    PDF
                                </button>
                            )}
                            {hasCmsFiles && (
                                <button
                                    onClick={handleDownloadAllCms}
                                    className='flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors'>
                                    <FileKey className='w-5 h-5' />
                                    Все CMS
                                </button>
                            )}
                            {isCreator &&
                                documentData.status !== "completed" &&
                                documentData.status !== "cancelled" &&
                                documentData.status !== "revision" && (
                                    <button
                                        onClick={() =>
                                            setShowRecallModal(true)
                                        }
                                        className='flex items-center gap-2 px-4 py-2 border-2 border-red-500 text-red-600 hover:bg-red-50 rounded-lg transition-colors'>
                                        <RotateCcw className='w-5 h-5' />
                                        Отозвать
                                    </button>
                                )}
                        </div>
                    </div>

                    <div className='mb-6 p-4 bg-gray-50 rounded-lg'>
                        <div className='flex items-center justify-between flex-wrap gap-4'>
                            <div>
                                <p className='text-sm text-gray-600'>
                                    Статус документа
                                </p>
                                <p className='text-lg font-semibold text-gray-800'>
                                    {documentData.status === "pending" &&
                                        "Ожидает подписания"}
                                    {documentData.status === "in_progress" &&
                                        "В процессе подписания"}
                                    {documentData.status === "completed" &&
                                        "Полностью подписан"}
                                    {documentData.status === "cancelled" &&
                                        "Отменён"}
                                    {documentData.status === "revision" &&
                                        "На корректировке"}
                                </p>
                            </div>
                            <div>
                                <p className='text-sm text-gray-600'>
                                    Тип подписания
                                </p>
                                <p className='text-lg font-semibold text-gray-800'>
                                    {documentData.signatureSequential
                                        ? "Последовательно"
                                        : "Параллельно"}
                                </p>
                            </div>
                            <div>
                                <p className='text-sm text-gray-600'>
                                    Способ подписи
                                </p>
                                <div className='flex items-center gap-2 text-lg font-semibold text-gray-800'>
                                    {signatureType === "eds" ? (
                                        <>
                                            <Shield className='w-5 h-5 text-indigo-600' />
                                            ЭЦП
                                        </>
                                    ) : (
                                        <>
                                            <Pen className='w-5 h-5 text-indigo-600' />
                                            Простая
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Блок корректировки */}
                    {documentData.status === "revision" && (
                        <div className='mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg'>
                            <div className='flex items-start gap-3 mb-3'>
                                <AlertTriangle className='w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5' />
                                <div>
                                    <p className='font-semibold text-amber-800'>
                                        Документ на корректировке
                                    </p>
                                    {(() => {
                                        const entry =
                                            getLastRevisionEntry();
                                        if (entry) {
                                            return (
                                                <div className='mt-1'>
                                                    <p className='text-sm text-amber-700'>
                                                        {entry.type ===
                                                        "rejection"
                                                            ? `Отклонён: ${entry.userName}`
                                                            : `Отозван: ${entry.userName}`}
                                                        {" — "}
                                                        {new Date(
                                                            entry.date,
                                                        ).toLocaleString(
                                                            "ru-RU",
                                                        )}
                                                    </p>
                                                    {entry.comment && (
                                                        <p className='text-sm text-amber-800 mt-1 italic'>
                                                            &laquo;
                                                            {entry.comment}
                                                            &raquo;
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            </div>
                            {isCreator && (
                                <div className='mt-4 pt-4 border-t border-amber-200'>
                                    <p className='text-sm font-medium text-gray-700 mb-2'>
                                        Загрузите исправленный файл и
                                        отправьте заново
                                    </p>
                                    <div className='flex items-center gap-3'>
                                        <label className='flex-1 flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-amber-300 rounded-lg cursor-pointer hover:border-amber-400 transition-colors bg-white'>
                                            <Upload className='w-5 h-5 text-amber-600' />
                                            <span className='text-sm text-gray-700'>
                                                {resendFile
                                                    ? resendFile.name
                                                    : "Выберите файл"}
                                            </span>
                                            <input
                                                type='file'
                                                accept='.pdf'
                                                className='hidden'
                                                onChange={(e) =>
                                                    setResendFile(
                                                        e.target
                                                            .files[0] ||
                                                            null,
                                                    )
                                                }
                                            />
                                        </label>
                                        <button
                                            onClick={handleResend}
                                            disabled={
                                                !resendFile ||
                                                actionLoading
                                            }
                                            className='px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2'>
                                            {actionLoading ? (
                                                <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white' />
                                            ) : (
                                                <RotateCcw className='w-4 h-4' />
                                            )}
                                            Отправить заново
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {mySignerInfo && mySignerInfo.status === "pending" && (
                        <div className='mb-6'>
                            {canSign ? (
                                <div className='flex gap-3'>
                                    <button
                                        onClick={handleStartSigning}
                                        className='flex-1 py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors'>
                                        {signatureType === "eds" ? (
                                            <Shield className='w-6 h-6' />
                                        ) : (
                                            <Pen className='w-6 h-6' />
                                        )}
                                        Подписать документ{" "}
                                        {signatureType === "eds"
                                            ? "(ЭЦП)"
                                            : "(Простая подпись)"}
                                    </button>
                                    <button
                                        onClick={() =>
                                            setShowRejectModal(true)
                                        }
                                        className='py-4 px-6 border-2 border-red-500 text-red-600 hover:bg-red-50 font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors'>
                                        <XCircle className='w-6 h-6' />
                                        Отклонить
                                    </button>
                                </div>
                            ) : (
                                <div className='p-4 bg-yellow-50 border border-yellow-200 rounded-lg'>
                                    <div className='flex items-start gap-3'>
                                        <Clock className='w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5' />
                                        <div>
                                            <p className='font-semibold text-yellow-800'>
                                                Ожидание предыдущих подписей
                                            </p>
                                            <p className='text-sm text-yellow-700 mt-1'>
                                                Документ настроен на
                                                последовательное подписание.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <div className='mb-6'>
                        <h2 className='text-xl font-semibold text-gray-800 mb-4'>
                            Подписанты
                        </h2>
                        <div className='space-y-3'>
                            {documentData.signers?.map((signer, index) => (
                                <div
                                    key={signer.userId}
                                    className='p-4 border border-gray-200 rounded-lg'>
                                    <div className='flex items-center justify-between'>
                                        <div className='flex items-center gap-3'>
                                            {documentData.signatureSequential && (
                                                <span className='flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-700 font-semibold rounded-full'>
                                                    {index + 1}
                                                </span>
                                            )}
                                            <div>
                                                <p className='font-medium text-gray-800'>
                                                    {signer.userName}
                                                </p>
                                                <p className='text-sm text-gray-600'>
                                                    {signer.userEmail}
                                                </p>
                                                {signer.role && (
                                                    <p className='text-xs text-gray-500 mt-1'>
                                                        Роль: {signer.role}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className='text-right'>
                                            <span
                                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                                    signer.status,
                                                )}`}>
                                                {signer.status === "signed" && (
                                                    <CheckCircle className='w-3 h-3' />
                                                )}
                                                {signer.status ===
                                                    "pending" && (
                                                    <Clock className='w-3 h-3' />
                                                )}
                                                {signer.status ===
                                                    "rejected" && (
                                                    <XCircle className='w-3 h-3' />
                                                )}
                                                {signer.status === "signed"
                                                    ? "Подписан"
                                                    : signer.status ===
                                                      "rejected"
                                                    ? "Отклонил"
                                                    : "Ожидает"}
                                            </span>
                                            {signer.signedAt && (
                                                <p className='text-xs text-gray-500 mt-1'>
                                                    {new Date(
                                                        signer.signedAt,
                                                    ).toLocaleString("ru-RU")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {signatureHistory.length > 0 && (
                        <div className='mb-6'>
                            <h2 className='text-xl font-semibold text-gray-800 mb-4'>
                                История подписей
                            </h2>
                            <div className='space-y-2'>
                                {signatureHistory.map((sig, idx) => {
                                    const isRejection =
                                        sig.type === "rejection";
                                    const isRecall =
                                        sig.type === "recall";
                                    const isResend =
                                        sig.type === "resend";
                                    const isAction =
                                        isRejection ||
                                        isRecall ||
                                        isResend;

                                    if (isAction) {
                                        const bgClass = isResend
                                            ? "bg-blue-50 border-blue-200"
                                            : "bg-red-50 border-red-200";
                                        const iconColor = isResend
                                            ? "text-blue-600"
                                            : "text-red-600";

                                        return (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-3 p-3 ${bgClass} border rounded-lg`}>
                                                {isRejection && (
                                                    <XCircle
                                                        className={`w-5 h-5 ${iconColor} flex-shrink-0`}
                                                    />
                                                )}
                                                {(isRecall ||
                                                    isResend) && (
                                                    <RotateCcw
                                                        className={`w-5 h-5 ${iconColor} flex-shrink-0`}
                                                    />
                                                )}
                                                <div className='flex-1 min-w-0'>
                                                    <p className='font-medium text-gray-800'>
                                                        {sig.userName}{" "}
                                                        <span
                                                            className={
                                                                isResend
                                                                    ? "text-blue-600"
                                                                    : "text-red-600"
                                                            }>
                                                            {isRejection &&
                                                                "— отклонил"}
                                                            {isRecall &&
                                                                "— отозвал"}
                                                            {isResend &&
                                                                "— отправил заново"}
                                                        </span>
                                                    </p>
                                                    <p className='text-sm text-gray-600'>
                                                        {new Date(
                                                            sig.date,
                                                        ).toLocaleString(
                                                            "ru-RU",
                                                        )}
                                                    </p>
                                                    {sig.comment && (
                                                        <p className='text-sm text-gray-600 mt-1 italic'>
                                                            &laquo;
                                                            {sig.comment}
                                                            &raquo;
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={idx}
                                            className='flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg'>
                                            {sig.signatureType ===
                                            "eds" ? (
                                                <Shield className='w-5 h-5 text-green-600 flex-shrink-0' />
                                            ) : (
                                                <CheckCircle className='w-5 h-5 text-green-600 flex-shrink-0' />
                                            )}
                                            <div className='flex-1 min-w-0'>
                                                <p className='font-medium text-gray-800'>
                                                    {sig.userName}{" "}
                                                    <span className='text-gray-600'>
                                                        ({sig.role})
                                                    </span>
                                                    {sig.signatureType ===
                                                        "eds" && (
                                                        <span className='ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded'>
                                                            ЭЦП
                                                        </span>
                                                    )}
                                                </p>
                                                <p className='text-sm text-gray-600'>
                                                    {new Date(
                                                        sig.signedAt,
                                                    ).toLocaleString(
                                                        "ru-RU",
                                                    )}
                                                    {sig.iin &&
                                                        ` • ИИН: ${sig.iin}`}
                                                </p>
                                            </div>

                                            {sig.cmsFileUrl && (
                                                <button
                                                    onClick={() =>
                                                        handleDownloadCms(
                                                            sig.cmsFileUrl,
                                                            sig.cmsFileName,
                                                            sig.userName,
                                                        )
                                                    }
                                                    className='flex items-center gap-1 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm font-medium transition-colors flex-shrink-0'
                                                    title='Скачать CMS файл подписи'>
                                                    <FileKey className='w-4 h-4' />
                                                    CMS
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {pdfPreviewUrl && (
                        <div className='mb-6'>
                            <h2 className='text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2'>
                                <Eye className='w-5 h-5 text-indigo-600' />
                                Предпросмотр документа
                            </h2>
                            <div className='mx-auto'>
                                <iframe
                                    src={pdfPreviewUrl}
                                    title='Предпросмотр PDF'
                                    className='w-full rounded-lg border border-gray-200 shadow-sm'
                                    style={{ height: 1000 }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Модальное окно отклонения */}
            <ConfirmModal
                isOpen={showRejectModal}
                onClose={() => {
                    setShowRejectModal(false);
                    setRejectComment("");
                }}
                onConfirm={handleReject}
                title='Отклонить документ'
                message='Вы уверены, что хотите отклонить этот документ? Он будет отправлен на корректировку.'
                confirmText='Отклонить'
                type='danger'
                isLoading={actionLoading}>
                <textarea
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    placeholder='Причина отклонения (необязательно)'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent'
                    rows={3}
                />
            </ConfirmModal>

            {/* Модальное окно отзыва */}
            <ConfirmModal
                isOpen={showRecallModal}
                onClose={() => {
                    setShowRecallModal(false);
                    setRecallComment("");
                }}
                onConfirm={handleRecall}
                title='Отозвать документ'
                message='Вы уверены, что хотите отозвать документ на корректировку?'
                confirmText='Отозвать'
                type='warning'
                isLoading={actionLoading}>
                <textarea
                    value={recallComment}
                    onChange={(e) => setRecallComment(e.target.value)}
                    placeholder='Причина отзыва (необязательно)'
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent'
                    rows={3}
                />
            </ConfirmModal>
        </div>
    );
}
