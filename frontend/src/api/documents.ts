import { apiRequest } from './client';
import type { CheckResult, DocumentCard, DocumentType, Visibility } from './types';

export interface CreateDocumentInput {
  documentTypeId: number;
  title: string;
  visibility: Visibility;
  containsSensitive: boolean;
  fields?: Record<string, string>;
  main: File;
  attachments?: File[];
}

export interface CreateVersionInput {
  fields?: Record<string, string>;
  containsSensitive: boolean;
  keepFileIds: number[];
  main?: File;
  attachments?: File[];
}

function jsonPart(value: unknown): Blob {
  return new Blob([JSON.stringify(value)], { type: 'application/json' });
}

function appendFiles(form: FormData, field: string, files: File[] | undefined): void {
  files?.forEach((file) => form.append(field, file));
}

export function getDocumentTypes(): Promise<DocumentType[]> {
  return apiRequest<DocumentType[]>('/document-types');
}

export function getDocument(documentId: number): Promise<DocumentCard> {
  return apiRequest<DocumentCard>(`/documents/${documentId}`);
}

export function createDocument(input: CreateDocumentInput): Promise<DocumentCard> {
  const form = new FormData();
  form.append(
    'meta',
    jsonPart({
      documentTypeId: input.documentTypeId,
      title: input.title,
      visibility: input.visibility,
      containsSensitive: input.containsSensitive,
      ...(input.fields ? { fields: input.fields } : {}),
    }),
  );
  form.append('main', input.main);
  appendFiles(form, 'attachments', input.attachments);
  return apiRequest<DocumentCard>('/documents', { method: 'POST', body: form, isFormData: true });
}

export function createDocumentVersion(documentId: number, input: CreateVersionInput): Promise<DocumentCard> {
  const form = new FormData();
  form.append(
    'meta',
    jsonPart({
      containsSensitive: input.containsSensitive,
      keepFileIds: input.keepFileIds,
      ...(input.fields ? { fields: input.fields } : {}),
    }),
  );
  if (input.main) {
    form.append('main', input.main);
  }
  appendFiles(form, 'attachments', input.attachments);
  return apiRequest<DocumentCard>(`/documents/${documentId}/versions`, {
    method: 'POST',
    body: form,
    isFormData: true,
  });
}

export function updateDocumentFields(
  documentId: number,
  versionNo: number,
  fields: Record<string, string>,
): Promise<CheckResult> {
  return apiRequest<CheckResult>(`/documents/${documentId}/versions/${versionNo}/fields`, {
    method: 'PUT',
    body: { fields },
    timeoutMs: 120_000,
  });
}
