package ru.sibvibe.approval.organization.service;

import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Часовые пояса компании (#56, аудит 27.09): «сегодня» для правил, периодов и показателей считается по поясу компании,
 * а не по Москве. Допустимы только пояса России — тот же список, что в ограничении БД (017-organization-time-zone.sql)
 * и в выборе города на экране. Для каждого пояса — город по умолчанию: его получает демо-компания, созданная
 * из этого пояса.
 */
public final class CompanyTimeZones {

    public static final String DEFAULT_ZONE = "Europe/Moscow";
    public static final String DEFAULT_CITY = "Москва";

    private static final Map<String, String> CITY_BY_ZONE = new LinkedHashMap<>();

    static {
        CITY_BY_ZONE.put("Europe/Kaliningrad", "Калининград");
        CITY_BY_ZONE.put("Europe/Moscow", "Москва");
        CITY_BY_ZONE.put("Europe/Samara", "Самара");
        CITY_BY_ZONE.put("Asia/Yekaterinburg", "Екатеринбург");
        CITY_BY_ZONE.put("Asia/Omsk", "Омск");
        CITY_BY_ZONE.put("Asia/Novosibirsk", "Новосибирск");
        CITY_BY_ZONE.put("Asia/Krasnoyarsk", "Красноярск");
        CITY_BY_ZONE.put("Asia/Irkutsk", "Иркутск");
        CITY_BY_ZONE.put("Asia/Yakutsk", "Якутск");
        CITY_BY_ZONE.put("Asia/Vladivostok", "Владивосток");
        CITY_BY_ZONE.put("Asia/Magadan", "Магадан");
        CITY_BY_ZONE.put("Asia/Kamchatka", "Петропавловск-Камчатский");
    }

    private CompanyTimeZones() {
    }

    public static boolean isSupported(String zone) {
        return zone != null && CITY_BY_ZONE.containsKey(zone);
    }

    /** Пояс компании для расчётов; незнакомое значение (его не пропустит и БД) — Москва, а не ошибка посреди проверки. */
    public static ZoneId zoneOf(String zone) {
        return ZoneId.of(isSupported(zone) ? zone : DEFAULT_ZONE);
    }

    /** Город по умолчанию для пояса; пояс не из списка — Москва. */
    public static String defaultCity(String zone) {
        return CITY_BY_ZONE.getOrDefault(isSupported(zone) ? zone : DEFAULT_ZONE, DEFAULT_CITY);
    }
}
