import { Input, Radio, Switch, Typography } from '@maxhub/max-ui';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDocument, getDocumentTypes } from '../../api/documents';
import { errorMessage } from '../../api/errors';
import type { DocumentType, Visibility } from '../../api/types';
import { FilePicker } from '../../components/base/FilePicker';
import { ErrorState, Button } from '../../ui';
import { ROUTE_PATTERNS, documentCheckPath } from '../../routes/paths';
import {
  DocumentScreen,
  FieldInputs,
  LoadingState,
  Notice,
  SubmitButton,
  fieldStyle,
  inputStyle,
  labelStyle,
  sectionStyle,
  stackStyle,
} from './DocumentFormParts';

const FORM_ID = 'document-upload-form';
const UPLOAD_BACK = { to: ROUTE_PATTERNS.home, label: 'Главная' };
const AUTO = 'auto';

/**
 * Что будет проверено — подпись под выбором типа. Человек, загрузивший свой файл, не обязан
 * знать наши типы: по умолчанию тип выбирает ИИ, а любой документ проверяется хотя бы по общим
 * реквизитам (тест 23.09, #86: раньше по умолчанию стоял «Любой файл» без проверки вовсе).
 */
const TYPE_HINTS: Record<string, string> = {
  [AUTO]: 'Определим по тексту документа.',
  OFFICIAL_MEMO: 'Проверим по ГОСТ Р 7.0.97-2016: адресат, дата, номер, подпись.',
  VACATION_REQUEST: 'Проверим сотрудника, вид отпуска, даты и число дней.',
  SUPPORT_MEASURE_REQUEST: 'Проверим заявителя, ИНН, категорию МСП и вид поддержки.',
  BUSINESS_TRIP_REQUEST: 'Проверим сотрудника, место, цель, дату начала и срок.',
  GENERIC: 'Проверим дату, номер, заголовок и подпись.',
};

/** Сначала типы с подробной проверкой, «Другой документ» — последним. */
function sortTypes(types: DocumentType[]): DocumentType[] {
  return [...types].sort((left, right) => Number(left.code === 'GENERIC') - Number(right.code === 'GENERIC'));
}

export function DocumentUploadScreen() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<DocumentType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeKey, setTypeKey] = useState<string>(AUTO);
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
      setTypes(sortTypes(await getDocumentTypes()));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }

  useEffect(() => {
    void loadTypes();
  }, []);

  const selectedType = useMemo(
    () => (typeKey === AUTO ? null : types?.find((type) => String(type.id) === typeKey) ?? null),
    [typeKey, types],
  );
  // С чувствительными данными текст в ИИ не уходит — тип определить нельзя, его выбирает человек.
  const needsExplicitType = containsSensitive && typeKey === AUTO;
  const hint = TYPE_HINTS[selectedType?.code ?? AUTO] ?? 'Проверим по правилам компании.';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mainFile || needsExplicitType) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const card = await createDocument({
        documentTypeId: selectedType?.id ?? null,
        title,
        visibility,
        containsSensitive,
        fields: containsSensitive ? fields : undefined,
        main: mainFile,
      });
      navigate(documentCheckPath(card.id), { state: { card } });
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!types && !loadError) return <LoadingState />;
  if (loadError) {
    return <DocumentScreen title="Новый документ" back={UPLOAD_BACK}><ErrorState message={loadError} onRetry={() => void loadTypes()} /></DocumentScreen>;
  }
  if (!types || types.length === 0) {
    return <DocumentScreen title="Новый документ" back={UPLOAD_BACK}><Notice>Типы документов пока не настроены. Обратитесь к администратору.</Notice></DocumentScreen>;
  }

  return (
    <DocumentScreen
      title="Новый документ"
      back={UPLOAD_BACK}
      footer={
        <SubmitButton form={FORM_ID} busy={submitting} disabled={!mainFile || needsExplicitType}>
          Загрузить и проверить
        </SubmitButton>
      }
    >
      {types.some((type) => type.code === 'OFFICIAL_MEMO') && (
        <div style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ ...stackStyle, gap: 4 }}>
            <strong>Нет файла?</strong>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Служебную записку можно заполнить прямо здесь.</span>
          </span>
          <div style={{ flex: 'none' }}>
            <Button compact variant="secondary" type="button" onClick={() => navigate(ROUTE_PATTERNS.memoForm)}>
              Заполнить
            </Button>
          </div>
        </div>
      )}
      <form id={FORM_ID} style={stackStyle} onSubmit={(event) => void submit(event)}>
        <FilePicker
          label="Документ"
          hint="PDF или DOCX, до 10 МБ"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          file={mainFile}
          onSelect={setMainFile}
        />

        <label style={fieldStyle}>
          <span style={labelStyle}>Тип документа</span>
          <select
            style={inputStyle}
            value={typeKey}
            onChange={(event) => {
              setTypeKey(event.target.value);
              setFields({});
            }}
          >
            <option value={AUTO} disabled={containsSensitive}>Определить автоматически</option>
            {types.map((type) => <option key={type.id} value={String(type.id)}>{type.name}</option>)}
          </select>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{hint}</span>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Название</span>
          <Input
            size="large"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            placeholder="Необязательно — возьмём из документа"
          />
        </label>

        {/* Не fieldset: его рамка и legend у браузера рисуются поверх нашей карточки. */}
        <div role="radiogroup" aria-label="Видимость" style={{ ...sectionStyle, gap: 12 }}>
          <strong>Кто видит документ</strong>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio name="visibility" checked={visibility === 'PRIVATE'} onChange={() => setVisibility('PRIVATE')} />
            Только участники согласования
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio name="visibility" checked={visibility === 'ORG'} onChange={() => setVisibility('ORG')} />
            Вся компания
          </label>
        </div>

        <label style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'center' }}>
          <Switch checked={containsSensitive} onChange={(event) => setContainsSensitive(event.target.checked)} />
          <span style={{ ...stackStyle, gap: 4 }}>
            <strong>Содержит чувствительные данные</strong>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Текст не распознаётся автоматически — поля заполните сами.</span>
          </span>
        </label>

        {needsExplicitType && <Notice tone="danger">С чувствительными данными тип нужно выбрать самому.</Notice>}

        {containsSensitive && selectedType && (
          <section style={sectionStyle}>
            <Typography.Headline variant="medium">Данные документа</Typography.Headline>
            <FieldInputs typeCode={selectedType.code} definitions={selectedType.fields} values={fields} onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))} />
          </section>
        )}

        {submitError && <Notice tone="danger">{submitError}</Notice>}
        {submitting && (
          <Notice>
            {containsSensitive
              ? 'Проверяем документ…'
              : 'Распознаём и проверяем документ — до минуты.'}
          </Notice>
        )}
      </form>
    </DocumentScreen>
  );
}
