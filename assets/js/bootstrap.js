// NEKKO WD — Inicialização da aplicação
(() => {
  'use strict';

  async function init() {
    if (!window.NekkoAuth || !window.NekkoAPI || !window.NekkoStorage) {
      throw new Error(
        '[NEKKO WD] Auth, API ou Storage não foram carregados.'
      );
    }

    const session = await window.NekkoAuth.getSession();

    if (!session) {
      window.NekkoStorage.clear();

      return {
        status: 'unauthenticated',
        user: null
      };
    }

    const user = await window.NekkoAuth.getCurrentUser();

    if (!user) {
      window.NekkoStorage.clear();

      return {
        status: 'unauthenticated',
        user: null
      };
    }

    // Busca os vínculos do usuário com as empresas.
    const memberships = await window.NekkoAPI.selectMany(
      'company_members',
      {
        filters: {
          user_id: user.id
        }
      }
    );

    const activeMemberships = memberships.filter(
      membership => membership.is_active !== false
    );

    if (activeMemberships.length === 0) {
      window.NekkoStorage.write({ user });

      return {
        status: 'no_company',
        user
      };
    }

    // Mantém a empresa previamente selecionada, se o vínculo existir.
    const savedContext = window.NekkoStorage.getContext();

    const membership =
      activeMemberships.find(
        item => item.company_id === savedContext.company_id
      ) || activeMemberships[0];

    const company = await window.NekkoAPI.selectOne(
      'companies',
      {
        filters: {
          id: membership.company_id
        }
      }
    );

    if (!company) {
      window.NekkoStorage.write({ user });

      return {
        status: 'no_company',
        user
      };
    }

    // Busca as filiais disponíveis para a empresa.
    const allStores = await window.NekkoAPI.selectMany(
      'stores',
      {
        filters: {
          company_id: company.id
        }
      }
    );

    const stores = allStores.filter(
      store => store.is_active !== false
    );

    if (stores.length === 0) {
      window.NekkoStorage.write({
        user,
        company,
        membership,
        stores: [],
        active_store: null
      });

      return {
        status: 'no_store',
        user,
        company,
        membership,
        stores: []
      };
    }

    // Recupera a filial escolhida anteriormente, se ainda existir.
    const activeStore =
      stores.find(
        store => store.id === savedContext.active_store_id
      ) || stores.find(
        store => store.id === membership.store_id
      ) || stores[0];

    const context = {
      user,
      company,
      membership,
      stores,
      active_store: activeStore,
      company_id: company.id,
      active_store_id: activeStore.id,
      role: membership.role
    };

    window.NekkoStorage.write(context);

    return {
      status: 'ready',
      ...context
    };
  }

  window.NekkoBootstrap = Object.freeze({
    init
  });
})();
