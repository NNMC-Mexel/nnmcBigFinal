import { factories } from "@strapi/strapi";

const DOCUMENT_UID = "api::document.document";

type NotifyPayload = {
    recipientEmail: string;
    title: string;
    body?: string;
    type?: string;
    link?: string;
    metadata?: any;
};

function normalizeEmail(value: any): string {
    return String(value || "").trim().toLowerCase();
}

function signerEmail(signer: any): string {
    return normalizeEmail(signer?.email || signer?.userEmail);
}

function routeId(document: any): string | number {
    return document?.id || document?.documentId;
}

function sortedSigners(signers: any[]): any[] {
    return [...(Array.isArray(signers) ? signers : [])].sort(
        (a: any, b: any) => (a?.order ?? 9999) - (b?.order ?? 9999)
    );
}

function mergeFilters(existing: any, accessFilter: any) {
    if (!existing || Object.keys(existing).length === 0) return accessFilter;
    return { $and: [existing, accessFilter] };
}

function notifyViaPm(strapi: any, payload: NotifyPayload) {
    const pmUrl = process.env.SERVER_PM_URL;
    const token = process.env.INTERNAL_SYNC_TOKEN;
    if (!pmUrl || !token) return;

    fetch(`${pmUrl}/api/internal-notifications`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": token,
        },
        body: JSON.stringify(payload),
    }).catch((e: any) => {
        try {
            strapi.log.warn(`[notify] failed: ${e?.message || e}`);
        } catch {}
    });
}

function pushAuditEvent(strapi: any, payload: any) {
    const pmUrl = process.env.SERVER_PM_URL;
    const token = process.env.INTERNAL_SYNC_TOKEN;
    if (!pmUrl || !token) return;

    fetch(`${pmUrl}/api/internal-audit-events`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": token,
        },
        body: JSON.stringify(payload),
    }).catch((e: any) => {
        try {
            strapi.log.warn(`[audit] failed: ${e?.message || e}`);
        } catch {}
    });
}

function summarizeDocument(document: any) {
    const metadata = document?.metadata || {};
    return {
        id: document?.id,
        documentId: document?.documentId,
        title: document?.title,
        status: document?.status,
        creator: document?.creator?.id || document?.creator || null,
        assignedUsers: (document?.assigned_users || []).map((u: any) => u?.id || u),
        signers: sortedSigners(document?.signers || []).map((s: any) => ({
            userId: s?.userId,
            email: signerEmail(s),
            role: s?.role || "",
            order: s?.order,
            status: s?.status,
            signedAt: s?.signedAt || null,
        })),
        signatureHistoryCount: Array.isArray(document?.signatureHistory)
            ? document.signatureHistory.length
            : 0,
        metadata: {
            source: metadata?.source || metadata?.kpi?.source || null,
            department: metadata?.department || metadata?.kpi?.department || null,
            period: metadata?.period || metadata?.kpi?.period || null,
            accountantExcelGeneratedAt:
                metadata?.accountantExcel?.generatedAt ||
                metadata?.kpi?.accountantExcel?.generatedAt ||
                null,
        },
    };
}

