package ru.sibvibe.approval.organization.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import ru.sibvibe.approval.organization.entity.AppUser;
import ru.sibvibe.approval.organization.entity.JoinRequest;
import ru.sibvibe.approval.organization.entity.MemberRole;
import ru.sibvibe.approval.organization.entity.Organization;
import ru.sibvibe.approval.organization.entity.OrganizationMember;
import ru.sibvibe.approval.organization.entity.Role;
import ru.sibvibe.approval.organization.repository.AppUserRepository;
import ru.sibvibe.approval.organization.repository.JoinRequestRepository;
import ru.sibvibe.approval.organization.repository.MemberRoleRepository;
import ru.sibvibe.approval.organization.repository.OrganizationMemberRepository;
import ru.sibvibe.approval.organization.repository.OrganizationRepository;
import ru.sibvibe.approval.organization.repository.RoleRepository;
import ru.sibvibe.approval.common.api.DemoActAsForbiddenException;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

/** Операции organization, необходимые фильтру безопасности и демо-контексту. */
@Service
public class OrganizationSecurityService {

    private static final List<UserSeed> DEMO_USERS = List.of(
            new UserSeed("Демо Автор", DefaultRoles.DEPARTMENT_HEAD, false),
            new UserSeed("Демо Юрист", DefaultRoles.LAWYER, false),
            new UserSeed("Демо Бухгалтер", DefaultRoles.ACCOUNTANT, false),
            new UserSeed("Демо Директор", DefaultRoles.DIRECTOR, false),
            new UserSeed("Демо Администратор", DefaultRoles.HR, true)
    );

    private final AppUserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final OrganizationMemberRepository memberRepository;
    private final RoleRepository roleRepository;
    private final MemberRoleRepository memberRoleRepository;
    private final JoinRequestRepository joinRequestRepository;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public OrganizationSecurityService(
            AppUserRepository userRepository,
            OrganizationRepository organizationRepository,
            OrganizationMemberRepository memberRepository,
            RoleRepository roleRepository,
            MemberRoleRepository memberRoleRepository,
            JoinRequestRepository joinRequestRepository,
            JdbcTemplate jdbcTemplate,
            Clock clock
    ) {
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
        this.memberRepository = memberRepository;
        this.roleRepository = roleRepository;
        this.memberRoleRepository = memberRoleRepository;
        this.joinRequestRepository = joinRequestRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Transactional
    public UserInfo findOrCreateUser(long maxUserId, String displayName) {
        Optional<AppUser> existing = userRepository.findByMaxUserId(maxUserId);
        if (existing.isPresent()) {
            return updateDisplayName(existing.orElseThrow(), displayName);
        }

        jdbcTemplate.update("""
                INSERT INTO app_user(max_user_id, full_name, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT (max_user_id) DO NOTHING
                """, maxUserId, displayName,
                OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC));
        AppUser user = userRepository.findByMaxUserId(maxUserId).orElseThrow();
        return updateDisplayName(user, displayName);
    }

    @Transactional(readOnly = true)
    public Optional<MembershipInfo> findRealMembership(long userId) {
        return memberRepository.findFirstByUserIdAndStatusAndDemoFalse(
                        userId, OrganizationMember.Status.ACTIVE)
                .map(this::membershipInfo);
    }

    @Transactional(readOnly = true)
    public Optional<PendingJoinInfo> findPendingJoin(long userId) {
        return joinRequestRepository.findFirstByUserIdAndStatusOrderByCreatedAtDesc(
                        userId, JoinRequest.Status.PENDING)
                .map(request -> new PendingJoinInfo(
                        request.getId(),
                        organizationRepository.findById(request.getOrgId()).orElseThrow().getName(),
                        request.getCreatedAt()));
    }

    @Transactional(readOnly = true)
    public Optional<SandboxInfo> findSandbox(long ownerUserId) {
        return organizationRepository.findFirstByDemoOwnerIdAndDemoTrueOrderByIdDesc(ownerUserId)
                .map(this::sandboxInfo);
    }

    @Transactional(readOnly = true)
    public SandboxUserInfo requireSandboxActor(long ownerUserId, long actorUserId) {
        Organization sandbox = organizationRepository
                .findFirstByDemoOwnerIdAndDemoTrueOrderByIdDesc(ownerUserId)
                .orElseThrow(DemoActAsForbiddenException::new);
        OrganizationMember member = memberRepository.findByOrgIdAndUserIdAndStatusAndDemoTrue(
                        sandbox.getId(), actorUserId, OrganizationMember.Status.ACTIVE)
                .orElseThrow(DemoActAsForbiddenException::new);
        return sandboxUserInfo(member);
    }

