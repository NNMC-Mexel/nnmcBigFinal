import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Trash2, Paperclip, Plus } from 'lucide-react';
import { getProjectDocuments, uploadDocument, deleteDocument, ProjectDocument } from '../../api/documents';
import Button from '../ui/Button';

interface Props {
  projectDocumentId: string;
  canEdit: boolean;
}

const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337';
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

export default function DocumentsSection({ projectDocumentId, canEdit }: Props) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const docs = await getProjectDocuments(projectDocumentId);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [projectDocumentId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDocument(projectDocumentId, file);
      }
      await fetchDocuments();
    } catch (err) {
      console.error('Failed to upload', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm(t('documents.confirmDelete', 'Удалить документ?'))) return;
    try {
      await deleteDocument(docId);
      await fetchDocuments();
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUploaderName = (doc: ProjectDocument) => {
    if (!doc.uploadedBy) return t('documents.unknown', 'Неизвестно');
    const { firstName, lastName, username } = doc.uploadedBy;
    if (firstName || lastName) {
      return `${firstName || ''} ${lastName || ''}`.trim();
    }
    return username;
  };

  const getFileIcon = (mime: string) => {
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
    if (mime.includes('image')) return '🖼️';
    if (mime.includes('zip') || mime.includes('rar')) return '📦';
    return '📎';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-cyan-600" />
          {t('documents.title', 'Документы')}
        </h3>
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.png,.jpg,.jpeg,.gif"
            />
            <Button 
              size="sm" 
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4 mr-1" />
              {uploading ? t('documents.uploading', 'Загрузка...') : t('documents.add', 'Добавить')}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">{t('common.loading', 'Загрузка...')}</p>
      ) : documents.length === 0 ? (
        <p className="text-slate-500 text-sm">{t('documents.empty', 'Нет прикрепленных документов')}</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li
              key={doc.documentId}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">
                  {doc.file?.mime ? getFileIcon(doc.file.mime) : '📎'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 truncate">{doc.file?.name || 'Документ'}</p>
                  <p className="text-xs text-slate-500">
                    {doc.file?.size ? formatFileSize(doc.file.size) : ''} • {getUploaderName(doc)} • {formatDate(doc.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {doc.file?.url && (
                  <a
                    href={`${API_URL}${doc.file.url}`}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-cyan-600 hover:bg-cyan-100 rounded-lg transition-colors"
                    title={t('documents.download', 'Скачать')}
                  >
                    <Download className="w-5 h-5" />
                  </a>
                )}
                {canEdit && (
                  <button
                    onClick={() => handleDelete(doc.documentId)}
                    className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                    title={t('documents.delete', 'Удалить')}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