async function fetchPmUsers(strapi: any): Promise<any[]> {
    const pmUrl = process.env.SERVER_PM_URL;
    const token = process.env.INTERNAL_SYNC_TOKEN;
    if (!pmUrl || !token) return [];

    try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${pmUrl}/api/internal-sync/users`, {
            signal: ctrl.signal,
            headers: { "X-Internal-Token": token },
        }).finally(() => clearTimeout(timeout));
        if (!res.ok) return [];
        const items = (await res.json()) as any[];
        return Array.isArray(items) ? items : [];
    } catch (e: any) {
        try {
            strapi.log.warn(`[pm-users] failed: ${e?.message || e}`);
        } catch {}
        return [];
    }
}

async function getAccountingUsers(strapi: any): Promise<any[]> {
    const pmUsers = await fetchPmUsers(strapi);
    return pmUsers.filter(
        (u: any) => String(u?.department?.key || "").toUpperCase() === "ACCOUNTING"
    );
}

function escapeXml(value: any): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function kpiMetadata(document: any): any {
    const metadata = document?.metadata || {};
    if (metadata?.kpi) return metadata.kpi;
    return metadata;
}

function buildAccountantExcel(document: any) {
    const metadata = kpiMetadata(document);
    const rows = Array.isArray(metadata?.results) ? metadata.results : [];
    const period = metadata?.period || {};
    const department = metadata?.department || "";
    const title = `KPI_${department || "department"}_${period.year || ""}-${String(
        period.month || ""
    ).padStart(2, "0")}`;
    const fileName = `${title.replace(/[^\w.-]+/g, "_")}_accounting.xls`;

    const tableRows = rows
        .map((row: any, index: number) => {
            const fio = row?.fio || row?.name || "";
            const amount = Number(row?.kpiFinal ?? row?.finalAmount ?? row?.amount ?? 0);
            return `
   <Row>
    <Cell><Data ss:Type="Number">${index + 1}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(fio)}</Data></Cell>
    <Cell><Data ss:Type="Number">${Number.isFinite(amount) ? amount : 0}</Data></Cell>
   </Row>`;
        })
        .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="KPI">
  <Table>
   <Column ss:Width="40"/>
   <Column ss:Width="260"/>
   <Column ss:Width="120"/>
   <Row>
    <Cell><Data ss:Type="String">№</Data></Cell>
    <Cell><Data ss:Type="String">ФИО</Data></Cell>
    <Cell><Data ss:Type="String">Итоговая сумма KPI</Data></Cell>
   </Row>${tableRows}
  </Table>
 </Worksheet>
</Workbook>`;

    return {
        fileName,
        mimeType: "application/vnd.ms-excel",
        contentBase64: Buffer.from(xml, "utf8").toString("base64"),
        generatedAt: new Date().toISOString(),
        rowCount: rows.length,
    };
}

async function findDocumentByParam(strapi: any, id: any, populate: any = ["creator", "assigned_users"]) {
    const rawId = String(id || "");
    if (/^\d+$/.test(rawId)) {
        return await strapi.entityService.findOne(DOCUMENT_UID, Number(rawId), { populate });
    }
    return await strapi.documents(DOCUMENT_UID).findOne({
        documentId: rawId,
        populate,
    });
}

async function getFullUser(strapi: any, user: any) {
    if (!user?.id) return null;
    return await strapi.entityService.findOne("plugin::users-permissions.user", user.id, {
        fields: ["id", "email", "username", "fullName", "isSuperAdmin"],
        populate: ["department"],
    });
}

function isSuperAdmin(user: any): boolean {
    return user?.isSuperAdmin === true;
}

function isAccountingUser(user: any): boolean {
    const key = String(user?.department?.key || "").toUpperCase();
    const name = String(user?.department?.name || "").toLowerCase();
    return key === "ACCOUNTING" || name.includes("бухгалтер");
}

async function canAccessDocument(strapi: any, document: any, requestUser: any): Promise<boolean> {
    const fullUser = await getFullUser(strapi, requestUser);
    if (!fullUser || !document) return false;
    if (isSuperAdmin(fullUser)) return true;

    const userId = Number(fullUser.id);
    const creatorId = Number(document?.creator?.id || document?.creator);
    const assigned = Array.isArray(document?.assigned_users) ? document.assigned_users : [];
    const isAssigned = assigned.some((u: any) => Number(u?.id || u) === userId);

    return creatorId === userId || isAssigned;
}

async function canManageDocument(strapi: any, document: any, requestUser: any): Promise<boolean> {
    const fullUser = await getFullUser(strapi, requestUser);
    if (!fullUser || !document) return false;
    if (isSuperAdmin(fullUser)) return true;
    return Number(document?.creator?.id || document?.creator) === Number(fullUser.id);
}

async function toFileId(strapi: any, ref: any): Promise<number | null> {
    if (ref == null) return null;
    if (typeof ref === "number") return ref;
    if (typeof ref === "string" && /^\d+$/.test(ref)) return Number(ref);
    if (typeof ref === "string") {
        const f = await strapi.db
            .query("plugin::upload.file")
            .findOne({ where: { documentId: ref } });
        return f?.id ?? null;
    }
    if (typeof ref === "object") {
        if (ref.id != null) return Number(ref.id);
        if (ref.documentId) {
            const f = await strapi.db
                .query("plugin::upload.file")
                .findOne({ where: { documentId: ref.documentId } });
            return f?.id ?? null;
        }
    }
    return null;
}

