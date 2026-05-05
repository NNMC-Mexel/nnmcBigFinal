import { randomBytes } from "crypto";
import { errors } from "@strapi/utils";

const { ApplicationError } = errors;
declare const strapi: any;

const generateUid = () => randomBytes(5).toString("hex").toUpperCase();
const FROZEN_STATUSES = new Set(["cancelled", "completed", "revision", "revoked"]);
const TERMINAL_STATUSES = new Set(["cancelled", "completed", "revoked"]);

export default {
    async beforeCreate(event: any) {
        const data = event.params?.data;
        if (!data) return;
        if (typeof data.uid === "string" && data.uid.trim()) return;
        data.uid = generateUid();
    },

    async beforeUpdate(event: any) {
        const where = event.params?.where;
        const data = event.params?.data || {};
        if (!where) return;

        const current = await (strapi as any).db
            .query("api::document.document")
            .findOne({ where, select: ["id", "status"] });
        if (!current || !FROZEN_STATUSES.has(current.status)) return;

        const isRevisionResend =
            current.status === "revision" &&
            "status" in data &&
            (data.status === "in_progress" || data.status === "pending" || data.status === "completed");

        if (!isRevisionResend) {
            const baseForbidden = ["signers", "signatureHistory"];
            const forbiddenFields = TERMINAL_STATUSES.has(current.status)
                ? [...baseForbidden, "originalFile", "currentFile"]
                : baseForbidden;

            for (const field of forbiddenFields) {
                if (field in data) {
                    throw new ApplicationError(
                        `Document is ${current.status}; updating ${field} is forbidden`
                    );
                }
            }
        }

        if (
            TERMINAL_STATUSES.has(current.status) &&
            "status" in data &&
            data.status !== current.status
        ) {
            throw new ApplicationError(
                `Document is already ${current.status} and cannot change status`
            );
        }
    },
};
