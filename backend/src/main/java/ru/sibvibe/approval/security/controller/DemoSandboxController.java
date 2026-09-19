package ru.sibvibe.approval.security.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.sibvibe.approval.common.api.NotFoundException;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.security.dto.SandboxResponse;
import ru.sibvibe.approval.security.service.SessionViewService;

@RestController
@RequestMapping("/api/v1/demo/sandbox")
public class DemoSandboxController {

    private final SessionViewService sessionViewService;

    public DemoSandboxController(SessionViewService sessionViewService) {
        this.sessionViewService = sessionViewService;
    }

    @GetMapping
    public SandboxResponse get(@AuthenticationPrincipal CurrentUser currentUser) {
        requireDemoMode();
        return sessionViewService.sandbox(currentUser.authenticatedUser().id());
    }

    @PostMapping
    public SandboxResponse reset(@AuthenticationPrincipal CurrentUser currentUser) {
        requireDemoMode();
        return sessionViewService.resetSandbox(currentUser.authenticatedUser().id());
    }

    private void requireDemoMode() {
        if (!sessionViewService.demoMode()) {
            throw new NotFoundException();
        }
    }
}
