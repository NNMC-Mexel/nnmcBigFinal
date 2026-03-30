import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    getMyDocuments,
    getPendingDocuments,
    updateDocument,
    uploadFile,
    getDocumentFileUrl,
} from "../api/documents";
import { getCurrentUser } from "../api/auth";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import {
    Shield,
    FileText,
    CheckCircle,
    Loader2,
    ArrowLeft,
    XCircle,
    Play,
} from "lucide-react";
import { useToast } from "./Toast";

const NCA_LAYER_URL = "wss://127.0.0.1:13579/";

const FONT_URL =
    "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf";
const FONT_BOLD_URL =
    "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAw.ttf";

const getUserFullName = () => {
    const user = localStorage.getItem("user");
    if (user) {
        const userData = JSON.parse(user);
        return userData.fullName || userData.username || "";
    }
    return "";
};


const formatShortName = (fullName) => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} ${parts[1].charAt(0)}.`;
    if (parts.length >= 3)
        return `${parts[0]} ${parts[1].charAt(0)}.${parts[2].charAt(0)}.`;
    return fullName;
};

const arrayBufferToBase64 = (buffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

export default function BatchSignPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const toast = useToast();
    const currentUser = getCurrentUser();

    const [documents, setDocuments] = useState([]);
    const [documentFiles, setDocumentFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isComplete, setIsComplete] = useState(false);

    const [status, setStatus] = useState("ready");
    const [currentSigningIndex, setCurrentSigningIndex] = useState(-1);
    const [signedCount, setSignedCount] = useState(0);
    const [errorMessage, setErrorMessage] = useState("");
    const [certInfo, setCertInfo] = useState(null);
    const [statusMessage, setStatusMessage] = useState("");

    const [fontBytes, setFontBytes] = useState(null);
    const [fontBoldBytes, setFontBoldBytes] = useState(null);
    const [fontsLoaded, setFontsLoaded] = useState(false);

    const documentIds = location.state?.documentIds || [];

    useEffect(() => {
        if (documentIds.length === 0) {
            toast.error("Не выбраны документы для подписания");
            navigate("/documents/pending");
            return;
        }
        loadFonts();
        loadDocuments();
    }, []);

    const loadFonts = async () => {
        try {
            const [regularResponse, boldResponse] = await Promise.all([
                fetch(FONT_URL),
                fetch(FONT_BOLD_URL),
            ]);
            const [regularBytes, boldBytes] = await Promise.all([
                regularResponse.arrayBuffer(),
                boldResponse.arrayBuffer(),
            ]);
            setFontBytes(regularBytes);
            setFontBoldBytes(boldBytes);
            setFontsLoaded(true);
        } catch (error) {
            console.error("Ошибка загрузки шрифтов:", error);
            setFontsLoaded(true);
        }
    };

    const loadDocuments = async () => {
        setLoading(true);
        try {
            const allDocs = await getPendingDocuments();
            const selectedDocs = allDocs.filter((doc) =>
                documentIds.includes(doc.id)
            );

            if (selectedDocs.length === 0) {
                toast.error("Документы не найдены");
                navigate("/documents/pending");
                return;
            }

            setDocuments(selectedDocs);

            // Загружаем PDF файлы для каждого документа
            const files = [];
            for (const doc of selectedDocs) {
                try {
                    const presignedUrl = await getDocumentFileUrl(doc.documentId);

                    if (presignedUrl) {
                        const response = await fetch(presignedUrl);
                        const arrayBuffer = await response.arrayBuffer();

                        // Проверяем что это действительно PDF (начинается с %PDF)
                        const uint8Array = new Uint8Array(arrayBuffer);
                        const header = String.fromCharCode(
                            ...uint8Array.slice(0, 5)
                        );

                        if (!header.startsWith("%PDF")) {
                            console.error(
                                `Файл документа ${doc.id} не является PDF:`,
                                header
                            );
                            toast.warning(
                                `Документ "${doc.title}" не является PDF файлом`
                            );
                            continue; // Пропускаем этот файл
                        }

                        const base64 = arrayBufferToBase64(arrayBuffer);

                        files.push({
                            docId: doc.id,
                            base64: base64,
                            uint8Array: uint8Array,
                        });
                    }
                } catch (err) {
                    console.error(
                        `Ошибка загрузки файла для документа ${doc.id}:`,
                        err
                    );
                    toast.warning(
                        `Не удалось загрузить файл "${doc.title}"`
                    );
                }
            }

            setDocumentFiles(files);

            if (files.length === 0) {
                toast.error("Не удалось загрузить файлы документов");
                navigate("/documents/pending");
            } else if (files.length < selectedDocs.length) {
                toast.warning(
                    `Загружено ${files.length} из ${selectedDocs.length} документов`
                );
            }
        } catch (error) {
            console.error("Ошибка загрузки документов:", error);
            toast.error("Ошибка загрузки документов");
            navigate("/documents/pending");
        } finally {
            setLoading(false);
        }
    };

    const parseCertFromSignature = (signature) => {
        try {
            const binaryString = atob(signature);
            let name = "";
            let iin = "";

            const cnMatch = binaryString.match(/CN=([^,\x00-\x1F]+)/);
            if (cnMatch) name = cnMatch[1].trim();

            const serialMatch = binaryString.match(/SERIALNUMBER=IIN(\d{12})/i);
            if (serialMatch) {
                iin = serialMatch[1];
            } else {
                const iinMatch = binaryString.match(/IIN(\d{12})/i);
                if (iinMatch) iin = iinMatch[1];
            }

            return { name, iin };
        } catch (e) {
            return { name: "", iin: "" };
        }
    };

    const createSignedPdfWithQR = async (
        originalBytes,
        signature,
        certData,
        sigIndex
    ) => {
        try {
            const pdfDoc = await PDFDocument.load(originalBytes);

            if (fontBytes && fontBoldBytes) {
                pdfDoc.registerFontkit(fontkit);
            }

            let font, fontBold;
            if (fontBytes && fontBoldBytes) {
                font = await pdfDoc.embedFont(fontBytes);
                fontBold = await pdfDoc.embedFont(fontBoldBytes);
            } else {
                const { StandardFonts } = await import("pdf-lib");
                font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            }

            const pages = pdfDoc.getPages();
            const lastPage = pages[pages.length - 1];
            const { width } = lastPage.getSize();

            const userDisplayName = getUserFullName();

            const qrData = JSON.stringify({
                name: certData.name,
                fullName: userDisplayName,
                iin: certData.iin,
                date: certData.timestamp,
                hash: signature.substring(0, 32),
            });

            const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
                width: 60,
                margin: 1,
            });
            const qrImageBytes = await fetch(qrCodeDataUrl).then((res) =>
                res.arrayBuffer()
            );
            const qrImage = await pdfDoc.embedPng(qrImageBytes);

            const qrSize = 45;
            const stampWidth = 95;
            const stampHeight = 95;
            const stampGap = 10;
            const marginBottom = 12;
            const marginRight = 12;

            const maxStampsPerRow = Math.floor(
                (width - 2 * marginRight) / (stampWidth + stampGap)
            );
            const row = Math.floor(sigIndex / maxStampsPerRow);
            const col = sigIndex % maxStampsPerRow;

            const finalX =
                width -
                marginRight -
                stampWidth -
                col * (stampWidth + stampGap);
            const finalY = marginBottom + row * (stampHeight + stampGap);

            lastPage.drawRectangle({
                x: finalX,
                y: finalY,
                width: stampWidth,
                height: stampHeight,
                borderColor: rgb(0.2, 0.5, 0.8),
                borderWidth: 1,
                color: rgb(0.97, 0.98, 1),
                opacity: 0.95,
            });

            lastPage.drawImage(qrImage, {
                x: finalX + (stampWidth - qrSize) / 2,
                y: finalY + stampHeight - qrSize - 5,
                width: qrSize,
                height: qrSize,
            });

            const centerX = finalX + stampWidth / 2;

            const shortName = formatShortName(userDisplayName);
            const nameWidth = fontBold.widthOfTextAtSize(shortName, 6);
            lastPage.drawText(shortName, {
                x: centerX - nameWidth / 2,
                y: finalY + 32,
                size: 6,
                font: fontBold,
                color: rgb(0.1, 0.1, 0.1),
            });

            if (certData.iin) {
                const iinText = `ИИН: ${certData.iin}`;
                const iinWidth = font.widthOfTextAtSize(iinText, 5);
                lastPage.drawText(iinText, {
                    x: centerX - iinWidth / 2,
                    y: finalY + 22,
                    size: 5,
                    font,
                    color: rgb(0.3, 0.3, 0.3),
                });
            }

            const now = new Date();
            const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(
                now.getMonth() + 1
            ).padStart(2, "0")}.${now.getFullYear()}`;
            const dateWidth = font.widthOfTextAtSize(dateStr, 5);
            lastPage.drawText(dateStr, {
                x: centerX - dateWidth / 2,
                y: finalY + 13,
                size: 5,
                font,
                color: rgb(0.3, 0.3, 0.3),
            });

            const edsText = "ЭЦП подтверждена";
            const edsWidth = font.widthOfTextAtSize(edsText, 4);
            lastPage.drawText(edsText, {
                x: centerX - edsWidth / 2,
                y: finalY + 4,
                size: 4,
                font,
                color: rgb(0, 0.5, 0),
            });

            return await pdfDoc.save();
        } catch (e) {
            console.error("Ошибка создания PDF:", e);
            throw e;
        }
    };

    const processSignedDocument = async (docIndex, signature) => {
        const doc = documents[docIndex];
        const fileData = documentFiles.find((f) => f.docId === doc.id);

        const parsed = parseCertFromSignature(signature);
        const certData = {
            name: parsed.name || "ЭЦП",
            iin: parsed.iin || "",
            timestamp: new Date().toISOString(),
        };

        if (!certInfo) {
            setCertInfo(certData);
        }

        let cleanBase64 = signature.replace(/[\r\n\s]/g, "");
        while (cleanBase64.length % 4 !== 0) cleanBase64 += "=";
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const cmsBlob = new Blob([bytes], {
            type: "application/pkcs7-signature",
        });

        const sigIndex = doc.signatureHistory?.length || 0;
        const pdfWithQR = await createSignedPdfWithQR(
            fileData.uint8Array.slice(),
            signature,
            certData,
            sigIndex
        );
        const signedPdfBlob = new Blob([pdfWithQR], {
            type: "application/pdf",
        });

        const uploadedFile = await uploadFile(signedPdfBlob);

        const cmsFileNameGenerated = `${doc.title}_${
            currentUser.username
        }_${Date.now()}.cms`;
        const cmsFileObj = new File([cmsBlob], cmsFileNameGenerated, {
            type: "application/pkcs7-signature",
        });
        const uploadedCmsFile = await uploadFile(cmsFileObj);
        const cmsFileUrl = uploadedCmsFile?.url || null;
        const cmsFileName = uploadedCmsFile?.name || cmsFileNameGenerated;

        const updatedSigners = doc.signers.map((s) => {
            if (s.userId === currentUser.id) {
                return {
                    ...s,
                    status: "signed",
                    role: certData.name || "Подписант",
                    signedAt: new Date().toISOString(),
                };
            }
            return s;
        });

        const updatedHistory = [
            ...(doc.signatureHistory || []),
            {
                userId: currentUser.id,
                userName: currentUser.fullName || currentUser.username,
                role: certData.name || "Подписант",
                signedAt: new Date().toISOString(),
                signatureType: "eds",
                cmsFileUrl,
                cmsFileName,
                iin: certData.iin || null,
            },
        ];

        const allSigned = updatedSigners.every((s) => s.status === "signed");
        const newStatus = allSigned ? "completed" : "in_progress";

        await updateDocument(doc.documentId, {
            currentFile: uploadedFile.id,
            signers: updatedSigners,
            signatureHistory: updatedHistory,
            status: newStatus,
        });

        return certData;
    };

    const startBatchSigning = () => {
        if (!fontsLoaded) {
            toast.warning("Шрифты ещё загружаются...");
            return;
        }

        setStatus("signing");
        setCurrentSigningIndex(0);
        setSignedCount(0);
        setErrorMessage("");
        setStatusMessage("Подключение к NCALayer...");

        const ws = new WebSocket(NCA_LAYER_URL);
        let docIndex = 0;
        let isFirstSignature = true;
        let isProcessing = false;

        ws.onopen = () => {
            setStatusMessage("Выберите сертификат и введите пароль...");

            const firstFile = documentFiles[0];
            if (firstFile) {
                setCurrentSigningIndex(0);
                const request = {
                    module: "kz.gov.pki.knca.commonUtils",
                    method: "createCMSSignatureFromBase64",
                    args: ["PKCS12", "SIGNATURE", firstFile.base64, true],
                };
                ws.send(JSON.stringify(request));
            }
        };

        ws.onmessage = async (event) => {
            if (isProcessing) return;

            try {
                const response = JSON.parse(event.data);

                if (response.result?.version) return;

                const signature = response.responseObject || response.result;
                const hasSignature =
                    signature &&
                    typeof signature === "string" &&
                    signature.length > 500;

                if (response.code === "200" && hasSignature) {
                    isProcessing = true;

                    if (isFirstSignature) {
                        isFirstSignature = false;
                        setStatusMessage(
                            `Подписание документа 1 из ${documentFiles.length}...`
                        );
                    }

                    try {
                        await processSignedDocument(docIndex, signature);

                        docIndex++;
                        setSignedCount(docIndex);

                        if (docIndex < documentFiles.length) {
                            setCurrentSigningIndex(docIndex);
                            setStatusMessage(
                                `Подписание документа ${docIndex + 1} из ${
                                    documentFiles.length
                                }...`
                            );

                            const nextFile = documentFiles[docIndex];
                            const request = {
                                module: "kz.gov.pki.knca.commonUtils",
                                method: "createCMSSignatureFromBase64",
                                args: [
                                    "PKCS12",
                                    "SIGNATURE",
                                    nextFile.base64,
                                    true,
                                ],
                            };

                            isProcessing = false;
                            ws.send(JSON.stringify(request));
                        } else {
                            ws.close();
                            setStatus("complete");
                            setIsComplete(true);
                            toast.success(
                                `Успешно подписано ${documents.length} документов`
                            );
                        }
                    } catch (err) {
                        console.error(
                            `Ошибка обработки документа ${docIndex}:`,
                            err
                        );
                        isProcessing = false;

                        docIndex++;
                        if (docIndex < documentFiles.length) {
                            setCurrentSigningIndex(docIndex);
                            setStatusMessage(
                                `Пропуск ошибочного документа, подписание ${
                                    docIndex + 1
                                }...`
                            );

                            const nextFile = documentFiles[docIndex];
                            const request = {
                                module: "kz.gov.pki.knca.commonUtils",
                                method: "createCMSSignatureFromBase64",
                                args: [
                                    "PKCS12",
                                    "SIGNATURE",
                                    nextFile.base64,
                                    true,
                                ],
                            };
                            ws.send(JSON.stringify(request));
                        } else {
                            ws.close();
                            if (signedCount > 0) {
                                setStatus("complete");
                                setIsComplete(true);
                                toast.warning(
                                    `Подписано ${signedCount} из ${documents.length} документов`
                                );
                            } else {
                                setStatus("error");
                                setErrorMessage(
                                    "Не удалось подписать документы"
                                );
                            }
                        }
                    }
                } else if (response.code === "500") {
                    ws.close();
                    setStatus("error");

                    let errorMsg = response.message || "Ошибка подписания";
                    if (
                        errorMsg.includes("canceled") ||
                        errorMsg.includes("отмен")
                    ) {
                        errorMsg = "Подписание отменено пользователем";
                    } else if (
                        errorMsg.includes("password") ||
                        errorMsg.includes("пароль")
                    ) {
                        errorMsg = "Неверный пароль от ЭЦП";
                    } else if (
                        errorMsg.includes("certificate") ||
                        errorMsg.includes("сертификат")
                    ) {
                        errorMsg = "Проблема с сертификатом ЭЦП";
                    }

                    setErrorMessage(errorMsg);

                    if (signedCount > 0) {
                        toast.warning(
                            `Подписано ${signedCount} из ${documents.length} документов до ошибки`
                        );
                    }
                }
            } catch (e) {
                console.error("Ошибка обработки ответа:", e);
                isProcessing = false;
                setStatus("error");
                setErrorMessage("Ошибка обработки ответа от NCALayer");
            }
        };

        ws.onerror = () => {
            setStatus("error");
            setErrorMessage(
                "Не удалось подключиться к NCALayer. Убедитесь, что NCALayer запущен."
            );
        };

        ws.onclose = () => {
            if (
                status === "signing" &&
                docIndex < documentFiles.length &&
                !isProcessing
            ) {
                if (signedCount > 0) {
                    setStatus("complete");
                    setIsComplete(true);
                    toast.warning(
                        `Подписано ${signedCount} из ${documents.length} документов`
                    );
                }
            }
        };
    };

    if (loading) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center'>
                <div className='text-center'>
                    <Loader2 className='w-12 h-12 text-indigo-600 animate-spin mx-auto' />
                    <p className='mt-4 text-gray-600'>Загрузка документов...</p>
                </div>
            </div>
        );
    }

    if (isComplete) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4'>
                <div className='bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center'>
                    <div className='w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6'>
                        <CheckCircle className='w-10 h-10 text-green-600' />
                    </div>
                    <h1 className='text-2xl font-bold text-gray-800 mb-2'>
                        Все документы подписаны!
                    </h1>
                    <p className='text-gray-600 mb-6'>
                        Успешно подписано: {documents.length} документов
                    </p>
                    {certInfo && (
                        <div className='mb-6 p-3 bg-gray-50 rounded-lg text-sm text-left'>
                            <p className='text-gray-600'>
                                <strong>Подписант:</strong> {certInfo.name}
                            </p>
                            {certInfo.iin && (
                                <p className='text-gray-600'>
                                    <strong>ИИН:</strong> {certInfo.iin}
                                </p>
                            )}
                        </div>
                    )}
                    <div className='space-y-2 mb-6 max-h-40 overflow-y-auto'>
                        {documents.map((doc) => (
                            <div
                                key={doc.id}
                                className='flex items-center gap-2 p-2 bg-green-50 rounded-lg text-sm'>
                                <CheckCircle className='w-4 h-4 text-green-600 flex-shrink-0' />
                                <span className='text-green-800 truncate'>
                                    {doc.title}
                                </span>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => navigate("/documents/pending")}
                        className='w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors'>
                        Вернуться к документам
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
            <div className='max-w-4xl mx-auto'>
                <button
                    onClick={() => navigate("/documents/pending")}
                    className='mb-4 flex items-center gap-2 text-indigo-600 hover:text-indigo-700'>
                    <ArrowLeft className='w-5 h-5' />
                    Назад к документам
                </button>

                <div className='bg-white rounded-2xl shadow-xl p-8'>
                    <div className='flex items-center gap-3 mb-6'>
                        <Shield className='w-10 h-10 text-indigo-600' />
                        <div>
                            <h1 className='text-2xl font-bold text-gray-800'>
                                Массовое подписание через ЭЦП
                            </h1>
                            <p className='text-gray-600'>
                                {documents.length} документов для подписания
                            </p>
                        </div>
                    </div>

                    {certInfo && (
                        <div className='mb-4 p-3 bg-green-50 border border-green-200 rounded-lg'>
                            <p className='text-sm text-green-800'>
                                <strong>Подписант:</strong> {certInfo.name}
                                {certInfo.iin && (
                                    <span className='ml-3'>
                                        <strong>ИИН:</strong> {certInfo.iin}
                                    </span>
                                )}
                            </p>
                        </div>
                    )}

                    {status === "signing" && (
                        <div className='mb-6'>
                            <div className='flex items-center justify-between mb-2'>
                                <span className='text-sm font-medium text-gray-700'>
                                    {statusMessage}
                                </span>
                                <span className='text-sm text-gray-600'>
                                    {signedCount} / {documents.length}
                                </span>
                            </div>
                            <div className='w-full h-3 bg-gray-200 rounded-full overflow-hidden'>
                                <div
                                    className='h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-300'
                                    style={{
                                        width: `${
                                            (signedCount / documents.length) *
                                            100
                                        }%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    <div className='mb-6 max-h-64 overflow-y-auto space-y-2'>
                        {documents.map((doc, index) => (
                            <div
                                key={doc.id}
                                className={`flex items-center gap-3 p-3 rounded-lg text-sm transition-all ${
                                    index < signedCount
                                        ? "bg-green-50 text-green-800"
                                        : index === currentSigningIndex &&
                                          status === "signing"
                                        ? "bg-indigo-50 text-indigo-800 ring-2 ring-indigo-300"
                                        : "bg-gray-50 text-gray-600"
                                }`}>
                                {index < signedCount ? (
                                    <CheckCircle className='w-5 h-5 text-green-600 flex-shrink-0' />
                                ) : index === currentSigningIndex &&
                                  status === "signing" ? (
                                    <Loader2 className='w-5 h-5 text-indigo-600 animate-spin flex-shrink-0' />
                                ) : (
                                    <FileText className='w-5 h-5 text-gray-400 flex-shrink-0' />
                                )}
                                <span className='truncate font-medium'>
                                    {doc.title}
                                </span>
                                {index < signedCount && (
                                    <span className='ml-auto text-xs text-green-600'>
                                        ✓
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {status === "error" && (
                        <div className='mb-6 p-4 bg-red-50 border border-red-200 rounded-lg'>
                            <div className='flex items-center gap-2 text-red-800'>
                                <XCircle className='w-5 h-5' />
                                <span className='font-medium'>
                                    {errorMessage}
                                </span>
                            </div>
                            {signedCount > 0 && (
                                <p className='text-sm text-red-600 mt-2'>
                                    Подписано до ошибки: {signedCount} из{" "}
                                    {documents.length}
                                </p>
                            )}
                        </div>
                    )}

                    {status === "ready" && (
                        <>
                            <div className='mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl'>
                                <div className='flex items-start gap-3'>
                                    <Shield className='w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5' />
                                    <div>
                                        <h3 className='font-semibold text-blue-800 mb-1'>
                                            Один пароль — все документы
                                        </h3>
                                        <p className='text-sm text-blue-700'>
                                            Введите пароль от ЭЦП один раз, и
                                            все {documents.length} документов
                                            будут подписаны автоматически.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={startBatchSigning}
                                disabled={!fontsLoaded}
                                className={`w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-3 text-lg transition-colors ${
                                    !fontsLoaded
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                }`}>
                                <Play className='w-6 h-6' />
                                Подписать все документы ({documents.length})
                            </button>
                        </>
                    )}

                    {status === "signing" && signedCount === 0 && (
                        <div className='text-center py-4'>
                            <Loader2 className='w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2' />
                            <p className='text-gray-600'>{statusMessage}</p>
                        </div>
                    )}

                    {status === "error" && (
                        <div className='flex gap-3'>
                            <button
                                onClick={() => navigate("/documents/pending")}
                                className='flex-1 py-3 px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold'>
                                Назад
                            </button>
                            <button
                                onClick={() => {
                                    setStatus("ready");
                                    setErrorMessage("");
                                    setSignedCount(0);
                                    setCurrentSigningIndex(-1);
                                }}
                                className='flex-1 py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold'>
                                Попробовать снова
                            </button>
                        </div>
                    )}

                    {status === "ready" && (
                        <div className='mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg'>
                            <p className='text-sm text-yellow-800'>
                                <strong>Требования:</strong> NCALayer должен
                                быть установлен и запущен.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
