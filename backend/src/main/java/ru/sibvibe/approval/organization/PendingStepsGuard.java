package ru.sibvibe.approval.organization;

import java.util.Collection;

/**
 * Есть ли у человека незавершённые шаги согласования.
 *
 * Нужен, чтобы не снять роль и не отключить участника, от которого ждут решения:
 * иначе документ зависнет навсегда. Реализует approval, потому что organization
 * не вправе вызывать approval (ARCHITECTURE.md, раздел 2).
 */
public interface PendingStepsGuard {

    /** Есть ли у пользователя шаги в ожидании решения в любой роли. */
    boolean hasPendingSteps(long userId);

    /** Есть ли у пользователя шаги в ожидании решения в одной из этих ролей. */
    boolean hasPendingSteps(long userId, Collection<Long> roleIds);
}
