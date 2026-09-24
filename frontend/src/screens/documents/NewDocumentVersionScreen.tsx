import { Button, Switch, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createDocumentVersion, getDocument, getDocumentTypes } from '../../api/documents';
import { errorMessage } from '../../api/errors';
import type { DocumentCard, DocumentType } from '../../api/types';
import { FilePicker, formatFileSize } from '../../components/base/FilePicker';
import { ErrorState } from '../../components/base/StateCard';
import { documentCardPath, documentCheckPath } from '../../routes/paths';
import {
  DocumentScreen,
  FieldInputs,
  LoadingState,
  Notice,
  SubmitButton,
  sectionStyle,
  stackStyle,
} from './DocumentFormParts';

const FORM_ID = 'document-version-form';

export function NewDocumentVersionScreen() {
  const navigate = useNavigate();
  const parsedId = Number(useParams().id);
  const documentId = Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const [card, setCard] = useState<DocumentCard | null>(null);
  const [type, setType] = useState<DocumentType>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMain, setNewMain] = useState<File | null>(null);
  const [keptAttachments, setKeptAttachments] = useState<Set<number>>(new Set());
  const [containsSensitive, setContainsSensitive] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (documentId === null) {
      setError('Документ не найден');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCard, types] = await Promise.all([getDocument(documentId), getDocumentTypes()]);
      const current = nextCard.versions.find((version) => version.versionNo === nextCard.currentVersionNo);
      setCard(nextCard);
      setType(types.find((item) => item.id === nextCard.type.id));
      setContainsSensitive(current?.containsSensitive ?? false);
      setKeptAttachments(new Set(current?.files.filter((file) => file.kind === 'ATTACHMENT').map((file) => file.id) ?? []));
      setFields(Object.fromEntries(nextCard.check?.fields.map((field) => [field.name, field.value ?? '']) ?? []));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentVersion = useMemo(
    () => card?.versions.find((version) => version.versionNo === card.currentVersionNo),
    [card],
  );
  const currentMain = currentVersion?.files.find((file) => file.kind === 'MAIN');
  const attachments = currentVersion?.files.filter((file) => file.kind === 'ATTACHMENT') ?? [];
  const attachmentsChanged = attachments.some((file) => !keptAttachments.has(file.id));
  const isReturned = card?.status === 'RETURNED';
  // Без нового файла версия переносит поля прежней (бэкенд их не перечитывает, ревью #88): так можно
  // убрать приложение, не меняя основной файл, а у возвращённого документа — перейти к правке полей.
  // С «чувствительными данными» файл в модель не уходит вовсе: поля этой формы и есть данные версии.
  const canSubmit = Boolean(newMain) || containsSensitive || attachmentsChanged || isReturned;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!card || !currentMain) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await createDocumentVersion(card.id, {
        containsSensitive,
        keepFileIds: [
          ...(newMain ? [] : [currentMain.id]),
          ...Array.from(keptAttachments),
        ],
        main: newMain ?? undefined,
        fields: containsSensitive ? fields : undefined,
      });
      navigate(documentCheckPath(updated.id), { state: { card: updated } });
    } catch (versionError) {
      setSubmitError(errorMessage(versionError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !card || !currentVersion || !currentMain) {
    return (
      <DocumentScreen back={documentId === null ? undefined : { to: documentCardPath(documentId), label: 'К документу' }} title="Исправленная версия">
        <ErrorState message={error ?? 'В текущей версии нет основного файла'} onRetry={() => void load()} />
      </DocumentScreen>
    );
  }

  return (
    <DocumentScreen back={documentId === null ? undefined : { to: documentCardPath(documentId), label: 'К документу' }}
      title="Исправленная версия"
      footer={
        <div style={{ ...stackStyle, gap: 8 }}>
          <SubmitButton form={FORM_ID} busy={submitting} disabled={!canSubmit}>
            Загрузить и проверить
          </SubmitButton>
          <Button stretched type="button" variant="secondary" size="large" disabled={submitting} onClick={() => navigate(documentCheckPath(card.id))}>
            Отмена
          </Button>
        </div>
      }
    >
      <Typography.Text>{card.title}</Typography.Text>
      <form id={FORM_ID} style={stackStyle} onSubmit={(event) => void submit(event)}>
        <div style={sectionStyle}>
          <strong>Текущий основной файл</strong>
          <span>{currentMain.fileName} · {formatFileSize(currentMain.size)}</span>
          <small style={{ color: 'var(--text-tertiary)' }}>
            {newMain ? 'Будет заменён новым файлом' : 'Будет использован в новой версии'}
          </small>
        </div>
        <FilePicker
          label="Исправленный файл"
          hint={
            isReturned
              ? 'PDF или DOCX, до 10 МБ. Файл верный, а ИИ прочитал поле неправильно? Отправьте без нового файла — поля сохранятся, и на экране проверки их можно будет исправить.'
              : 'PDF или DOCX, до 10 МБ. Чтобы поправить только поля, вернитесь к проверке документа — там кнопка «Изменить».'
          }
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          file={newMain}
          onSelect={setNewMain}
        />

        {attachments.length > 0 && (
          <div style={{ ...sectionStyle, gap: 12 }}>
            <strong>Оставить приложения</strong>
            {attachments.map((file) => (
              <label key={file.id} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={keptAttachments.has(file.id)}
                  onChange={(event) => setKeptAttachments((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(file.id); else next.delete(file.id);
                    return next;
                  })}
                />
                {file.fileName} · {formatFileSize(file.size)}
              </label>
            ))}
          </div>
        )}

        <label style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'center' }}>
          <Switch checked={containsSensitive} onChange={(event) => setContainsSensitive(event.target.checked)} />
          <span style={{ ...stackStyle, gap: 4 }}>
            <strong>Содержит чувствительные данные</strong>
            <small style={{ color: 'var(--text-tertiary)' }}>
              Файл не будет отправлен на автоматический разбор. Поля ниже заполняете вы — они и будут данными новой версии.
            </small>
          </span>
        </label>

        {containsSensitive && type && (
          <section style={sectionStyle}>
            <Typography.Headline variant="medium">Данные документа</Typography.Headline>
            <FieldInputs definitions={type.fields} values={fields} onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))} />
          </section>
        )}

        {submitError && <Notice tone="danger">{submitError}</Notice>}
        {submitting && (
          <Notice>
            {newMain && !containsSensitive
              ? 'ИИ читает новый файл, затем правила проверяют найденные поля. Это займёт до минуты.'
              : 'Проверяем документ по правилам…'}
          </Notice>
        )}
      </form>
    </DocumentScreen>
  );
}