async function attachFile(strapi: any, fileId: number, docNumericId: number, field: string) {
    await strapi.db.query("plugin::upload.file").update({
        where: { id: fileId },
        data: {
            related: [
                {
                    id: docNumericId,
                    __type: DOCUMENT_UID,
                    __pivot: { field },
                },
            ],
        },
    });
}

async function attachDocumentFiles(
    strapi: any,
    docNumericId: number,
    currentFileId: number | null,
    originalFileId: number | null
) {
    const sameFile = currentFileId && originalFileId === currentFileId;
    if (sameFile) {
        await strapi.db.query("plugin::upload.file").update({
            where: { id: currentFileId },
            data: {
                related: [
                    { id: docNumericId, __type: DOCUMENT_UID, __pivot: { field: "currentFile" } },
                    { id: docNumericId, __type: DOCUMENT_UID, __pivot: { field: "originalFile" } },
                ],
            },
        });
        return;
    }
    if (currentFileId) await attachFile(strapi, currentFileId, docNumericId, "currentFile");
    if (originalFileId) await attachFile(strapi, originalFileId, docNumericId, "originalFile");
}

function notifySigner(strapi: any, document: any, signer: any) {
    const email = signerEmail(signer);
    if (!email) return;
    notifyViaPm(strapi, {
        recipientEmail: email,
        title: `На подпись: ${document?.title || "Новый документ"}`,
        body: "Вам пришёл документ на подпись. Откройте «Документооборот» чтобы подписать.",
        type: "signdoc_signature_request",
        link: `/app/signdoc/documents/${routeId(document)}`,
        metadata: {
            documentId: document?.documentId || document?.id,
            role: signer?.role || "",
            order: signer?.order || null,
        },
    });
}

function notifyInitialSigners(strapi: any, document: any) {
    const signers = sortedSigners(document?.signers || []);
    const targets = document?.signatureSequential ? signers.slice(0, 1) : signers;
    targets.forEach((signer) => notifySigner(strapi, document, signer));
}

function hasNewSignature(before: any, after: any): boolean {
    const beforeSigners = new Map(
        (before?.signers || []).map((s: any) => [String(s?.userId), s?.status])
    );
    const afterSigners = after?.signers || [];
    if (
        afterSigners.some(
            (s: any) => s?.status === "signed" && beforeSigners.get(String(s?.userId)) !== "signed"
        )
    ) {
        return true;
    }
    return (
        Array.isArray(after?.signatureHistory) &&
        Array.isArray(before?.signatureHistory) &&
        after.signatureHistory.length > before.signatureHistory.length
    );
}

function allSignersSigned(document: any): boolean {
    const signers = document?.signers || [];
    return signers.length > 0 && signers.every((s: any) => s?.status === "signed");
}

function notifyNextSequentialSigner(strapi: any, before: any, after: any) {
    if (!after?.signatureSequential || !hasNewSignature(before, after)) return;
    if (allSignersSigned(after)) return;
    const nextSigner = sortedSigners(after?.signers || []).find(
        (s: any) => s?.status === "pending"
    );
    if (nextSigner) notifySigner(strapi, after, nextSigner);
}

async function appendAccountingAssignees(strapi: any, document: any, accountingUsers: any[]) {
    const emails = accountingUsers.map((u) => normalizeEmail(u?.email)).filter(Boolean);
    if (emails.length === 0 || !document?.id) return;

    const localUsers = await strapi.entityService.findMany("plugin::users-permissions.user", {
        filters: { email: { $in: emails } },
        fields: ["id", "email"],
        pagination: { pageSize: 1000 },
    });
    const existingIds = (document.assigned_users || []).map((u: any) => Number(u?.id || u));
    const nextIds = Array.from(
        new Set([
            ...existingIds,
            ...(localUsers || []).map((u: any) => Number(u.id)).filter(Boolean),
        ])
    );
    if (nextIds.length !== existingIds.length) {
        await (strapi.entityService as any).update(DOCUMENT_UID, document.id, {
            data: { assigned_users: nextIds },
        });
    }
}

