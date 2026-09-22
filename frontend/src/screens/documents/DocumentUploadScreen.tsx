import { Input, Typography } from '@maxhub/max-ui';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDocument, getDocumentTypes } from '../../api/documents';
import { ApiError } from '../../api/errors';
import type { DocumentType, Visibility } from '../../api/types';
import { FilePicker } from '../../components/base/FilePicker';
import { BottomActionBar } from '../../components/base/Layout';
import { ErrorState } from '../../components/base/StateCard';
import { documentCheckPath } from '../../routes/paths';
import {
  DocumentScreen,
  FieldInputs,
  LoadingState,
  Notice,
  SubmitButton,
  fieldStyle,
  inputStyle,
  sectionStyle,
  stackStyle,
} from './DocumentFormParts';

const FALLBACK_ERROR = 'Сервис временно недоступен, попробуйте ещё раз';

export function DocumentUploadScreen() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<DocumentType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('PRIVATE');
  const [containsSensitive, setContainsSensitive] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function loadTypes() {
    setLoadError(null);
    try {
      const response = await getDocumentTypes();
      setTypes(response);
      setSelectedTypeId((current) => current ?? response[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
    }
  }

  useEffect(() => {
    void loadTypes();
  }, []);

  const selectedType = useMemo(
    () => types?.find((type) => type.id === selectedTypeId) ?? null,
    [selectedTypeId, types],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedType || !mainFile || !title.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const card = await createDocument({
        documentTypeId: selectedType.id,
        title: title.trim(),
        visibility,
        containsSensitive,
        fields: containsSensitive ? fields : undefined,
        main: mainFile,
      });
      navigate(documentCheckPath(card.id), { state: { card } });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (!types && !loadError) return <LoadingState />;
  if (loadError) {
    return <DocumentScreen title="Новый документ"><ErrorState message={loadError} onRetry={() => void loadTypes()} /></DocumentScreen>;
  }
  if (!types || types.length === 0) {
    return <DocumentScreen title="Новый документ"><Notice>Типы документов пока не настроены. Обратитесь к администратору.</Notice></DocumentScreen>;
  }

  return (
    <DocumentScreen title="Новый документ">
      <form style={{ ...stackStyle, marginTop: 20 }} onSubmit={(event) => void submit(event)}>
        <label style={fieldStyle}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Тип документа</span>
          <select
            style={inputStyle}
            value={selectedTypeId ?? ''}
            onChange={(event) => {
              setSelectedTypeId(Number(event.target.value));
              setFields({});
            }}
          >
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {selectedType?.isGeneric ? 'Без автоматической проверки' : 'Проверим по правилам'}
          </span>
        </label>

        <label style={fieldStyle}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Название</span>
          <Input size="large" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} required />
        </label>

        <FilePicker
          label="Основной файл"
          hint="PDF или DOCX, до 10 МБ"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          file={mainFile}
          onSelect={setMainFile}
        />

        <fieldset style={sectionStyle}>
          <legend style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Видимость</legend>
          <label style={{ display: 'flex', gap: 8 }}><input type="radio" checked={visibility === 'PRIVATE'} onChange={() => setVisibility('PRIVATE')} /> Только участники согласования</label>
          <label style={{ display: 'flex', gap: 8 }}><input type="radio" checked={visibility === 'ORG'} onChange={() => setVisibility('ORG')} /> Вся компания</label>
        </fieldset>

        <label style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={containsSensitive} onChange={(event) => setContainsSensitive(event.target.checked)} />
          <span style={{ ...stackStyle, gap: 4 }}>
            <strong>Содержит чувствительные данные</strong>
            <small style={{ color: 'var(--text-tertiary)' }}>Файл не будет отправлен на автоматический разбор, поля заполните вручную.</small>
          </span>
        </label>

        {containsSensitive && selectedType && (
          <section style={sectionStyle}>
            <Typography.Headline variant="medium">Данные документа</Typography.Headline>
            <FieldInputs definitions={selectedType.fields} values={fields} onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))} />
          </section>
        )}

        {submitError && <Notice tone="danger">{submitError}</Notice>}
        {submitting && <Typography.Text>Проверяем документ</Typography.Text>}
        <BottomActionBar>
          <SubmitButton busy={submitting} disabled={!mainFile || !title.trim()}>Загрузить и проверить</SubmitButton>
        </BottomActionBar>
      </form>
    </DocumentScreen>
  );
}
