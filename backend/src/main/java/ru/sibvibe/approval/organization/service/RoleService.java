package ru.sibvibe.approval.organization.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.sibvibe.approval.common.dto.RoleRef;
import ru.sibvibe.approval.common.dto.UserRef;
import ru.sibvibe.approval.common.security.CurrentUser;
import ru.sibvibe.approval.organization.entity.AppUser;
import ru.sibvibe.approval.organization.entity.MemberRole;
import ru.sibvibe.approval.organization.entity.OrganizationMember;
import ru.sibvibe.approval.organization.entity.Role;
import ru.sibvibe.approval.organization.repository.AppUserRepository;
import ru.sibvibe.approval.organization.repository.MemberRoleRepository;
import ru.sibvibe.approval.organization.repository.OrganizationMemberRepository;
import ru.sibvibe.approval.organization.repository.RoleRepository;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Предметные роли компании. Права администратора — не роль, поэтому здесь их нет. */
@Service
public class RoleService {

    private final RoleRepository roleRepository;
    private final MemberRoleRepository memberRoleRepository;
    private final OrganizationMemberRepository memberRepository;
    private final AppUserRepository userRepository;

    public RoleService(
            RoleRepository roleRepository,
            MemberRoleRepository memberRoleRepository,
            OrganizationMemberRepository memberRepository,
            AppUserRepository userRepository
    ) {
        this.roleRepository = roleRepository;
        this.memberRoleRepository = memberRoleRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<RoleRef> list(CurrentUser actor) {
        long orgId = OrganizationAccess.requireMemberOrg(actor);
        return roleRepository.findByOrgIdOrderById(orgId).stream().map(RoleService::ref).toList();
    }

    @Transactional
    public RoleRef create(CurrentUser actor, String rawName) {
        long orgId = OrganizationAccess.requireAdminOrg(actor);
        String name = cleanName(rawName);
        if (roleRepository.existsByOrgIdAndNameIgnoreCase(orgId, name)) {
            throw OrganizationErrors.validation("Роль с таким названием уже есть");
        }
        Role role = new Role();
        role.setOrgId(orgId);
        role.setCode("CUSTOM_" + UUID.randomUUID().toString().replace("-", "")
                .substring(0, 12).toUpperCase(Locale.ROOT));
        role.setName(name);
        return ref(roleRepository.save(role));
    }

    @Transactional
    public RoleRef rename(CurrentUser actor, long roleId, String rawName) {
        long orgId = OrganizationAccess.requireAdminOrg(actor);
        Role role = roleRepository.findByIdAndOrgId(roleId, orgId).orElseThrow(OrganizationErrors::notFound);
        String name = cleanName(rawName);
        if (roleRepository.existsByOrgIdAndNameIgnoreCaseAndIdNot(orgId, name, roleId)) {
            throw OrganizationErrors.validation("Роль с таким названием уже есть");
        }
        role.setName(name);
        return ref(role);
    }

    /** Активные носители роли — из них автор выбирает согласующего. Роль ищется только в своей компании. */
    @Transactional(readOnly = true)
    public List<UserRef> carriers(CurrentUser actor, long roleId) {
        long orgId = OrganizationAccess.requireMemberOrg(actor);
        roleRepository.findByIdAndOrgId(roleId, orgId).orElseThrow(OrganizationErrors::notFound);
        Set<Long> memberIds = memberRoleRepository.findByRoleId(roleId).stream()
                .map(MemberRole::getMemberId).collect(Collectors.toSet());
        Set<Long> userIds = memberRepository.findAllById(memberIds).stream()
                .filter(member -> member.getOrgId() == orgId
                        && member.getStatus() == OrganizationMember.Status.ACTIVE)
                .map(OrganizationMember::getUserId).collect(Collectors.toSet());
        return userRepository.findAllById(userIds).stream()
                .sorted(Comparator.comparing(AppUser::getFullName).thenComparing(AppUser::getId))
                .map(user -> new UserRef(user.getId(), user.getFullName()))
                .toList();
    }

    private static String cleanName(String rawName) {
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty() || name.length() > 100) {
            throw OrganizationErrors.validation("Название роли — от 1 до 100 символов");
        }
        return name;
    }

    private static RoleRef ref(Role role) {
        return new RoleRef(role.getId(), role.getCode(), role.getName());
    }
}
