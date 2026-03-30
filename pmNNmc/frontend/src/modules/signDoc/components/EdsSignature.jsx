import React, { useState, useCallback, useRef } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { Shield, CheckCircle, Download, Loader2 } from "lucide-react";

const NCA_LAYER_URL = "wss://127.0.0.1:13579/";

// URL шрифта с поддержкой кириллицы (Google Fonts Roboto)
const FONT_URL =
    "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf";
const FONT_BOLD_URL =
    "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAw.ttf";

// Получаем ФИО из localStorage (signdoc-specific)
const getUserFullName = () => {
    const user = localStorage.getItem("signdoc_user");
    if (user) {
        const userData = JSON.parse(user);
        return userData.fullName || userData.username || "";
    }
    return "";
};

// Форматируем ФИО в короткий формат: Фамилия И.О.
const formatShortName = (fullName) => {
    if (!fullName) return "";

    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 1) {
        return parts[0];
    }

    if (parts.length === 2) {
        return `${parts[0]} ${parts[1].charAt(0)}.`;
    }

    if (parts.length >= 3) {
        return `${parts[0]} ${parts[1].charAt(0)}.${parts[2].charAt(0)}.`;
    }

    return fullName;
};

export default function EdsSignature({
    file,
    fileUrl,
    onSignatureComplete,
    isCreatingDocument = false,
    isSigningDocument = false,
    signatureIndex = 0,
    sourceIndex = null,
    userFullName = null,
    keepNcaSession = false,
    autoStartSigning = false,
    autoCompleteOnSign = false,
}) {
    const [status, setStatus] = useState("idle");
    const [message, setMessage] = useState("");
    const [signedData, setSignedData] = useState(null);
    const [signedPdfBytes, setSignedPdfBytes] = useState(null);
    const [certInfo, setCertInfo] = useState(null);
    const [cmsBlob, setCmsBlob] = useState(null);
    const [pdfData, setPdfData] = useState(null);
    const [signedMeta, setSignedMeta] = useState(null);
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [fontBytes, setFontBytes] = useState(null);
    const [fontBoldBytes, setFontBoldBytes] = useState(null);
    const wsRef = useRef(null);
    const autoStartedRef = useRef(false);
    const autoCompletedRef = useRef(false);

    const displayFullName = userFullName || getUserFullName();

    const resetSigningState = useCallback((closeConnection = true) => {
        if (
            closeConnection &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
        ) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setStatus("idle");
        setMessage("");
        setSignedData(null);
        setSignedPdfBytes(null);
        setCertInfo(null);
        setCmsBlob(null);
        setPdfData(null);
        setSignedMeta(null);
        autoStartedRef.current = false;
        autoCompletedRef.current = false;
    }, []);

    // Загружаем шрифты при монтировании
    React.useEffect(() => {
        loadFonts();
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
            try {
                const altFontUrl =
                    "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/cyrillic-400-normal.ttf";
                const altBoldUrl =
                    "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/cyrillic-700-normal.ttf";

                const [regularResponse, boldResponse] = await Promise.all([
                    fetch(altFontUrl),
                    fetch(altBoldUrl),
                ]);

                const [regularBytes, boldBytes] = await Promise.all([
                    regularResponse.arrayBuffer(),
                    boldResponse.arrayBuffer(),
                ]);

                setFontBytes(regularBytes);
                setFontBoldBytes(boldBytes);
                setFontsLoaded(true);
            } catch (e) {
                console.error("Ошибка загрузки альтернативных шрифтов:", e);
            }
        }
    };

    React.useEffect(() => {
        resetSigningState(!keepNcaSession);

        if (file) {
            loadFile(file);
        } else if (fileUrl) {
            loadFileFromUrl(fileUrl);
        }
    }, [file, fileUrl, keepNcaSession, resetSigningState]);

    React.useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, []);

    const loadFile = async (uploadedFile) => {
        try {
            const arrayBuffer = await uploadedFile.arrayBuffer();
            setPdfData({
                arrayBuffer,
                base64: arrayBufferToBase64(arrayBuffer),
                name: uploadedFile.name,
            });
        } catch (error) {
            console.error("Ошибка загрузки файла:", error);
            setMessage("Ошибка загрузки файла");
        }
    };

    const loadFileFromUrl = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            setPdfData({
                arrayBuffer,
                base64: arrayBufferToBase64(arrayBuffer),
                name: "document.pdf",
            });
        } catch (error) {
            console.error("Ошибка загрузки файла:", error);
            setMessage("Ошибка загрузки файла");
        }
    };

    const arrayBufferToBase64 = (buffer) => {
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };

    const parseCertFromSignature = (signature) => {
        try {
            const binaryString = atob(signature);

            // Декодирование UTF-8 из Latin-1 строки (результат atob)
            const decodeUtf8 = (raw) => {
                try {
                    return decodeURIComponent(
                        raw
                            .split("")
                            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                            .join("")
                    );
                } catch {
                    return raw;
                }
            };

            // Парсинг полей сертификата по ASN.1 OID-байтам.
            // DER формат: OID = 06 03 55 04 XX, затем строка: тег + длина + значение.
            // Возвращает ВСЕ найденные значения (в CMS несколько сертификатов).
            const extractAllDerValues = (oidLastByte) => {
                const oidTag = String.fromCharCode(0x06, 0x03, 0x55, 0x04, oidLastByte);
                const results = [];
                let idx = binaryString.indexOf(oidTag);
                while (idx !== -1) {
                    const afterOid = idx + oidTag.length;
                    if (afterOid + 2 <= binaryString.length) {
                        const tag = binaryString.charCodeAt(afterOid);
                        const len = binaryString.charCodeAt(afterOid + 1);
                        if ((tag === 0x0c || tag === 0x13 || tag === 0x16) && len > 0 && len < 200) {
                            const raw = binaryString.substring(afterOid + 2, afterOid + 2 + len);
                            const decoded = tag === 0x0c ? decodeUtf8(raw) : raw;
                            if (decoded && !results.includes(decoded)) {
                                results.push(decoded);
                            }
                        }
                    }
                    idx = binaryString.indexOf(oidTag, idx + 1);
                }
                return results;
            };

            // OID последние байты: CN=0x03, SURNAME=0x04, SERIALNUMBER=0x05, GIVENNAME=0x2A
            const allCn = extractAllDerValues(0x03);
            const allSurname = extractAllDerValues(0x04);
            const allSerial = extractAllDerValues(0x05);
            const allGivenName = extractAllDerValues(0x2a);

            // Фамилия — первое значение SURNAME
            const surname = allSurname[0] || "";
            const givenName = allGivenName[0] || "";

            // ИИН — из SERIALNUMBER
            let iin = "";
            for (const sn of allSerial) {
                const m = sn.match(/IIN(\d{12})/i);
                if (m) { iin = m[1]; break; }
            }
            if (!iin) {
                const iinMatch = binaryString.match(/IIN(\d{12})/i);
                if (iinMatch) iin = iinMatch[1];
            }

            // CN подписанта содержит "ФАМИЛИЯ ИМЯ", ищем по совпадению с фамилией
            let personCn = "";
            if (surname) {
                personCn = allCn.find((cn) => cn.toUpperCase().includes(surname.toUpperCase())) || "";
            }

            // Собираем полное ФИО: CN (Фамилия Имя) + GIVENNAME (Отчество)
            let name = "";
            if (personCn) {
                name = personCn;
                // Добавляем отчество если оно не входит в CN
                if (givenName && !personCn.toUpperCase().includes(givenName.toUpperCase())) {
                    name = name + " " + givenName;
                }
            } else if (surname || givenName) {
                name = [surname, givenName].filter(Boolean).join(" ");
            }

            return { name, iin };
        } catch (e) {
            console.error("Ошибка парсинга сертификата:", e);
            return { name: "", iin: "" };
        }
    };

    const createSignedPdfWithQR = async (
        originalBytes,
        signature,
        certData,
        sigIndex,
        userDisplayName
    ) => {
        try {
            const pdfDoc = await PDFDocument.load(originalBytes);
            pdfDoc.registerFontkit(fontkit);

            let font, fontBold;

            if (fontBytes && fontBoldBytes) {
                font = await pdfDoc.embedFont(fontBytes);
                fontBold = await pdfDoc.embedFont(fontBoldBytes);
            } else {
                throw new Error("Шрифты не загружены");
            }

            const pages = pdfDoc.getPages();
            const lastPage = pages[pages.length - 1];
            const { width, height } = lastPage.getSize();

            // QR данные
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

            // Размеры штампа
            const qrSize = 45;
            const stampWidth = 95;
            const stampHeight = 95;
            const stampGap = 10;
            const marginBottom = 12;
            const marginRight = 12;

            // Вычисляем позицию штампа
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

            // Рамка штампа
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

            // QR-код (сверху)
            lastPage.drawImage(qrImage, {
                x: finalX + (stampWidth - qrSize) / 2,
                y: finalY + stampHeight - qrSize - 5,
                width: qrSize,
                height: qrSize,
            });

            const centerX = finalX + stampWidth / 2;

            // ФИО из сертификата ЭЦП (или fallback на имя из базы)
            const shortName = formatShortName(certData.name || userDisplayName);
            const nameWidth = fontBold.widthOfTextAtSize(shortName, 6);
            lastPage.drawText(shortName, {
                x: centerX - nameWidth / 2,
                y: finalY + 32,
                size: 6,
                font: fontBold,
                color: rgb(0.1, 0.1, 0.1),
            });

            // ИИН
            if (certData.iin) {
                const iinText = `ИИН: ${certData.iin}`;
                const iinWidth = font.widthOfTextAtSize(iinText, 5);
                lastPage.drawText(iinText, {
                    x: centerX - iinWidth / 2,
                    y: finalY + 22,
                    size: 5,
                    font: font,
                    color: rgb(0.3, 0.3, 0.3),
                });
            }

            // Дата
            const now = new Date();
            const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(
                now.getMonth() + 1
            ).padStart(2, "0")}.${now.getFullYear()}`;
            const dateWidth = font.widthOfTextAtSize(dateStr, 5);
            lastPage.drawText(dateStr, {
                x: centerX - dateWidth / 2,
                y: finalY + 13,
                size: 5,
                font: font,
                color: rgb(0.3, 0.3, 0.3),
            });

            // ЭЦП подтверждена
            const edsText = "ЭЦП подтверждена";
            const edsWidth = font.widthOfTextAtSize(edsText, 4);
            lastPage.drawText(edsText, {
                x: centerX - edsWidth / 2,
                y: finalY + 4,
                size: 4,
                font: font,
                color: rgb(0, 0.5, 0),
            });

            return await pdfDoc.save();
        } catch (e) {
            console.error("Ошибка создания PDF:", e);
            throw e;
        }
    };

    const signDocument = useCallback(async () => {
        if (!pdfData) {
            setMessage("Файл не загружен");
            return;
        }

        if (!fontsLoaded) {
            setMessage("Шрифты ещё загружаются, подождите...");
            return;
        }

        setStatus("signing");
        setMessage("Подключение к NCALayer...");

        try {
            const requestSourceIndex = sourceIndex;
            const requestFileName = pdfData?.name || null;

            const sendSignRequest = (ws) => {
                setMessage("Выберите сертификат в окне NCALayer...");
                const request = {
                    module: "kz.gov.pki.knca.commonUtils",
                    method: "createCMSSignatureFromBase64",
                    args: ["PKCS12", "SIGNATURE", pdfData.base64, true],
                };
                ws.send(JSON.stringify(request));
            };

            const bindHandlers = (
                ws,
                signedSourceIndex,
                signedSourceFileName
            ) => {
                ws.onmessage = async (event) => {
                    try {
                        const response = JSON.parse(event.data);

                        if (response.result?.version) return;

                        const signature =
                            response.responseObject || response.result;
                        const hasSignature =
                            signature &&
                            typeof signature === "string" &&
                            signature.length > 500;

                        if (response.code === "200" && hasSignature) {
                            setSignedData(signature);

                            const parsed = parseCertFromSignature(signature);

                            const certData = {
                                name: parsed.name || "ЭЦП",
                                iin: parsed.iin || "",
                                date: new Date().toLocaleString("ru-RU"),
                                timestamp: new Date().toISOString(),
                            };

                            setCertInfo(certData);
                            setSignedMeta({
                                sourceIndex: signedSourceIndex,
                                sourceFileName: signedSourceFileName,
                            });

                            // Создаём CMS blob
                            let cleanBase64 = signature.replace(
                                /[\r\n\s]/g,
                                ""
                            );
                            while (cleanBase64.length % 4 !== 0)
                                cleanBase64 += "=";
                            const binaryString = atob(cleanBase64);
                            const bytes = new Uint8Array(
                                binaryString.length
                            );
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }
                            const cmsFile = new Blob([bytes], {
                                type: "application/pkcs7-signature",
                            });
                            setCmsBlob(cmsFile);

                            try {
                                setMessage("Создание PDF с QR-кодом...");
                                const pdfWithQR = await createSignedPdfWithQR(
                                    pdfData.arrayBuffer,
                                    signature,
                                    certData,
                                    signatureIndex,
                                    displayFullName
                                );
                                setSignedPdfBytes(pdfWithQR);
                                setStatus("signed");
                                setMessage("Документ успешно подписан!");
                            } catch (e) {
                                console.error("Ошибка PDF", e);
                                setSignedPdfBytes(
                                    new Uint8Array(pdfData.arrayBuffer)
                                );
                                setStatus("signed");
                                setMessage(
                                    "Документ подписан (без визуального штампа)"
                                );
                            }
                        } else if (response.code === "500") {
                            setStatus("error");
                            setMessage("Ошибка: " + response.message);
                            if (!keepNcaSession && wsRef.current) {
                                wsRef.current.close();
                                wsRef.current = null;
                            }
                        }
                    } catch (e) {
                        console.error("Ошибка", e);
                    }
                };

                ws.onerror = () => {
                    setStatus("error");
                    setMessage(
                        "Не удалось подключиться к NCALayer. Убедитесь, что NCALayer запущен."
                    );
                    if (!keepNcaSession) {
                        wsRef.current = null;
                    }
                };

                ws.onclose = () => {
                    wsRef.current = null;
                };
            };

            const existingWs = wsRef.current;
            if (existingWs && existingWs.readyState === WebSocket.OPEN) {
                bindHandlers(existingWs, requestSourceIndex, requestFileName);
                sendSignRequest(existingWs);
                return;
            }

            const ws = new WebSocket(NCA_LAYER_URL);
            wsRef.current = ws;
            bindHandlers(ws, requestSourceIndex, requestFileName);

            ws.onopen = () => {
                sendSignRequest(ws);
            };
        } catch (error) {
            setStatus("error");
            setMessage(error.message);
        }
    }, [
        pdfData,
        signatureIndex,
        displayFullName,
        fontsLoaded,
        fontBytes,
        fontBoldBytes,
        keepNcaSession,
        sourceIndex,
    ]);

    const handleComplete = useCallback(async () => {
        if (!signedPdfBytes || !cmsBlob || !signedMeta) return;

        const signedPdfBlob = new Blob([signedPdfBytes], {
            type: "application/pdf",
        });

        if (onSignatureComplete) {
            onSignatureComplete(signedPdfBlob, cmsBlob, {
                type: "eds",
                name: certInfo?.name || "",
                fullName: displayFullName,
                iin: certInfo?.iin || "",
                date: certInfo?.date || new Date().toLocaleString("ru-RU"),
                timestamp: certInfo?.timestamp || new Date().toISOString(),
                sourceIndex: signedMeta.sourceIndex,
                sourceFileName: signedMeta.sourceFileName,
            });
        }
    }, [
        signedPdfBytes,
        cmsBlob,
        signedMeta,
        onSignatureComplete,
        certInfo,
        displayFullName,
    ]);

    React.useEffect(() => {
        if (!autoStartSigning) return;
        if (!pdfData || !fontsLoaded) return;
        if (status !== "idle") return;
        if (autoStartedRef.current) return;

        autoStartedRef.current = true;
        signDocument();
    }, [autoStartSigning, pdfData, fontsLoaded, status, signDocument]);

    React.useEffect(() => {
        if (!autoCompleteOnSign) return;
        if (status !== "signed") return;
        if (!signedPdfBytes || !cmsBlob || !signedMeta) return;
        if (autoCompletedRef.current) return;

        autoCompletedRef.current = true;
        handleComplete();
    }, [
        autoCompleteOnSign,
        status,
        signedPdfBytes,
        cmsBlob,
        signedMeta,
        handleComplete,
    ]);

    const downloadPdf = () => {
        if (!signedPdfBytes) return;
        const blob = new Blob([signedPdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `подписанный_${pdfData?.name || "документ.pdf"}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadCms = () => {
        if (!cmsBlob) return;
        const url = URL.createObjectURL(cmsBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${
            pdfData?.name?.replace(".pdf", "") || "документ"
        }_подпись.cms`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className='bg-indigo-50 rounded-xl p-6'>
            <div className='flex items-center gap-3 mb-6'>
                <Shield className='w-8 h-8 text-indigo-600' />
                <div>
                    <h2 className='text-xl font-semibold text-gray-800'>
                        Подписание через ЭЦП
                    </h2>
                    <p className='text-sm text-gray-600'>
                        Электронная цифровая подпись NCALayer
                    </p>
                </div>
            </div>

            {/* Показываем кто подписывает */}
            {displayFullName && (
                <div className='mb-4 p-3 bg-white rounded-lg border border-gray-200'>
                    <p className='text-sm text-gray-600'>Подписант:</p>
                    <p className='font-medium text-gray-800'>
                        {displayFullName}
                    </p>
                </div>
            )}

            {/* Индикатор загрузки шрифтов */}
            {!fontsLoaded && (
                <div className='mb-4 p-3 bg-blue-50 rounded-lg flex items-center gap-2'>
                    <Loader2 className='w-4 h-4 animate-spin text-blue-600' />
                    <p className='text-sm text-blue-800'>Загрузка шрифтов...</p>
                </div>
            )}

            {message && (
                <div
                    className={`p-4 rounded-lg mb-4 ${
                        status === "error"
                            ? "bg-red-100 text-red-800"
                            : status === "signed"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                    }`}>
                    {message}
                </div>
            )}

            {certInfo && status === "signed" && (
                <div className='bg-green-50 border border-green-200 rounded-lg p-4 mb-4'>
                    <h4 className='font-semibold text-green-800 mb-2'>
                        ✓ Подписано:
                    </h4>
                    <p className='font-medium text-gray-800'>
                        {displayFullName || certInfo.name}
                    </p>
                    {certInfo.iin && (
                        <p className='text-sm text-gray-600'>
                            ИИН: {certInfo.iin}
                        </p>
                    )}
                    <p className='text-sm text-gray-600'>{certInfo.date}</p>
                </div>
            )}

            <div className='space-y-4'>
                {status !== "signed" && (
                    <button
                        onClick={signDocument}
                        disabled={
                            !pdfData || status === "signing" || !fontsLoaded
                        }
                        className={`w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                            !pdfData || status === "signing" || !fontsLoaded
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}>
                        {status === "signing" ? (
                            <>
                                <Loader2 className='w-5 h-5 animate-spin' />
                                Ожидание ЭЦП...
                            </>
                        ) : (
                            <>
                                <Shield className='w-5 h-5' />
                                Подписать через ЭЦП
                            </>
                        )}
                    </button>
                )}

                {status === "signed" && (
                    <>
                        {!(isCreatingDocument || isSigningDocument) && (
                            <div className='flex gap-2'>
                                <button
                                    onClick={downloadPdf}
                                    className='flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center justify-center gap-2'>
                                    <Download className='w-4 h-4' />
                                    PDF с QR
                                </button>
                                <button
                                    onClick={downloadCms}
                                    className='flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2'>
                                    <Download className='w-4 h-4' />
                                    CMS
                                </button>
                            </div>
                        )}

                        {(isCreatingDocument || isSigningDocument) && (
                            <button
                                onClick={handleComplete}
                                className='w-full py-3 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2'>
                                <CheckCircle className='w-5 h-5' />
                                Продолжить
                            </button>
                        )}
                    </>
                )}
            </div>

            <div className='mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg'>
                <p className='text-sm text-yellow-800'>
                    <strong>Требования:</strong> NCALayer должен быть установлен
                    и запущен на вашем компьютере.
                </p>
            </div>
        </div>
    );
}