    @Transactional
    public SandboxInfo resetSandbox(long ownerUserId) {
        userRepository.findByIdForUpdate(ownerUserId).orElseThrow();
        organizationRepository.findFirstByDemoOwnerIdAndDemoTrueOrderByIdDesc(ownerUserId)
                .ifPresent(previous -> {
                    List<OrganizationMember> activeMembers =
                            memberRepository.findByOrgIdAndStatusAndDemoTrueOrderById(
                                    previous.getId(), OrganizationMember.Status.ACTIVE);
                    activeMembers.forEach(member -> member.setStatus(OrganizationMember.Status.DISABLED));
                    memberRepository.saveAll(activeMembers);
                });
        Instant now = clock.instant();
        Organization sandbox = new Organization();
        sandbox.setName("Демо-компания");
        sandbox.setCreatedBy(ownerUserId);
        sandbox.setCreatedAt(now);
        sandbox.setDemo(true);
        sandbox.setDemoOwnerId(ownerUserId);
        sandbox = organizationRepository.save(sandbox);

        Map<String, Role> roles = new HashMap<>();
        for (DefaultRoles.Seed seed : DefaultRoles.ALL) {
            Role role = new Role();
            role.setOrgId(sandbox.getId());
            role.setCode(seed.code());
            role.setName(seed.name());
            roles.put(seed.code(), roleRepository.save(role));
        }

        for (UserSeed seed : DEMO_USERS) {
            AppUser actor = new AppUser();
            actor.setMaxUserId(nextSyntheticMaxUserId());
            actor.setFullName(seed.name());
            actor.setCreatedAt(now);
            actor = userRepository.save(actor);

            OrganizationMember member = new OrganizationMember();
            member.setOrgId(sandbox.getId());
            member.setUserId(actor.getId());
            member.setStatus(OrganizationMember.Status.ACTIVE);
            member.setAdmin(seed.admin());
            member.setJoinedAt(now);
            member.setDemo(true);
            member = memberRepository.save(member);

            MemberRole memberRole = new MemberRole();
            memberRole.setMemberId(member.getId());
            memberRole.setRoleId(roles.get(seed.roleCode()).getId());
            memberRole.setGrantedBy(ownerUserId);
            memberRole.setGrantedAt(now);
            memberRoleRepository.save(memberRole);
        }
        return sandboxInfo(sandbox);
    }

    private MembershipInfo membershipInfo(OrganizationMember member) {
        Organization organization = organizationRepository.findById(member.getOrgId()).orElseThrow();
        return new MembershipInfo(member.getId(), organization.getId(), organization.getName(),
                rolesFor(member.getId()), member.isAdmin());
    }

    private SandboxInfo sandboxInfo(Organization sandbox) {
        List<SandboxUserInfo> users = memberRepository.findByOrgIdAndStatusAndDemoTrueOrderById(
                        sandbox.getId(), OrganizationMember.Status.ACTIVE).stream()
                .map(this::sandboxUserInfo)
                .toList();
        return new SandboxInfo(sandbox.getId(), sandbox.getName(), users);
    }

    private SandboxUserInfo sandboxUserInfo(OrganizationMember member) {
        AppUser user = userRepository.findById(member.getUserId()).orElseThrow();
        return new SandboxUserInfo(userInfo(user), member.getId(), member.getOrgId(),
                rolesFor(member.getId()), member.isAdmin());
    }

    private List<RoleInfo> rolesFor(long memberId) {
        List<Long> roleIds = memberRoleRepository.findByMemberId(memberId).stream()
                .map(MemberRole::getRoleId)
                .toList();
        if (roleIds.isEmpty()) {
            return List.of();
        }
        List<RoleInfo> result = new ArrayList<>();
        roleRepository.findAllById(roleIds).forEach(role ->
                result.add(new RoleInfo(role.getId(), role.getCode(), role.getName())));
        result.sort(Comparator.comparing(RoleInfo::id));
        return List.copyOf(result);
    }

    private UserInfo userInfo(AppUser user) {
        return new UserInfo(user.getId(), user.getFullName());
    }

    private UserInfo updateDisplayName(AppUser user, String displayName) {
        if (!Objects.equals(user.getFullName(), displayName)) {
            user.setFullName(displayName);
        }
        return userInfo(user);
    }

    private long nextSyntheticMaxUserId() {
        return -ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE);
    }

    public record UserInfo(long id, String displayName) {
    }

    public record RoleInfo(long id, String code, String name) {
    }

    public record MembershipInfo(long memberId, long orgId, String orgName,
                                 List<RoleInfo> roles, boolean admin) {
        public MembershipInfo {
            roles = List.copyOf(roles);
        }
    }

    public record PendingJoinInfo(long id, String orgName, Instant createdAt) {
    }

    public record SandboxUserInfo(UserInfo user, long memberId, long orgId,
                                  List<RoleInfo> roles, boolean admin) {
        public SandboxUserInfo {
            roles = List.copyOf(roles);
        }
    }

    public record SandboxInfo(long orgId, String orgName, List<SandboxUserInfo> users) {
        public SandboxInfo {
            users = List.copyOf(users);
        }
    }

    private record UserSeed(String name, String roleCode, boolean admin) {
    }
}
