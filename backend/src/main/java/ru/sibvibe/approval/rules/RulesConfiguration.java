package ru.sibvibe.approval.rules;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import ru.sibvibe.approval.rules.service.DefaultRuleEngine;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
public class RulesConfiguration {

    @Bean
    RuleEngine ruleEngine(ObjectMapper objectMapper) {
        return new DefaultRuleEngine(Clock.systemUTC(), objectMapper);
    }
}
