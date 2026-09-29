package ru.sibvibe.approval.approval.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.approval.entity.ApprovalStep;
import ru.sibvibe.approval.approval.event.StuckStepReminderEvent;
import ru.sibvibe.approval.approval.repository.ApprovalStepRepository;
import ru.sibvibe.approval.document.service.DocumentStateService;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Напоминание о документе, застрявшем на этапе (issue #60, COULD). Раз в сутки находит активные шаги,
 * которые висят в {@code PENDING} дольше настроенного порога, и публикует по одному
 * {@link StuckStepReminderEvent} на каждый - {@code bot.NotificationListener} превращает их в сообщения
 * с кнопкой открытия документа, как и обычный запрос решения ({@code ApprovalRequestedEvent}).
 *
 * Порог, период запуска и пауза между напоминаниями по одному шагу - настройка
 * ({@code app.reminders.*}, application.yml), а не константа: для демо достаточно снизить
 * {@code stuck-after-hours} и учащить {@code cron}, не трогая код и не дожидаясь суток.
 *
 * Отбор и отметка «уже напомнили» - один атомарный {@code UPDATE}
 * ({@link ApprovalStepRepository#markStuckAsReminded}), тем же приёмом, что и использование личной
 * ссылки (CLAUDE.md, «Обязательные проверки», п. 2а): повторный или зависший предыдущий запуск
 * планировщика не пришлёт напоминание дважды. Сбой отправки ничего не ломает - порт {@code Notifier}
 * сам не пробрасывает исключения, а слушатель асинхронный и вне этой транзакции.
 *
 * {@link #CLOCK_DRIFT_MARGIN} (ревью #93, пункт 2): наивное {@code lastRemindedAt <= now - cooldown}
 * ловит момент, когда вчерашняя отметка по времени суток чуть позже сегодняшнего запуска - время старта
 * {@code @Scheduled} плавает на доли секунды, и без запаса примерно в половине случаев законное повторное
 * напоминание отсекается, приходя не раз в сутки, а раз в двое. Запас укорачивает эффективный cooldown
 * на час вместо суток - для ежедневного запуска это не меняет частоту напоминаний по существу. Запас - не больше
 * десятой части паузы: при короткой паузе и частом cron фиксированный час обнулил бы её (ревью #93).
 */
@Service
@ConditionalOnProperty(prefix = "app.reminders", name = "enabled", havingValue = "true", matchIfMissing = true)
public class StuckStepReminderJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(StuckStepReminderJob.class);
    private static final Duration CLOCK_DRIFT_MARGIN = Duration.ofHours(1);
    private static final int MARGIN_SHARE_OF_COOLDOWN = 10;

    private final ApprovalStepRepository steps;
    private final DocumentStateService documents;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final Duration stuckAfter;
    private final Duration cooldown;
    private final Duration margin;

    public StuckStepReminderJob(
            ApprovalStepRepository steps,
            DocumentStateService documents,
            ApplicationEventPublisher events,
            Clock clock,
            @Value("${app.reminders.stuck-after-hours:48}") long stuckAfterHours,
            @Value("${app.reminders.cooldown-hours:24}") long cooldownHours
    ) {
        this.steps = steps;
        this.documents = documents;
        this.events = events;
        this.clock = clock;
        this.stuckAfter = Duration.ofHours(stuckAfterHours);
        this.cooldown = Duration.ofHours(cooldownHours);
        Duration share = this.cooldown.dividedBy(MARGIN_SHARE_OF_COOLDOWN);
        this.margin = share.compareTo(CLOCK_DRIFT_MARGIN) < 0 ? share : CLOCK_DRIFT_MARGIN;
    }

    @Scheduled(cron = "${app.reminders.cron:0 0 8 * * *}", zone = "Europe/Moscow")
    @Transactional
    public void remindStuckSteps() {
        // Микросекунды - предел точности timestamptz в PostgreSQL; обрезаем явно, а не полагаемся
        // на то, что драйвер сделает это одинаково при записи в markStuckAsReminded и при последующем
        // чтении в findByLastRemindedAt (ревью #93, пункт 5).
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Instant threshold = now.minus(stuckAfter);
        Instant cooldownBefore = now.minus(cooldown).plus(margin);

        int claimed = steps.markStuckAsReminded(now, threshold, cooldownBefore, ApprovalStep.Decision.PENDING);
        if (claimed == 0) {
            return;
        }

        List<ApprovalStep> reminded = steps.findByLastRemindedAt(now);
        Set<Long> documentIds = reminded.stream().map(ApprovalStep::getDocumentId).collect(Collectors.toSet());
        Map<Long, String> titles = documents.titles(documentIds);

        for (ApprovalStep step : reminded) {
            String title = titles.get(step.getDocumentId());
            if (title == null) {
                LOGGER.warn("Название документа {} не найдено для напоминания по шагу {}",
                        step.getDocumentId(), step.getId());
                continue;
            }
            long waitingHours = Duration.between(step.getActivatedAt(), now).toHours();
            events.publishEvent(new StuckStepReminderEvent(step.getDocumentId(), step.getVersionNo(),
                    step.getStageOrder(), step.getApproverId(), title, waitingHours,
                    step.getKind() == ApprovalStep.Kind.ENDORSEMENT));
        }
        LOGGER.info("Напоминания о застрявших шагах: {}", reminded.size());
    }
}