async function handleCompletedDocument(strapi: any, before: any, after: any) {
    const becameCompleted =
        after?.status === "completed" && before?.status !== "completed";
    if (!becameCompleted && !(allSignersSigned(after) && !allSignersSigned(before))) return;

    const metadata = after?.metadata || {};
    const isKpiDocument =
        metadata?.source === "kpi-timesheet" || metadata?.kpi?.source === "kpi-timesheet";
    const accountingUsers = await getAccountingUsers(strapi);

    let nextMetadata = metadata;
    if (isKpiDocument && !metadata?.accountantExcel?.contentBase64) {
        const accountantExcel = buildAccountantExcel(after);
        nextMetadata = { ...metadata, accountantExcel };
        await (strapi.entityService as any).update(DOCUMENT_UID, after.id, {
            data: { metadata: nextMetadata },
        });
        after.metadata = nextMetadata;
    }

    await appendAccountingAssignees(strapi, after, accountingUsers);

    const link = `/app/signdoc/documents/${routeId(after)}`;
    const excelMetadata = nextMetadata?.accountantExcel
        ? {
              fileName: nextMetadata.accountantExcel.fileName,
              rowCount: nextMetadata.accountantExcel.rowCount,
              downloadLink: `/api/documents/${after.documentId || after.id}/accountant-excel`,
          }
        : null;

    if (after?.creator?.email) {
        notifyViaPm(strapi, {
            recipientEmail: normalizeEmail(after.creator.email),
            title: `Документ подписан: ${after.title}`,
            body: "Все подписанты завершили подписание документа.",
            type: "signdoc_completed",
            link,
            metadata: { documentId: after.documentId || after.id },
        });
    }

    for (const accountant of accountingUsers) {
        const email = normalizeEmail(accountant?.email);
        if (!email) continue;
        notifyViaPm(strapi, {
            recipientEmail: email,
            title: `KPI протокол подписан: ${after.title}`,
            body: "Документ полностью подписан. Excel для бухгалтерии доступен в карточке документа.",
            type: "signdoc_kpi_completed",
            link,
            metadata: {
                documentId: after.documentId || after.id,
                accountantExcel: excelMetadata,
            },
        });
    }
}

