import React, { useState, useRef, useEffect } from "react";
import {
    Upload,
    FileText,
    CheckCircle,
    Download,
    Pen,
    Trash2,
    Search,
    Shield,
} from "lucide-react";
import EdsSignature from "./EdsSignature";
import { useToast } from "./Toast";

const getUserFullName = () => {
    const user = localStorage.getItem("signdoc_user");
    if (user) {
        const userData = JSON.parse(user);
        return userData.fullName || "";
    }
    return "";
};

export default function DocumentSignatureApp({
    preloadedFile = null,
    preloadedFileUrl = null,
    onSignatureComplete = null,
    isCreatingDocument = false,
    isSigningDocument = false,
    documentId = null,
    signatureType = null,
    signatureIndex = 0,
}) {
    const toast = useToast();
    const [file, setFile] = useState(null);
    const [pdfData, setPdfData] = useState(null);
    const [availableRoles, setAvailableRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [signed, setSigned] = useState(false);
    const [signatureData, setSignatureData] = useState({
        fullName: getUserFullName(),
        date: new Date().toLocaleDateString("ru-RU"),
    });
    const [isDrawing, setIsDrawing] = useState(false);
    const [signatureImage, setSignatureImage] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [selectedSignatureType, setSelectedSignatureType] =
        useState(signatureType);

    const canvasRef = useRef(null);
    const [ctx, setCtx] = useState(null);

    useEffect(() => {
        if (preloadedFile) {
            loadPreloadedFile(preloadedFile);
        } else if (preloadedFileUrl) {
            loadFileFromUrl(preloadedFileUrl);
        }
    }, [preloadedFile, preloadedFileUrl]);

    useEffect(() => {
        if (signatureType) {
            setSelectedSignatureType(signatureType);
        }
    }, [signatureType]);

    const loadPreloadedFile = async (uploadedFile) => {
        setFile(uploadedFile);
        setSigned(false);
        setSelectedRole(null);
        setAvailableRoles([]);
        clearSignature();

        try {
            const arrayBuffer = await uploadedFile.arrayBuffer();
            const pdfDataCopy = arrayBuffer.slice(0);
            setPdfData(pdfDataCopy);
            await scanPDFForRoles(arrayBuffer);
        } catch (error) {
            console.error("Ошибка при чтении документа:", error);
            toast.error("Ошибка при загрузке документа");
        }
    };

    const loadFileFromUrl = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const file = new File([blob], "document.pdf", {
                type: "application/pdf",
            });

            setFile(file);
            setSigned(false);
            setSelectedRole(null);
            setAvailableRoles([]);
            clearSignature();

            const arrayBuffer = await file.arrayBuffer();
            const pdfDataCopy = arrayBuffer.slice(0);
            setPdfData(pdfDataCopy);
            await scanPDFForRoles(arrayBuffer);
        } catch (error) {
            console.error("Ошибка загрузки файла по URL:", error);
            toast.error("Ошибка при загрузке документа");
        }
    };

    useEffect(() => {
        if (canvasRef.current) {
            const canvas = canvasRef.current;
            const context = canvas.getContext("2d");
            context.strokeStyle = "#0066CC";
            context.lineWidth = 2;
            context.lineCap = "round";
            context.lineJoin = "round";
            setCtx(context);
        }
    }, [canvasRef.current, selectedSignatureType]);

    const startDrawing = (e) => {
        if (!ctx || !canvasRef.current) return;
        setIsDrawing(true);
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing || !ctx || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (isDrawing && ctx) {
            setIsDrawing(false);
            ctx.closePath();
            const dataUrl = canvasRef.current.toDataURL("image/png");
            setSignatureImage(dataUrl);
        }
    };

    const clearSignature = () => {
        if (ctx && canvasRef.current) {
            ctx.clearRect(
                0,
                0,
                canvasRef.current.width,
                canvasRef.current.height
            );
            setSignatureImage(null);
        }
    };

    const scanPDFForRoles = async (arrayBuffer) => {
        setIsScanning(true);
        try {
            const pdfjsScript = document.createElement("script");
            pdfjsScript.src =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";

            await new Promise((resolve, reject) => {
                pdfjsScript.onload = resolve;
                pdfjsScript.onerror = reject;
                document.head.appendChild(pdfjsScript);
            });

            const pdfjsLib = window["pdfjs-dist/build/pdf"];
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            const roles = [];

            const page = await pdf.getPage(pdf.numPages);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1 });

            let fullText = "";
            const textItems = [];

            textContent.items.forEach((item) => {
                fullText += item.str + " ";
                textItems.push({
                    text: item.str,
                    x: item.transform[4],
                    y: viewport.height - item.transform[5],
                    height: item.height,
                });
            });

            const foundRoles = new Set();

            textItems.forEach((item, index) => {
                const text = item.text.trim();

                if (text.match(/:/)) {
                    const positionText = text.replace(":", "").trim();
                    const hasNumbers = /\d/.test(positionText);

                    const isRole =
                        !hasNumbers &&
                        (positionText.match(
                            /Руководитель|Директор|Главврач|Заведующий|Медсестра|Врач|Специалист|Менеджер|Начальник|отдел/i
                        ) ||
                            (positionText.length > 5 &&
                                positionText.length < 50));

                    if (isRole && !foundRoles.has(positionText)) {
                        foundRoles.add(positionText);

                        let signatureX = item.x + 300;
                        let signatureY = item.y;
                        let nameX = null;
                        let nameY = null;

                        const nextItems = textItems.slice(
                            index + 1,
                            index + 30
                        );
                        const signatureLabel = nextItems.find(
                            (i) =>
                                i.text.toLowerCase().includes("подпись") &&
                                !i.text.toLowerCase().includes("расшифров")
                        );

                        if (signatureLabel) {
                            signatureX = signatureLabel.x;
                            signatureY = signatureLabel.y - 5;

                            const signatureIdx =
                                nextItems.indexOf(signatureLabel);
                            const afterSignatureLabel = nextItems.slice(
                                signatureIdx + 1,
                                signatureIdx + 5
                            );
                            const underscoreAfter = afterSignatureLabel.find(
                                (i) => i.text.includes("_")
                            );

                            if (underscoreAfter) {
                                signatureX = underscoreAfter.x;
                                signatureY = underscoreAfter.y - 5;
                            }

                            const afterSignature = nextItems.slice(
                                signatureIdx + 1,
                                signatureIdx + 20
                            );

                            const nameLabel = afterSignature.find((i) =>
                                i.text.toLowerCase().includes("расшифров")
                            );

                            if (nameLabel) {
                                nameY = nameLabel.y - 5;

                                const nameLabelIdx =
                                    afterSignature.indexOf(nameLabel);
                                const afterNameLabel = afterSignature.slice(
                                    nameLabelIdx + 1,
                                    nameLabelIdx + 5
                                );
                                const underscoreAfterName = afterNameLabel.find(
                                    (i) => i.text.includes("_")
                                );

                                if (underscoreAfterName) {
                                    nameX = underscoreAfterName.x;
                                    nameY = underscoreAfterName.y - 5;
                                } else {
                                    nameX = nameLabel.x + 80;
                                }
                            } else {
                                const underscoresOnLine = afterSignature.filter(
                                    (i) =>
                                        i.text.includes("_") &&
                                        Math.abs(i.y - signatureY) < 15
                                );

                                if (underscoresOnLine.length > 0) {
                                    const lastUnderscore =
                                        underscoresOnLine[
                                            underscoresOnLine.length - 1
                                        ];
                                    nameX = lastUnderscore.x;
                                    nameY = lastUnderscore.y - 5;
                                }
                            }
                        }

                        if (nameX !== null && nameY !== null) {
                            roles.push({
                                position: positionText,
                                isStandardPosition: false,
                                coordinates: {
                                    nameX: nameX,
                                    nameY: nameY,
                                    signatureX: signatureX,
                                    signatureY: signatureY,
                                    pdfNameX: nameX,
                                    pdfNameY: viewport.height - nameY,
                                    pdfSignatureX: signatureX,
                                    pdfSignatureY: viewport.height - signatureY,
                                },
                            });
                        }
                    }
                }
            });

            if (roles.length === 0) {
                roles.push({
                    position: "Стандартная позиция внизу",
                    isStandardPosition: true,
                    coordinates: null, // Координаты будут вычисляться динамически
                });
            }

            setAvailableRoles(roles);
        } catch (error) {
            console.error("Ошибка при сканировании PDF:", error);
            setAvailableRoles([
                {
                    position: "Стандартная позиция внизу",
                    isStandardPosition: true,
                    coordinates: null,
                },
            ]);
        } finally {
            setIsScanning(false);
        }
    };

    const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;

        if (!uploadedFile.name.endsWith(".pdf")) {
            toast.warning("Пожалуйста, загрузите документ в формате .pdf");
            return;
        }

        setFile(uploadedFile);
        setSigned(false);
        setSelectedRole(null);
        setAvailableRoles([]);
        clearSignature();

        try {
            const arrayBuffer = await uploadedFile.arrayBuffer();
            const pdfDataCopy = arrayBuffer.slice(0);
            setPdfData(pdfDataCopy);
            await scanPDFForRoles(arrayBuffer);
        } catch (error) {
            console.error("Ошибка при чтении документа:", error);
            toast.error("Ошибка при загрузке документа");
        }
    };

    const handleSign = () => {
        if (!selectedRole) {
            toast.warning("Пожалуйста, выберите вашу должность");
            return;
        }

        if (!signatureData.fullName.trim()) {
            toast.warning("Пожалуйста, введите ФИО");
            return;
        }

        if (!signatureImage) {
            toast.warning("Пожалуйста, нарисуйте подпись");
            return;
        }

        setSigned(true);
    };

    const handleDownload = async () => {
        try {
            const { PDFDocument, rgb } = await import(
                "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm"
            );
            const fontkit = (
                await import(
                    "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/+esm"
                )
            ).default;

            const pdfDoc = await PDFDocument.load(pdfData);
            pdfDoc.registerFontkit(fontkit);

            const pages = pdfDoc.getPages();
            const lastPage = pages[pages.length - 1];
            const { width, height } = lastPage.getSize();

            // Загружаем шрифт для кириллицы
            let font;
            try {
                const fontUrl =
                    "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf";
                const fontResponse = await fetch(fontUrl);
                const fontBytes = await fontResponse.arrayBuffer();
                font = await pdfDoc.embedFont(fontBytes);
            } catch (e) {
                console.error("Ошибка загрузки шрифта:", e);
                font = null;
            }

            // Проверяем, это стандартная позиция или найденная роль
            if (selectedRole.isStandardPosition) {
                // === СТАНДАРТНАЯ ПОЗИЦИЯ ВНИЗУ ===
                // Структура: ФИО, Дата, Подпись — в ряд

                const blockWidth = 120;
                const blockHeight = 70;
                const blockGap = 20;
                const marginBottom = 30;
                const marginRight = 30;

                // Вычисляем позицию блока в зависимости от signatureIndex
                const maxBlocksPerRow = Math.floor(
                    (width - 2 * marginRight) / (blockWidth + blockGap)
                );
                const row = Math.floor(signatureIndex / maxBlocksPerRow);
                const col = signatureIndex % maxBlocksPerRow;

                const blockX =
                    width -
                    marginRight -
                    blockWidth -
                    col * (blockWidth + blockGap);
                const blockY = marginBottom + row * (blockHeight + blockGap);

                // Встраиваем подпись
                const signatureImageBytes = await fetch(signatureImage).then(
                    (res) => res.arrayBuffer()
                );
                const signatureImageEmbed = await pdfDoc.embedPng(
                    signatureImageBytes
                );
                const sigDims = signatureImageEmbed.scale(0.12);

                // Рисуем подпись
                lastPage.drawImage(signatureImageEmbed, {
                    x: blockX + (blockWidth - sigDims.width) / 2,
                    y: blockY + 5,
                    width: sigDims.width,
                    height: sigDims.height,
                });

                // ФИО (сверху)
                if (font) {
                    const nameText = signatureData.fullName;
                    const nameSize = 8;
                    const nameWidth = font.widthOfTextAtSize(
                        nameText,
                        nameSize
                    );
                    lastPage.drawText(nameText, {
                        x: blockX + (blockWidth - nameWidth) / 2,
                        y: blockY + blockHeight - 12,
                        size: nameSize,
                        font: font,
                        color: rgb(0, 0, 0),
                    });

                    // Дата (под ФИО)
                    const dateText = signatureData.date;
                    const dateSize = 7;
                    const dateWidth = font.widthOfTextAtSize(
                        dateText,
                        dateSize
                    );
                    lastPage.drawText(dateText, {
                        x: blockX + (blockWidth - dateWidth) / 2,
                        y: blockY + blockHeight - 24,
                        size: dateSize,
                        font: font,
                        color: rgb(0.3, 0.3, 0.3),
                    });

                    // Линия под подписью
                    lastPage.drawLine({
                        start: { x: blockX + 10, y: blockY + 3 },
                        end: { x: blockX + blockWidth - 10, y: blockY + 3 },
                        thickness: 0.5,
                        color: rgb(0.5, 0.5, 0.5),
                    });

                    // Подпись (текст под линией)
                    const sigLabelText = "подпись";
                    const sigLabelSize = 5;
                    const sigLabelWidth = font.widthOfTextAtSize(
                        sigLabelText,
                        sigLabelSize
                    );
                    lastPage.drawText(sigLabelText, {
                        x: blockX + (blockWidth - sigLabelWidth) / 2,
                        y: blockY - 5,
                        size: sigLabelSize,
                        font: font,
                        color: rgb(0.5, 0.5, 0.5),
                    });
                } else {
                    // Fallback без кириллицы — используем изображение текста
                    const createTextImage = (text, fontSize = 9) => {
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        const scale = 4;
                        const scaledFontSize = fontSize * scale;

                        ctx.font = `${scaledFontSize}px Arial`;
                        const metrics = ctx.measureText(text);
                        const textWidth = metrics.width;

                        canvas.width = Math.ceil(textWidth + 20);
                        canvas.height = Math.ceil(scaledFontSize * 2);

                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = "high";
                        ctx.fillStyle = "black";
                        ctx.font = `${scaledFontSize}px Arial`;
                        ctx.textBaseline = "middle";
                        ctx.fillText(text, 10, canvas.height / 2);

                        return canvas.toDataURL("image/png");
                    };

                    // ФИО
                    const nameTextImage = createTextImage(
                        signatureData.fullName,
                        8
                    );
                    const nameTextImageBytes = await fetch(nameTextImage).then(
                        (res) => res.arrayBuffer()
                    );
                    const nameTextImageEmbed = await pdfDoc.embedPng(
                        nameTextImageBytes
                    );
                    const nameTextDims = nameTextImageEmbed.scale(0.25);

                    lastPage.drawImage(nameTextImageEmbed, {
                        x: blockX + (blockWidth - nameTextDims.width) / 2,
                        y: blockY + blockHeight - 15,
                        width: nameTextDims.width,
                        height: nameTextDims.height,
                    });

                    // Дата
                    const dateTextImage = createTextImage(
                        signatureData.date,
                        7
                    );
                    const dateTextImageBytes = await fetch(dateTextImage).then(
                        (res) => res.arrayBuffer()
                    );
                    const dateTextImageEmbed = await pdfDoc.embedPng(
                        dateTextImageBytes
                    );
                    const dateTextDims = dateTextImageEmbed.scale(0.25);

                    lastPage.drawImage(dateTextImageEmbed, {
                        x: blockX + (blockWidth - dateTextDims.width) / 2,
                        y: blockY + blockHeight - 28,
                        width: dateTextDims.width,
                        height: dateTextDims.height,
                    });
                }
            } else {
                // === НАЙДЕННАЯ ПОЗИЦИЯ (существующая логика) ===
                const createTextImage = (text, fontSize = 9) => {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    const scale = 4;
                    const scaledFontSize = fontSize * scale;

                    ctx.font = `${scaledFontSize}px Arial`;
                    const metrics = ctx.measureText(text);
                    const textWidth = metrics.width;

                    canvas.width = Math.ceil(textWidth + 20);
                    canvas.height = Math.ceil(scaledFontSize * 2);

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.fillStyle = "black";
                    ctx.font = `${scaledFontSize}px Arial`;
                    ctx.textBaseline = "middle";
                    ctx.fillText(text, 10, canvas.height / 2);

                    return canvas.toDataURL("image/png");
                };

                const coords = selectedRole.coordinates;

                const nameX = coords.pdfNameX || coords.nameX;
                const nameY = coords.pdfNameY || coords.nameY;
                const signatureX = coords.pdfSignatureX || coords.signatureX;
                const signatureY = coords.pdfSignatureY || coords.signatureY;

                const signatureImageBytes = await fetch(signatureImage).then(
                    (res) => res.arrayBuffer()
                );
                const signatureImageEmbed = await pdfDoc.embedPng(
                    signatureImageBytes
                );

                const nameText = signatureData.fullName;
                const nameTextImage = createTextImage(nameText, 9);
                const nameTextImageBytes = await fetch(nameTextImage).then(
                    (res) => res.arrayBuffer()
                );
                const nameTextImageEmbed = await pdfDoc.embedPng(
                    nameTextImageBytes
                );
                const nameTextDims = nameTextImageEmbed.scale(0.25);
                const signatureDims = signatureImageEmbed.scale(0.18);

                lastPage.drawImage(signatureImageEmbed, {
                    x: signatureX - 50,
                    y: signatureY - 7,
                    width: signatureDims.width,
                    height: signatureDims.height,
                });

                lastPage.drawImage(nameTextImageEmbed, {
                    x: nameX - 80,
                    y: nameY - 3,
                    width: nameTextDims.width,
                    height: nameTextDims.height,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: "application/pdf" });

            if (onSignatureComplete) {
                onSignatureComplete(blob, null, {
                    type: "simple",
                    position: selectedRole.position,
                    fullName: signatureData.fullName,
                    date: signatureData.date,
                });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `подписанный_${file.name}`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error("Ошибка при создании подписанного документа:", error);
            toast.error("Произошла ошибка при создании документа");
        }
    };

    const handleEdsSignatureComplete = (
        signedPdfBlob,
        cmsBlob,
        signatureInfo
    ) => {
        if (onSignatureComplete) {
            onSignatureComplete(signedPdfBlob, cmsBlob, signatureInfo);
        }
    };

    // Если тип подписи ЭЦП - показываем компонент EdsSignature
    if (selectedSignatureType === "eds" && file) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
                <div className='max-w-4xl mx-auto'>
                    <div className='bg-white rounded-2xl shadow-xl p-4 md:p-8'>
                        <div className='flex items-center gap-3 mb-6'>
                            <FileText className='w-8 h-8 text-indigo-600' />
                            <h1 className='text-2xl md:text-3xl font-bold text-gray-800'>
                                Подписание документа
                            </h1>
                        </div>

                        <div className='bg-gray-50 rounded-xl p-4 mb-6'>
                            <p className='text-gray-700'>
                                <strong>Файл:</strong> {file.name}
                            </p>
                        </div>

                        <EdsSignature
                            file={file}
                            onSignatureComplete={handleEdsSignatureComplete}
                            isCreatingDocument={isCreatingDocument}
                            isSigningDocument={isSigningDocument}
                            signatureIndex={signatureIndex}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8'>
            <div className='max-w-4xl mx-auto'>
                <div className='bg-white rounded-2xl shadow-xl p-4 md:p-8'>
                    <div className='flex items-center gap-3 mb-6 md:mb-8'>
                        <FileText className='w-8 h-8 md:w-10 md:h-10 text-indigo-600' />
                        <h1 className='text-2xl md:text-3xl font-bold text-gray-800'>
                            Система электронной подписи документов
                        </h1>
                    </div>

                    {!file ? (
                        <div className='border-4 border-dashed border-indigo-300 rounded-xl p-8 md:p-12 text-center hover:border-indigo-500 transition-colors'>
                            <Upload className='w-12 h-12 md:w-16 md:h-16 text-indigo-400 mx-auto mb-4' />
                            <label className='cursor-pointer'>
                                <span className='text-lg md:text-xl font-semibold text-gray-700 hover:text-indigo-600'>
                                    Нажмите для загрузки документа
                                </span>
                                <input
                                    type='file'
                                    accept='.pdf'
                                    onChange={handleFileUpload}
                                    className='hidden'
                                />
                            </label>
                            <p className='text-gray-500 mt-2'>
                                Поддерживается формат: .pdf
                            </p>
                        </div>
                    ) : (
                        <div>
                            <div className='bg-gray-50 rounded-xl p-6 mb-6'>
                                <div className='flex items-center justify-between mb-4'>
                                    <div>
                                        <h2 className='text-xl font-semibold text-gray-800'>
                                            Документ загружен
                                        </h2>
                                        <p className='text-gray-600 mt-1'>
                                            {file.name}
                                        </p>
                                    </div>
                                    {signed && (
                                        <div className='flex items-center gap-2 text-green-600'>
                                            <CheckCircle className='w-6 h-6' />
                                            <span className='font-semibold'>
                                                Подписан
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {isScanning && (
                                    <div className='flex items-center gap-3 p-4 bg-blue-100 rounded-lg'>
                                        <Search className='w-5 h-5 text-blue-600 animate-pulse' />
                                        <p className='text-blue-800'>
                                            Сканирую документ, ищу должности...
                                        </p>
                                    </div>
                                )}

                                {availableRoles.length > 0 && !isScanning && (
                                    <div className='mt-4 p-4 bg-green-100 rounded-lg'>
                                        <p className='text-green-800 font-semibold'>
                                            ✓ Найдено {availableRoles.length}{" "}
                                            позиций для подписи
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Выбор типа подписи если не задан */}
                            {!selectedSignatureType &&
                                availableRoles.length > 0 &&
                                !isScanning && (
                                    <div className='bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6'>
                                        <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                                            Выберите способ подписания
                                        </h3>
                                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                            <button
                                                onClick={() =>
                                                    setSelectedSignatureType(
                                                        "simple"
                                                    )
                                                }
                                                className='p-4 border-2 border-gray-300 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left'>
                                                <Pen className='w-8 h-8 text-indigo-600 mb-2' />
                                                <h4 className='font-semibold text-gray-800'>
                                                    Простая подпись
                                                </h4>
                                                <p className='text-sm text-gray-600 mt-1'>
                                                    Нарисуйте подпись от руки
                                                </p>
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setSelectedSignatureType(
                                                        "eds"
                                                    )
                                                }
                                                className='p-4 border-2 border-gray-300 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left'>
                                                <Shield className='w-8 h-8 text-indigo-600 mb-2' />
                                                <h4 className='font-semibold text-gray-800'>
                                                    ЭЦП (NCALayer)
                                                </h4>
                                                <p className='text-sm text-gray-600 mt-1'>
                                                    Электронная цифровая подпись
                                                </p>
                                            </button>
                                        </div>
                                    </div>
                                )}

                            {/* Простая подпись */}
                            {selectedSignatureType === "simple" &&
                                availableRoles.length > 0 && (
                                    <div className='bg-indigo-50 rounded-xl p-6 mb-6'>
                                        <h2 className='text-xl font-semibold text-gray-800 mb-4'>
                                            Подписание документа
                                        </h2>

                                        <div className='space-y-4'>
                                            <div>
                                                <label className='block text-sm font-medium text-gray-700 mb-2'>
                                                    Выберите вашу должность
                                                </label>
                                                <select
                                                    value={
                                                        selectedRole
                                                            ? availableRoles.indexOf(
                                                                  selectedRole
                                                              )
                                                            : ""
                                                    }
                                                    onChange={(e) =>
                                                        setSelectedRole(
                                                            availableRoles[
                                                                parseInt(
                                                                    e.target
                                                                        .value
                                                                )
                                                            ]
                                                        )
                                                    }
                                                    className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500'
                                                    disabled={signed}>
                                                    <option value=''>
                                                        -- Выберите должность --
                                                    </option>
                                                    {availableRoles.map(
                                                        (role, index) => (
                                                            <option
                                                                key={index}
                                                                value={index}>
                                                                {role.position}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </div>

                                            <div>
                                                <label className='block text-sm font-medium text-gray-700 mb-2'>
                                                    ФИО
                                                </label>
                                                <input
                                                    type='text'
                                                    value={
                                                        signatureData.fullName
                                                    }
                                                    onChange={(e) =>
                                                        setSignatureData({
                                                            ...signatureData,
                                                            fullName:
                                                                e.target.value,
                                                        })
                                                    }
                                                    placeholder='Иванов Иван Иванович'
                                                    className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500'
                                                    disabled={signed}
                                                />
                                            </div>

                                            <div>
                                                <label className='block text-sm font-medium text-gray-700 mb-2'>
                                                    Нарисуйте подпись (синей
                                                    ручкой)
                                                </label>
                                                <div className='border-2 border-gray-300 rounded-lg bg-white overflow-hidden'>
                                                    <canvas
                                                        ref={canvasRef}
                                                        width={600}
                                                        height={150}
                                                        onMouseDown={
                                                            startDrawing
                                                        }
                                                        onMouseMove={draw}
                                                        onMouseUp={stopDrawing}
                                                        onMouseLeave={
                                                            stopDrawing
                                                        }
                                                        onTouchStart={(e) => {
                                                            e.preventDefault();
                                                            const touch =
                                                                e.touches[0];
                                                            const mouseEvent =
                                                                new MouseEvent(
                                                                    "mousedown",
                                                                    {
                                                                        clientX:
                                                                            touch.clientX,
                                                                        clientY:
                                                                            touch.clientY,
                                                                    }
                                                                );
                                                            canvasRef.current.dispatchEvent(
                                                                mouseEvent
                                                            );
                                                        }}
                                                        onTouchMove={(e) => {
                                                            e.preventDefault();
                                                            const touch =
                                                                e.touches[0];
                                                            const mouseEvent =
                                                                new MouseEvent(
                                                                    "mousemove",
                                                                    {
                                                                        clientX:
                                                                            touch.clientX,
                                                                        clientY:
                                                                            touch.clientY,
                                                                    }
                                                                );
                                                            canvasRef.current.dispatchEvent(
                                                                mouseEvent
                                                            );
                                                        }}
                                                        onTouchEnd={(e) => {
                                                            e.preventDefault();
                                                            const mouseEvent =
                                                                new MouseEvent(
                                                                    "mouseup",
                                                                    {}
                                                                );
                                                            canvasRef.current.dispatchEvent(
                                                                mouseEvent
                                                            );
                                                        }}
                                                        className='w-full cursor-crosshair touch-none'
                                                        style={{
                                                            touchAction: "none",
                                                        }}
                                                    />
                                                </div>
                                                {!signed && (
                                                    <button
                                                        onClick={clearSignature}
                                                        className='mt-2 w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg'>
                                                        <Trash2 className='w-4 h-4' />
                                                        Очистить подпись
                                                    </button>
                                                )}
                                            </div>

                                            <div>
                                                <label className='block text-sm font-medium text-gray-700 mb-2'>
                                                    Дата
                                                </label>
                                                <input
                                                    type='text'
                                                    value={signatureData.date}
                                                    readOnly
                                                    className='w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100'
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                            {selectedSignatureType === "simple" &&
                                availableRoles.length > 0 && (
                                    <div className='flex gap-4'>
                                        <button
                                            onClick={handleSign}
                                            disabled={signed}
                                            className={`flex-1 py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                                                signed
                                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                            }`}>
                                            <Pen className='w-5 h-5' />
                                            {signed
                                                ? "Документ подписан"
                                                : "Подписать документ"}
                                        </button>

                                        {signed && (
                                            <button
                                                onClick={handleDownload}
                                                className='flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2'>
                                                <Download className='w-5 h-5' />
                                                {isCreatingDocument ||
                                                isSigningDocument
                                                    ? "Продолжить"
                                                    : "Скачать подписанный PDF"}
                                            </button>
                                        )}
                                    </div>
                                )}

                            {/* Кнопка смены типа подписи */}
                            {selectedSignatureType &&
                                !signed &&
                                !signatureType && (
                                    <button
                                        onClick={() =>
                                            setSelectedSignatureType(null)
                                        }
                                        className='w-full mt-4 py-2 px-6 rounded-lg font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700'>
                                        ← Выбрать другой способ подписания
                                    </button>
                                )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
