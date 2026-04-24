import React, { useState, useEffect, useRef } from "react";
import {
    getAllUsers,
    uploadFile,
    createDocument,
    getDocumentTypes,
    getDepartments,
    getSubdivisions,
    getUser as getCurrentUser,
    apiMe as getMe,
} from "../api/signdocClient";
import {
    Upload,
    UserPlus,
    ArrowRight,
    Save,
    X,
    Shield,
    Pen,
    FileText,
    CheckCircle,
    Loader2,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "./Toast";
import DocumentSignatureApp from "./DocumentSignatureApp";
import EdsSignature from "./EdsSignature";

export default function DocumentCreate() {
    const [step, setStep] = useState(1);
    const [files, setFiles] = useState([]); // Массив файлов
    const [titles, setTitles] = useState([]); // Массив названий
    const [users, setUsers] = useState([]);
    const [selectedSigners, setSelectedSigners] = useState([]);
    const [sequential, setSequential] = useState(true);
    const [signedFiles, setSignedFiles] = useState([]); // Массив подписанных файлов
    const [loading, setLoading] = useState(false);
    const [signatureType, setSignatureType] = useState(null);
    const [documentTypes, setDocumentTypes] = useState([]);
    const [documentTypeId, setDocumentTypeId] = useState("");
    const [departments, setDepartments] = useState([]);
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [signerSearchQuery, setSignerSearchQuery] = useState("");
    const [subdivisions, setSubdivisions] = useState([]);
    const [subdivisionId, setSubdivisionId] = useState("");

    // Pre-signed data from KPI or other modules (already signed with EDS before entering wizard)
    const [preSignedData, setPreSignedData] = useState(null);

    // Массовое подписание ЭЦП
    const [currentSigningIndex, setCurrentSigningIndex] = useState(0);
    const [isSigningAll, setIsSigningAll] = useState(false);
    const [signedCount, setSignedCount] = useState(0);
    const processedBatchIndexesRef = useRef(new Set());

    const currentUser = getCurrentUser();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const isMultipleFiles = files.length > 1;

    useEffect(() => {
        loadUsers();
        loadDocumentTypes();
        loadDepartments();
        loadSubdivisions();
    }, []);

    // Accept pre-loaded file from KPI or other modules via route state
    useEffect(() => {
        const state = location.state;
        if (state?.pendingPreSigned && state?.pendingFile) {
            // PDF already signed with EDS — skip to step 4 (select signers)
            const file = state.pendingFile;
            const title = state.pendingTitle || file.name.replace(/\.pdf$/i, "");
            setFiles([file]);
            setTitles([title]);
            setSignatureType("eds");
            setPreSignedData({
                cmsBlob: state.pendingCms,
                meta: state.pendingMeta,
            });
            setSignedFiles([{
                pdf: file,
                cms: state.pendingCms,
                signature: {
                    type: "eds",
                    name: state.pendingMeta?.name || "",
                    iin: state.pendingMeta?.iin || "",
                    date: state.pendingMeta?.date || "",
                    timestamp: state.pendingMeta?.timestamp || new Date().toISOString(),
                },
                title,
            }]);
            setStep(4);
            navigate(location.pathname, { replace: true, state: {} });
        } else if (state?.pendingFile) {
            setFiles([state.pendingFile]);
            setTitles([state.pendingTitle || state.pendingFile.name.replace(/\.pdf$/i, "")]);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, []);

    const loadUsers = async () => {
        try {
            const allUsers = await getAllUsers();
            const myId = Number(currentUser.id);
            const normalized = allUsers
                .filter((u) => Number(u.id) !== myId)
                .map((u) => {
                    const dept = u?.department;
                    const deptId =
                        dept?.id ||
                        dept?.documentId ||
                        dept?.data?.id ||
                        dept?.data?.documentId ||
                        u?.department?.id ||
                        null;
                    const deptName =
                        dept?.name ||
                        dept?.data?.name ||
                        dept?.attributes?.name ||
                        "";

                    return {
                        ...u,
                        departmentId: deptId,
                        departmentName: deptName,
                    };
                });
            setUsers(normalized);
        } catch (error) {
            console.error("Ошибка загрузки пользователей:", error);
            toast.error("Ошибка загрузки списка пользователей");
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
            normalized.sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", "ru")
            );
            setDocumentTypes(normalized);
        } catch (error) {
            console.error("Ошибка загрузки видов документов:", error);
            toast.error("Ошибка загрузки видов документов");
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
            normalized.sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", "ru")
            );
            setDepartments(normalized);
        } catch (error) {
            console.error("Ошибка загрузки отделов:", error);
            toast.error("Ошибка загрузки отделов");
        }
    };

    const loadSubdivisions = async () => {
        try {
            const me = await getMe();
            const dept = me?.department;
            const deptId = dept?.id || dept?.documentId || null;
            if (!deptId) return;
            const data = await getSubdivisions(deptId);
            const normalized = data.map((s) => ({
                id: s.id || s.documentId,
                name: s.name,
            }));
            normalized.sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", "ru")
            );
            setSubdivisions(normalized);
        } catch (err) {
            console.error("Ошибка загрузки подразделений:", err);
        }
    };

    const handleFileUpload = (e) => {
        const uploadedFiles = Array.from(e.target.files);
        if (uploadedFiles.length === 0) return;

        const pdfFiles = uploadedFiles.filter((f) => f.name.endsWith(".pdf"));

        if (pdfFiles.length !== uploadedFiles.length) {
            toast.warning(
                "Некоторые файлы пропущены. Поддерживается только формат PDF."
            );
        }

        if (pdfFiles.length === 0) {
            toast.error("Пожалуйста, загрузите документы в формате PDF");
            return;
        }

        setFiles(pdfFiles);
        setTitles(pdfFiles.map((f) => f.name.replace(".pdf", "")));
        setSignedFiles([]);
        setCurrentSigningIndex(0);
        setSignedCount(0);
        processedBatchIndexesRef.current.clear();

        toast.success(`Загружено файлов: ${pdfFiles.length}`);
    };

    const handleRemoveFile = (index) => {
        const newFiles = files.filter((_, i) => i !== index);
        const newTitles = titles.filter((_, i) => i !== index);
        setFiles(newFiles);
        setTitles(newTitles);

        if (newFiles.length === 0) {
            setSignatureType(null);
        }
    };

    const handleTitleChange = (index, value) => {
        const newTitles = [...titles];
        newTitles[index] = value;
        setTitles(newTitles);
    };

    const handleAddSigner = (user) => {
        if (selectedSigners.find((s) => s.userId === user.id)) {
            setSelectedSigners(
                selectedSigners.filter((s) => s.userId !== user.id)
            );
        } else {
            setSelectedSigners([
                ...selectedSigners,
                {
                    userId: user.id,
                    userName: user.fullName || user.username,
                    userEmail: user.email,
                    order: selectedSigners.length + 1,
                    role: "",
                    status: "pending",
                },
            ]);
        }
    };

    const moveSignerUp = (index) => {
        if (index === 0) return;
        const newSigners = [...selectedSigners];
        [newSigners[index - 1], newSigners[index]] = [
            newSigners[index],
            newSigners[index - 1],
        ];
        newSigners.forEach((s, i) => (s.order = i + 1));
        setSelectedSigners(newSigners);
    };

    const moveSignerDown = (index) => {
        if (index === selectedSigners.length - 1) return;
        const newSigners = [...selectedSigners];
        [newSigners[index], newSigners[index + 1]] = [
            newSigners[index + 1],
            newSigners[index],
        ];
        newSigners.forEach((s, i) => (s.order = i + 1));
        setSelectedSigners(newSigners);
    };

    // Callback для одиночной подписи (простая подпись)
    const handleSingleSignatureComplete = (
        signedPdfBlob,
        cmsBlob,
        signatureData
    ) => {
        setSignedFiles([
            {
                pdf: signedPdfBlob,
                cms: cmsBlob,
                signature: signatureData,
                title: titles[0],
            },
        ]);
        setStep(4);
        toast.success("Документ успешно подписан");
    };

    // Callback для массового подписания ЭЦП
    const handleBatchSignatureComplete = (
        signedPdfBlob,
        cmsBlob,
        signatureData
    ) => {
        const sourceIndex = Number.isInteger(signatureData?.sourceIndex)
            ? signatureData.sourceIndex
            : currentSigningIndex;

        // Защита от двойной обработки одного и того же документа
        if (processedBatchIndexesRef.current.has(sourceIndex)) {
            return;
        }
        processedBatchIndexesRef.current.add(sourceIndex);

        setSignedFiles((prev) => {
            const expectedIndex = prev.length;
            if (sourceIndex !== expectedIndex) {
                // Если индекс неожиданно "прыгает", игнорируем запись,
                // чтобы не перетереть другой документ неправильным PDF.
                return prev;
            }

            return [
                ...prev,
                {
                    pdf: signedPdfBlob,
                    cms: cmsBlob,
                    signature: signatureData,
                    title: titles[sourceIndex],
                },
            ];
        });

        setSignedCount((prev) => Math.max(prev, sourceIndex + 1));

        if (sourceIndex < files.length - 1) {
            // Переходим к следующему файлу строго по индексу источника подписи
            setCurrentSigningIndex(sourceIndex + 1);
        } else {
            // Все файлы подписаны
            setIsSigningAll(false);
            setStep(4);
            toast.success(`Все документы подписаны (${files.length})`);
        }
    };

    const handleSubmit = async () => {
        if (selectedSigners.length === 0) {
            toast.warning("Выберите хотя бы одного подписанта");
            return;
        }

        setLoading(true);

        try {
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < signedFiles.length; i++) {
                const signedFile = signedFiles[i];

                try {
                    const uploadedFile = await uploadFile(signedFile.pdf);

                    let cmsFileUrl = null;
                    let cmsFileName = null;

                    if (signedFile.cms) {
                        const cmsFileNameGenerated = `${
                            signedFile.title
                        }_creator_${Date.now()}.cms`;
                        const cmsFileObj = new File(
                            [signedFile.cms],
                            cmsFileNameGenerated,
                            {
                                type: "application/pkcs7-signature",
                            }
                        );
                        const uploadedCmsFile = await uploadFile(cmsFileObj);
                        cmsFileUrl = uploadedCmsFile?.url || null;
                        cmsFileName =
                            uploadedCmsFile?.name || cmsFileNameGenerated;
                    }

                    const documentData = {
                        title: signedFile.title,
                        originalFile: uploadedFile.id,
                        currentFile: uploadedFile.id,
                        status: "in_progress",
                        creator: currentUser.id,
                        documentType: documentTypeId || null,
                        subdivision: subdivisionId || null,
                        signers: selectedSigners,
                        signatureSequential: sequential,
                        signatureType: signatureType,
                        signatureHistory: [
                            {
                                userId: currentUser.id,
                                userName:
                                    currentUser.fullName ||
                                    currentUser.username,
                                role:
                                    signedFile.signature.position ||
                                    signedFile.signature.name ||
                                    "Создатель",
                                signedAt: new Date().toISOString(),
                                signatureType: signedFile.signature.type,
                                cmsFileUrl: cmsFileUrl,
                                cmsFileName: cmsFileName,
                                iin: signedFile.signature.iin || null,
                            },
                        ],
                    };

                    await createDocument(documentData);
                    successCount++;
                } catch (error) {
                    console.error(
                        `Ошибка создания документа ${signedFile.title}:`,
                        error
                    );
                    errorCount++;
                }
            }

            if (errorCount === 0) {
                toast.success(`Успешно создано документов: ${successCount}`);
            } else {
                toast.warning(
                    `Создано: ${successCount}, ошибок: ${errorCount}`
                );
            }

            navigate("/app/signdoc/documents");
        } catch (error) {
            console.error("Ошибка создания документов:", error);
            toast.error("Ошибка создания документов");
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter((user) => {
        if (departmentFilter !== "all") {
            if (String(user.departmentId) !== String(departmentFilter)) {
                return false;
            }
        }

        if (!signerSearchQuery.trim()) return true;

        const query = signerSearchQuery.trim().toLowerCase();
        const fullName = (user.fullName || "").toLowerCase();
        const username = (user.username || "").toLowerCase();
        const email = (user.email || "").toLowerCase();

        return (
            fullName.includes(query) ||
            username.includes(query) ||
            email.includes(query)
        );
    });

    // Шаг 1: Загрузка файлов
    if (step === 1) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
                <div className='max-w-4xl mx-auto'>
                    <div className='bg-white rounded-2xl shadow-xl p-8'>
                        <h1 className='text-3xl font-bold text-gray-800 mb-6'>
                            Создать новый документ
                        </h1>

                        <div className='space-y-6'>
                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-2'>
                                    Вид документа
                                </label>
                                <select
                                    value={documentTypeId}
                                    onChange={(e) =>
                                        setDocumentTypeId(e.target.value)
                                    }
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500'>
                                    <option value=''>Выберите вид</option>
                                    {documentTypes.map((type) => (
                                        <option key={type.id} value={type.id}>
                                            {type.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {subdivisions.length > 0 && (
                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                                        Подразделение
                                    </label>
                                    <select
                                        value={subdivisionId}
                                        onChange={(e) =>
                                            setSubdivisionId(e.target.value)
                                        }
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500'>
                                        <option value=''>— Общий документ —</option>
                                        {subdivisions.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Загрузка файлов */}
                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-2'>
                                    Загрузите PDF документы
                                    <span className='text-gray-500 font-normal ml-2'>
                                        (можно выбрать несколько)
                                    </span>
                                </label>

                                {files.length === 0 ? (
                                    <div className='border-4 border-dashed border-indigo-300 rounded-xl p-12 text-center hover:border-indigo-500 transition-colors'>
                                        <Upload className='w-16 h-16 text-indigo-400 mx-auto mb-4' />
                                        <label className='cursor-pointer'>
                                            <span className='text-lg font-semibold text-gray-700 hover:text-indigo-600'>
                                                Нажмите для загрузки
                                            </span>
                                            <input
                                                type='file'
                                                accept='.pdf'
                                                multiple
                                                onChange={handleFileUpload}
                                                className='hidden'
                                            />
                                        </label>
                                        <p className='text-gray-500 mt-2'>
                                            Поддерживается формат: PDF
                                        </p>
                                    </div>
                                ) : (
                                    <div className='space-y-3'>
                                        {/* Список загруженных файлов */}
                                        <div className='max-h-96 overflow-y-auto space-y-3'>
                                            {files.map((file, index) => (
                                                <div
                                                    key={index}
                                                    className='border border-gray-200 rounded-lg p-4'>
                                                    <div className='flex items-center gap-3 mb-3'>
                                                        <FileText className='w-8 h-8 text-indigo-600 flex-shrink-0' />
                                                        <div className='flex-1 min-w-0'>
                                                            <p className='text-sm text-gray-500 truncate'>
                                                                {file.name}
                                                            </p>
                                                            <p className='text-xs text-gray-400'>
                                                                {(
                                                                    file.size /
                                                                    1024
                                                                ).toFixed(
                                                                    1
                                                                )}{" "}
                                                                KB
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() =>
                                                                handleRemoveFile(
                                                                    index
                                                                )
                                                            }
                                                            className='p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors'>
                                                            <X className='w-5 h-5' />
                                                        </button>
                                                    </div>
                                                    <input
                                                        type='text'
                                                        value={titles[index]}
                                                        onChange={(e) =>
                                                            handleTitleChange(
                                                                index,
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder='Название документа'
                                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500'
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        {/* Добавить ещё */}
                                        <label className='flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-gray-50 transition-colors'>
                                            <Upload className='w-5 h-5 text-gray-500' />
                                            <span className='text-sm text-gray-600'>
                                                Добавить ещё файлы
                                            </span>
                                            <input
                                                type='file'
                                                accept='.pdf'
                                                multiple
                                                onChange={(e) => {
                                                    const newFiles = Array.from(
                                                        e.target.files
                                                    ).filter((f) =>
                                                        f.name.endsWith(".pdf")
                                                    );
                                                    if (newFiles.length > 0) {
                                                        setFiles([
                                                            ...files,
                                                            ...newFiles,
                                                        ]);
                                                        setTitles([
                                                            ...titles,
                                                            ...newFiles.map(
                                                                (f) =>
                                                                    f.name.replace(
                                                                        ".pdf",
                                                                        ""
                                                                    )
                                                            ),
                                                        ]);
                                                    }
                                                }}
                                                className='hidden'
                                            />
                                        </label>

                                        {/* Информация */}
                                        <div className='flex items-center gap-2 p-3 bg-indigo-50 rounded-lg'>
                                            <FileText className='w-5 h-5 text-indigo-600' />
                                            <span className='text-sm text-indigo-800'>
                                                Загружено файлов:{" "}
                                                <strong>{files.length}</strong>
                                            </span>
                                            {isMultipleFiles && (
                                                <span className='text-xs text-indigo-600 ml-auto'>
                                                    Массовое подписание только
                                                    через ЭЦП
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setStep(2)}
                                disabled={
                                    files.length === 0 ||
                                    titles.some((t) => !t.trim()) ||
                                    !documentTypeId
                                }
                                className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                                    files.length === 0 ||
                                    titles.some((t) => !t.trim()) ||
                                    !documentTypeId
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                }`}>
                                Далее: Выбрать тип подписи
                                <ArrowRight className='w-5 h-5' />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Шаг 2: Выбор типа подписи
    if (step === 2) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
                <div className='max-w-4xl mx-auto'>
                    <div className='bg-white rounded-2xl shadow-xl p-8'>
                        <h1 className='text-3xl font-bold text-gray-800 mb-2'>
                            Выберите тип подписи
                        </h1>
                        <p className='text-gray-600 mb-8'>
                            {isMultipleFiles
                                ? `Для массового подписания (${files.length} документов) доступен только ЭЦП`
                                : "Этот тип подписи будет использоваться всеми подписантами документа"}
                        </p>

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-8'>
                            {/* Простая подпись */}
                            <button
                                onClick={() =>
                                    !isMultipleFiles &&
                                    setSignatureType("simple")
                                }
                                disabled={isMultipleFiles}
                                className={`p-6 border-2 rounded-xl text-left transition-all ${
                                    isMultipleFiles
                                        ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                                        : signatureType === "simple"
                                        ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600"
                                        : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
                                }`}>
                                <Pen
                                    className={`w-12 h-12 mb-4 ${
                                        isMultipleFiles
                                            ? "text-gray-400"
                                            : "text-indigo-600"
                                    }`}
                                />
                                <h3
                                    className={`text-xl font-semibold mb-2 ${
                                        isMultipleFiles
                                            ? "text-gray-400"
                                            : "text-gray-800"
                                    }`}>
                                    Простая подпись
                                </h3>
                                <p
                                    className={
                                        isMultipleFiles
                                            ? "text-gray-400"
                                            : "text-gray-600"
                                    }>
                                    Подписанты рисуют подпись от руки. Быстро и
                                    просто, не требует дополнительного ПО.
                                </p>
                                {isMultipleFiles && (
                                    <p className='text-xs text-red-500 mt-3'>
                                        Недоступно для массового подписания
                                    </p>
                                )}
                            </button>

                            {/* ЭЦП */}
                            <button
                                onClick={() => setSignatureType("eds")}
                                className={`p-6 border-2 rounded-xl text-left transition-all ${
                                    signatureType === "eds"
                                        ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600"
                                        : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
                                }`}>
                                <Shield className='w-12 h-12 text-indigo-600 mb-4' />
                                <h3 className='text-xl font-semibold text-gray-800 mb-2'>
                                    ЭЦП (NCALayer)
                                </h3>
                                <p className='text-gray-600'>
                                    Электронная цифровая подпись через NCALayer.
                                    Юридически значимая подпись.
                                </p>
                                {isMultipleFiles && (
                                    <p className='text-xs text-green-600 mt-3'>
                                        ✓ Рекомендуется для массового подписания
                                    </p>
                                )}
                            </button>
                        </div>

                        <div className='flex gap-4'>
                            <button
                                onClick={() => setStep(1)}
                                className='flex-1 py-3 px-6 rounded-lg font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700'>
                                Назад
                            </button>
                            <button
                                onClick={() => setStep(3)}
                                disabled={!signatureType}
                                className={`flex-1 py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                                    !signatureType
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                }`}>
                                Далее: Подписать документы
                                <ArrowRight className='w-5 h-5' />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Шаг 3: Подписание
    if (step === 3) {
        // Простая подпись (только для одного файла)
        if (signatureType === "simple" && !isMultipleFiles) {
            return (
                <DocumentSignatureApp
                    preloadedFile={files[0]}
                    onSignatureComplete={handleSingleSignatureComplete}
                    isCreatingDocument={true}
                    signatureType={signatureType}
                />
            );
        }

        // ЭЦП (один или несколько файлов)
        if (signatureType === "eds") {
            return (
                <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
                    <div className='max-w-4xl mx-auto'>
                        <div className='bg-white rounded-2xl shadow-xl p-8'>
                            <div className='flex items-center gap-3 mb-6'>
                                <Shield className='w-10 h-10 text-indigo-600' />
                                <div>
                                    <h1 className='text-2xl font-bold text-gray-800'>
                                        Подписание документов через ЭЦП
                                    </h1>
                                    <p className='text-gray-600'>
                                        {isMultipleFiles
                                            ? `Документ ${
                                                  currentSigningIndex + 1
                                              } из ${files.length}`
                                            : "Подпишите документ с помощью NCALayer"}
                                    </p>
                                </div>
                            </div>

                            {/* Прогресс для массового подписания */}
                            {isMultipleFiles && (
                                <div className='mb-6'>
                                    <div className='flex items-center justify-between mb-2'>
                                        <span className='text-sm font-medium text-gray-700'>
                                            Прогресс подписания
                                        </span>
                                        <span className='text-sm text-gray-600'>
                                            {signedCount} / {files.length}
                                        </span>
                                    </div>
                                    <div className='w-full h-2 bg-gray-200 rounded-full overflow-hidden'>
                                        <div
                                            className='h-full bg-indigo-600 transition-all duration-300'
                                            style={{
                                                width: `${
                                                    (signedCount /
                                                        files.length) *
                                                    100
                                                }%`,
                                            }}
                                        />
                                    </div>

                                    {/* Список файлов с статусами */}
                                    <div className='mt-4 max-h-40 overflow-y-auto space-y-2'>
                                        {files.map((file, index) => (
                                            <div
                                                key={index}
                                                className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                                                    index < signedCount
                                                        ? "bg-green-50 text-green-800"
                                                        : index ===
                                                          currentSigningIndex
                                                        ? "bg-indigo-50 text-indigo-800 ring-2 ring-indigo-300"
                                                        : "bg-gray-50 text-gray-600"
                                                }`}>
                                                {index < signedCount ? (
                                                    <CheckCircle className='w-4 h-4 text-green-600' />
                                                ) : index ===
                                                  currentSigningIndex ? (
                                                    <Loader2 className='w-4 h-4 text-indigo-600 animate-spin' />
                                                ) : (
                                                    <FileText className='w-4 h-4 text-gray-400' />
                                                )}
                                                <span className='truncate'>
                                                    {titles[index]}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Текущий документ */}
                            <div className='bg-gray-50 rounded-xl p-4 mb-6'>
                                <p className='text-sm text-gray-600'>
                                    Текущий документ:
                                </p>
                                <p className='font-semibold text-gray-800'>
                                    {titles[currentSigningIndex]}
                                </p>
                                <p className='text-xs text-gray-500'>
                                    {files[currentSigningIndex].name}
                                </p>
                            </div>

                            {/* Компонент ЭЦП подписи */}
                            <EdsSignature
                                file={files[currentSigningIndex]}
                                onSignatureComplete={
                                    handleBatchSignatureComplete
                                }
                                isCreatingDocument={true}
                                signatureIndex={0}
                                sourceIndex={currentSigningIndex}
                                keepNcaSession={isMultipleFiles}
                                autoStartSigning={isMultipleFiles}
                                autoCompleteOnSign={isMultipleFiles}
                            />

                            {/* Кнопка назад */}
                            <button
                                onClick={() => {
                                    setStep(2);
                                    setSignedFiles([]);
                                    setCurrentSigningIndex(0);
                                    setSignedCount(0);
                                    processedBatchIndexesRef.current.clear();
                                }}
                                className='w-full mt-4 py-2 px-6 rounded-lg font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700'>
                                ← Назад к выбору типа подписи
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
    }

    // Шаг 4: Выбор подписантов
    if (step === 4) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
                <div className='max-w-4xl mx-auto'>
                    <div className='bg-white rounded-2xl shadow-xl p-8'>
                        <h1 className='text-3xl font-bold text-gray-800 mb-2'>
                            Выбор подписантов
                        </h1>
                        <p className='text-gray-600 mb-2'>
                            Выберите пользователей которые должны подписать
                            документы
                        </p>

                        {/* Информация о подписанных документах */}
                        <div className='mb-6 p-4 bg-green-50 border border-green-200 rounded-lg'>
                            <div className='flex items-center gap-2 mb-2'>
                                <CheckCircle className='w-5 h-5 text-green-600' />
                                <span className='font-semibold text-green-800'>
                                    Подписано документов: {signedFiles.length}
                                </span>
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                {signedFiles.map((file, index) => (
                                    <span
                                        key={index}
                                        className='inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full'>
                                        <FileText className='w-3 h-3' />
                                        {file.title}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className='mb-6 p-3 bg-indigo-50 rounded-lg flex items-center gap-2'>
                            {signatureType === "eds" ? (
                                <Shield className='w-5 h-5 text-indigo-600' />
                            ) : (
                                <Pen className='w-5 h-5 text-indigo-600' />
                            )}
                            <span className='text-indigo-800 font-medium'>
                                Тип подписи:{" "}
                                {signatureType === "eds"
                                    ? "ЭЦП (NCALayer)"
                                    : "Простая подпись"}
                            </span>
                        </div>

                        <div className='mb-6'>
                            <label className='flex items-center gap-3 cursor-pointer'>
                                <input
                                    type='checkbox'
                                    checked={sequential}
                                    onChange={(e) =>
                                        setSequential(e.target.checked)
                                    }
                                    className='w-5 h-5 text-indigo-600 rounded'
                                />
                                <span className='text-sm font-medium text-gray-700'>
                                    Последовательное подписание (по порядку)
                                </span>
                            </label>
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <div>
                                <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                                    Доступные пользователи
                                </h3>
                                <div className='space-y-3 mb-4'>
                                    <input
                                        type='text'
                                        value={signerSearchQuery}
                                        onChange={(e) =>
                                            setSignerSearchQuery(
                                                e.target.value
                                            )
                                        }
                                        placeholder='Поиск по ФИО, логину или email'
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500'
                                    />
                                    <select
                                        value={departmentFilter}
                                        onChange={(e) =>
                                            setDepartmentFilter(e.target.value)
                                        }
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500'>
                                        <option value='all'>
                                            Все отделы
                                        </option>
                                        {departments.map((dept) => (
                                            <option
                                                key={dept.id}
                                                value={dept.id}>
                                                {dept.name}
                                            </option>
                                        ))}
                                    </select>
                                    <p className='text-xs text-gray-500'>
                                        Найдено: {filteredUsers.length} из{" "}
                                        {users.length}
                                    </p>
                                </div>
                                <div className='space-y-2 max-h-96 overflow-y-auto'>
                                    {filteredUsers.length === 0 ? (
                                        <div className='p-4 border border-gray-200 rounded-lg text-sm text-gray-500'>
                                            Пользователи не найдены
                                        </div>
                                    ) : (
                                        filteredUsers.map((user) => (
                                            <div
                                                key={user.id}
                                                onClick={() =>
                                                    handleAddSigner(user)
                                                }
                                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                                    selectedSigners.find(
                                                        (s) =>
                                                            s.userId === user.id
                                                    )
                                                        ? "border-indigo-600 bg-indigo-50"
                                                        : "border-gray-300 hover:border-indigo-400"
                                                }`}>
                                                <p className='font-medium text-gray-800'>
                                                    {user.fullName ||
                                                        user.username}
                                                </p>
                                                <p className='text-sm text-gray-600'>
                                                    {user.email}
                                                </p>
                                                {user.departmentName && (
                                                    <p className='text-xs text-gray-500 mt-1'>
                                                        Отдел:{" "}
                                                        {user.departmentName}
                                                    </p>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div>
                                <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                                    Подписанты ({selectedSigners.length})
                                </h3>
                                {selectedSigners.length === 0 ? (
                                    <div className='text-center py-12 text-gray-500'>
                                        <UserPlus className='w-12 h-12 mx-auto mb-2' />
                                        <p>Выберите подписантов</p>
                                    </div>
                                ) : (
                                    <div className='space-y-2'>
                                        {selectedSigners.map(
                                            (signer, index) => (
                                                <div
                                                    key={signer.userId}
                                                    className='p-3 border border-gray-300 rounded-lg'>
                                                    <div className='flex items-center justify-between'>
                                                        <div>
                                                            <p className='font-medium text-gray-800'>
                                                                {sequential &&
                                                                    `${
                                                                        index +
                                                                        1
                                                                    }. `}
                                                                {
                                                                    signer.userName
                                                                }
                                                            </p>
                                                            <p className='text-sm text-gray-600'>
                                                                {
                                                                    signer.userEmail
                                                                }
                                                            </p>
                                                        </div>
                                                        {sequential && (
                                                            <div className='flex gap-1'>
                                                                <button
                                                                    onClick={() =>
                                                                        moveSignerUp(
                                                                            index
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        index ===
                                                                        0
                                                                    }
                                                                    className='p-1 text-gray-600 hover:text-indigo-600 disabled:opacity-30'>
                                                                    ↑
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        moveSignerDown(
                                                                            index
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        index ===
                                                                        selectedSigners.length -
                                                                            1
                                                                    }
                                                                    className='p-1 text-gray-600 hover:text-indigo-600 disabled:opacity-30'>
                                                                    ↓
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='flex gap-4 mt-8'>
                            <button
                                onClick={() => {
                                    setStep(3);
                                    setSignedFiles([]);
                                    setCurrentSigningIndex(0);
                                    setSignedCount(0);
                                    processedBatchIndexesRef.current.clear();
                                }}
                                className='flex-1 py-3 px-6 rounded-lg font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700'>
                                Назад
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={
                                    loading || selectedSigners.length === 0
                                }
                                className={`flex-1 py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                                    loading || selectedSigners.length === 0
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-green-600 hover:bg-green-700 text-white"
                                }`}>
                                {loading ? (
                                    <>
                                        <Loader2 className='w-5 h-5 animate-spin' />
                                        Создание... ({signedFiles.length} док.)
                                    </>
                                ) : (
                                    <>
                                        <Save className='w-5 h-5' />
                                        Создать и отправить (
                                        {signedFiles.length} док.)
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
