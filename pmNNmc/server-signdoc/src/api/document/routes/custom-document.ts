export default {
    routes: [
        {
            method: "GET",
            path: "/documents/:id/file-url",
            handler: "api::document.document.getFileUrl",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/documents/:id/presign",
            handler: "api::document.document.presignUrl",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "POST",
            path: "/documents/:id/revoke",
            handler: "api::document.document.revoke",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/documents/:id/accountant-excel",
            handler: "api::document.document.downloadAccountantExcel",
            config: { policies: [], middlewares: [] },
        },
    ],
};
