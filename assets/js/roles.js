// NEKKO WD — Papéis e permissões
(() => {
  'use strict';

  const ROLES = Object.freeze({
    CEO: 'CEO',
    MANAGER: 'MANAGER',
    EMPLOYEE: 'EMPLOYEE',
    TECHNICIAN: 'TECHNICIAN'
  });

  const ROLE_LABELS = Object.freeze({
    [ROLES.CEO]: 'Proprietário',
    [ROLES.MANAGER]: 'Gerente',
    [ROLES.EMPLOYEE]: 'Funcionário',
    [ROLES.TECHNICIAN]: 'Marceneiro / Técnico'
  });

  function normalizeRole(role) {
    if (typeof role !== 'string') {
      return null;
    }

    const normalized = role.trim().toUpperCase();

    return Object.values(ROLES).includes(normalized)
      ? normalized
      : null;
  }

  function getRoleLabel(role) {
    const normalized = normalizeRole(role);

    return normalized ? ROLE_LABELS[normalized] : 'Sem função definida';
  }

  function isCEO(role) {
    return normalizeRole(role) === ROLES.CEO;
  }

  function canManageCompany(role) {
    const normalized = normalizeRole(role);

    return [
      ROLES.CEO,
      ROLES.MANAGER
    ].includes(normalized);
  }

  function canManageStores(role) {
    return isCEO(role);
  }

  function canManageTeam(role) {
    return canManageCompany(role);
  }

  window.NekkoRoles = Object.freeze({
    ROLES,
    ROLE_LABELS,
    normalizeRole,
    getRoleLabel,
    isCEO,
    canManageCompany,
    canManageStores,
    canManageTeam
  });
})();