export default factories.createCoreController(
    DOCUMENT_UID,
    ({ strapi }) => ({
        async find(ctx) {
            const requestUser = ctx.state.user;
            if (!requestUser) return ctx.unauthorized("Необходима авторизация");
            const fullUser = await getFullUser(strapi, requestUser);
            if (!isSuperAdmin(fullUser)) {
                const accessFilter = {
                    $or: [
                        { creator: { id: { $eq: requestUser.id } } },
                        { assigned_users: { id: { $eq: requestUser.id } } },
                    ],
                };
                ctx.query.filters = mergeFilters(ctx.query.filters, accessFilter);
            }
            return await super.find(ctx);
        },

        async findOne(ctx) {
            const requestUser = ctx.state.user;
            if (!requestUser) return ctx.unauthorized("Необходима авторизация");
            const document = await findDocumentByParam(strapi, ctx.params.id, [
                "creator",
                "assigned_users",
            ]);
            if (!document) return ctx.notFound("Документ не найден");
            if (!(await canAccessDocument(strapi, document, requestUser))) {
                return ctx.forbidden("Нет доступа к этому документу");
            }
            return await super.findOne(ctx);
        },

        async create(ctx) {
            const body = ctx.request.body;
            const data = (body as any)?.data || {};

            const currentFileId = await toFileId(strapi, data.currentFile);
            const originalFileId = await toFileId(strapi, data.originalFile);

            delete data.currentFile;
            delete data.originalFile;

            const result: any = await (super.create as any)(ctx);
            const created = result?.data || result;
            const docNumericId = created?.id;

            if (docNumericId) {
                await attachDocumentFiles(strapi, docNumericId, currentFileId, originalFileId);

                try {
                    const fullCreated = await findDocumentByParam(strapi, docNumericId, [
                        "creator",
                        "assigned_users",
                    ]);
                    notifyInitialSigners(strapi, fullCreated || created);
                    pushAuditEvent(strapi, {
                        action: "create",
                        entityType: DOCUMENT_UID,
                        entityId: String(created?.documentId || docNumericId),
                        newData: summarizeDocument(fullCreated || created),
                    });
                } catch (e: any) {
                    strapi.log.warn(`[document:create] post-create hooks failed: ${e?.message || e}`);
                }
            }

            return result;
        },

        async update(ctx) {
            const requestUser = ctx.state.user;
            if (!requestUser) return ctx.unauthorized("Необходима авторизация");

            const before = await findDocumentByParam(strapi, ctx.params.id, [
                "creator",
                "assigned_users",
            ]);
            if (!before) return ctx.notFound("Документ не найден");
            if (!(await canAccessDocument(strapi, before, requestUser))) {
                return ctx.forbidden("Нет доступа к этому документу");
            }
            if (before.status === "revoked") {
                return ctx.badRequest("Отозванный документ нельзя изменять");
            }

            const data = (ctx.request.body as any)?.data || {};
            const hasCurrentFile = Object.prototype.hasOwnProperty.call(data, "currentFile");
            const hasOriginalFile = Object.prototype.hasOwnProperty.call(data, "originalFile");
            const currentFileId = hasCurrentFile ? await toFileId(strapi, data.currentFile) : null;
            const originalFileId = hasOriginalFile ? await toFileId(strapi, data.originalFile) : null;

            if (hasCurrentFile) delete data.currentFile;
            if (hasOriginalFile) delete data.originalFile;

            const result: any = await (super.update as any)(ctx);
            const numericId = before.id || (result?.data || result)?.id;
            if (numericId && (hasCurrentFile || hasOriginalFile)) {
                await attachDocumentFiles(strapi, numericId, currentFileId, originalFileId);
            }

            const after = await findDocumentByParam(strapi, ctx.params.id, [
                "creator",
                "assigned_users",
            ]);

            try {
                notifyNextSequentialSigner(strapi, before, after);
                await handleCompletedDocument(strapi, before, after);
                pushAuditEvent(strapi, {
                    action: "update",
                    entityType: DOCUMENT_UID,
                    entityId: String(after?.documentId || after?.id || ctx.params.id),
                    actorEmail: normalizeEmail((await getFullUser(strapi, requestUser))?.email),
                    oldData: summarizeDocument(before),
                    newData: summarizeDocument(after),
                });
            } catch (e: any) {
                strapi.log.warn(`[document:update] post-update hooks failed: ${e?.message || e}`);
            }

            return result;
        },

        async delete(ctx) {
            const requestUser = ctx.state.user;
            if (!requestUser) return ctx.unauthorized("Необходима авторизация");
            const before = await findDocumentByParam(strapi, ctx.params.id, [
                "creator",
                "assigned_users",
            ]);
            if (!before) return ctx.notFound("Документ не найден");
            if (!(await canManageDocument(strapi, before, requestUser))) {
                return ctx.forbidden("Удалить документ может только создатель или SuperAdmin");
            }
            const result = await super.delete(ctx);
            pushAuditEvent(strapi, {
                action: "delete",
                entityType: DOCUMENT_UID,
                entityId: String(before?.documentId || before?.id),
                actorEmail: normalizeEmail((await getFullUser(strapi, requestUser))?.email),
                oldData: summarizeDocument(before),
            });
            return result;
        },

        async revoke(ctx) {
            const requestUser = ctx.state.user;
            if (!requestUser) return ctx.unauthorized("Необходима авторизация");
            const before = await findDocumentByParam(strapi, ctx.params.id, [
                "creator",
                "assigned_users",
            ]);
            if (!before) return ctx.notFound("Документ не найден");
            if (!(await canManageDocument(strapi, before, requestUser))) {
                return ctx.forbidden("Отозвать документ может только создатель или SuperAdmin");
            }
            if (before.status === "completed") {
                return ctx.badRequest("Полностью подписанный документ нельзя отозвать");
            }
            if (before.status === "revoked") {
                ctx.body = { data: before };
                return;
            }

            const fullUser = await getFullUser(strapi, requestUser);
            const reason = String((ctx.request.body as any)?.reason || "").trim() || null;
            const history = [
                ...(before.signatureHistory || []),
                {
                    type: "revoked",
                    userId: fullUser?.id || requestUser.id,
                    userName: fullUser?.fullName || fullUser?.username || requestUser.username,
                    comment: reason,
                    date: new Date().toISOString(),
                },
            ];

            await (strapi.entityService as any).update(DOCUMENT_UID, before.id, {
                data: {
                    status: "revoked",
                    signatureHistory: history,
                    metadata: {
                        ...(before.metadata || {}),
                        revokedAt: new Date().toISOString(),
                        revokedBy: fullUser?.id || requestUser.id,
                        revokeReason: reason,
                    },
                },
            });

            const after = await findDocumentByParam(strapi, before.id, ["creator", "assigned_users"]);
            for (const signer of sortedSigners(before.signers || [])) {
                const email = signerEmail(signer);
                if (!email) continue;
                notifyViaPm(strapi, {
                    recipientEmail: email,
                    title: `Документ отозван: ${before.title}`,
                    body: reason
                        ? `Документ отозван на пересчёт. Причина: ${reason}`
                        : "Документ отозван на пересчёт.",
                    type: "signdoc_revoked",
                    link: `/app/signdoc/documents/${routeId(before)}`,
                    metadata: { documentId: before.documentId || before.id },
                });
            }

            pushAuditEvent(strapi, {
                action: "revoke",
                entityType: DOCUMENT_UID,
                entityId: String(before?.documentId || before?.id),
                actorEmail: normalizeEmail(fullUser?.email),
                oldData: summarizeDocument(before),
                newData: summarizeDocument(after),
            });

            ctx.body = { data: after };
        },

        async downloadAccountantExcel(ctx) {
            const requestUser = ctx.state.user;
            if (!requestUser) return ctx.unauthorized("Необходима авторизация");

            const document = await findDocumentByParam(strapi, ctx.params.id, [
                "creator",
                "assigned_users",
            ]);
            if (!document) return ctx.notFound("Документ не найден");

            const fullUser = await getFullUser(strapi, requestUser);
            const canAccess =
                (await canAccessDocument(strapi, document, requestUser)) ||
                (document.status === "completed" && isAccountingUser(fullUser));
            if (!canAccess) return ctx.forbidden("Нет доступа к этому документу");
            if (document.status !== "completed") {
                return ctx.badRequest("Excel доступен только после полного подписания");
            }

            const metadata = document.metadata || {};
            const excel = metadata.accountantExcel || buildAccountantExcel(document);
            if (!metadata.accountantExcel && document.id) {
                await (strapi.entityService as any).update(DOCUMENT_UID, document.id, {
                    data: { metadata: { ...metadata, accountantExcel: excel } },
                });
            }

            const buffer = Buffer.from(excel.contentBase64, "base64");
            ctx.set("Content-Type", excel.mimeType || "application/vnd.ms-excel");
            ctx.set(
                "Content-Disposition",
                `attachment; filename="${excel.fileName || "kpi-accounting.xls"}"`
            );
            ctx.body = buffer;
        },

        async getFileUrl(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const { id } = ctx.params;
            const fileType = (ctx.query.file as string) || "current";

            const document = await findDocumentByParam(strapi, id, [
                "currentFile",
                "originalFile",
                "creator",
                "assigned_users",
            ]);

            if (!document) return ctx.notFound("Документ не найден");
            if (!(await canAccessDocument(strapi, document, user))) {
                return ctx.forbidden("Нет доступа к этому документу");
            }

            const file = fileType === "original" ? document.originalFile : document.currentFile;
            if (!file) return ctx.notFound("Файл не найден");

            const url = (file as any).url;
            return ctx.send({ url });
        },

        async presignUrl(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const { id } = ctx.params;
            const key = ctx.query.key as string;
            if (!key) return ctx.badRequest("Параметр key обязателен");

            const document = await findDocumentByParam(strapi, id, [
                "creator",
                "assigned_users",
            ]);

            if (!document) return ctx.notFound("Документ не найден");
            if (!(await canAccessDocument(strapi, document, user))) {
                return ctx.forbidden("Нет доступа к этому документу");
            }

            const url = `/uploads/${key}`;
            return ctx.send({ url });
        },
    })
);
