import { Button, Switch, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createDocumentVersion, getDocument, getDocumentTypes } from '../../api/documents';
import { ApiError } from '../../api/errors';
import type { DocumentCard, DocumentType } from '../../api/types';
import { FilePicker, formatFileSize } from '../../components/base/FilePicker';
import { BottomActionBar } from '../../components/base/Layout';
import { ErrorState } from '../../components/base/StateCard';
import { documentCheckPath } from '../../routes/paths';
import {
  DocumentScreen,
  FieldInputs,
  LoadingState,
  Notice,
  SubmitButton,
  sectionStyle,
  stackStyle,
} from './DocumentFormParts';

const FALLBACK_ERROR = 'Сервис временно недоступен, попробуйте ещё раз';

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
      setError(loadError instanceof ApiError ? loadError.message : FALLBACK_ERROR);
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
      setSubmitError(versionError instanceof ApiError ? versionError.message : FALLBACK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !card || !currentVersion || !currentMain) {
    return (
      <DocumentScreen title="Исправленная версия">
        <ErrorState message={error ?? 'В текущей версии нет основного файла'} onRetry={() => void load()} />
      </DocumentScreen>
    );
  }

  return (
    <DocumentScreen title="Исправленная версия">
      <Typography.Text>{card.title}</Typography.Text>
      <form style={{ ...stackStyle, marginTop: 20 }} onSubmit={(event) => void submit(event)}>
        <div style={sectionStyle}>
          <strong>Текущий основной файл</strong>
          <span>{currentMain.fileName} · {formatFileSize(currentMain.size)}</span>
          <small style={{ color: 'var(--text-tertiary)' }}>
            {newMain ? 'Будет заменён новым файлом' : 'Будет использован в новой версии'}
          </small>
        </div>
        <FilePicker
          label="Новый основной файл"
          hint="Не выбирайте файл, если исправляете только поля"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          file={newMain}
          onSelect={setNewMain}
        />

        {attachments.length > 0 && (
          <fieldset style={sectionStyle}>
            <legend style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Оставить приложения</legend>
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
          </fieldset>
        )}

        <label style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'center' }}>
          <Switch checked={containsSensitive} onChange={(event) => setContainsSensitive(event.target.checked)} />
          <span style={{ ...stackStyle, gap: 4 }}>
            <strong>Содержит чувствительные данные</strong>
            <small style={{ color: 'var(--text-tertiary)' }}>Файл не будет отправлен на автоматический разбор, поля заполните вручную.</small>
          </span>
        </label>

        {containsSensitive && type && (
          <section style={sectionStyle}>
            <Typography.Headline variant="medium">Данные документа</Typography.Headline>
            <FieldInputs definitions={type.fields} values={fields} onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))} />
          </section>
        )}

        {submitError && <Notice tone="danger">{submitError}</Notice>}
        {submitting && <Typography.Text>Проверяем документ</Typography.Text>}
        <BottomActionBar>
          <div style={stackStyle}>
            <SubmitButton busy={submitting}>Загрузить и проверить</SubmitButton>
            <Button stretched type="button" onClick={() => navigate(documentCheckPath(card.id))}>Отмена</Button>
          </div>
        </BottomActionBar>
      </form>
    </DocumentScreen>
  );
}
