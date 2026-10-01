
/**
 * NEKKO WD — Login
 * Responsável por login, cadastro e recuperação de senha.
 */

(() => {
  'use strict';

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginButton = document.getElementById('loginButton');
  const signupButton = document.getElementById('showSignup');
  const forgotButton = document.getElementById('forgotPassword');
  const message = document.getElementById('message');

  let signupMode = false;

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = 'mb-4 rounded-lg p-3 text-sm';

    if (type === 'success') {
      message.classList.add(
        'bg-green-500/10',
        'text-green-400',
        'border',
        'border-green-500/20'
      );
    } else {
      message.classList.add(
        'bg-red-500/10',
        'text-red-400',
        'border',
        'border-red-500/20'
      );
    }
  }

  function clearMessage() {
    message.textContent = '';
    message.className = 'hidden mb-4 rounded-lg p-3 text-sm';
  }

  function setLoading(loading) {
    loginButton.disabled = loading;
    signupButton.disabled = loading;
    forgotButton.disabled = loading;

    loginButton.textContent = loading
      ? 'Aguarde...'
      : signupMode
        ? 'Criar conta'
        : 'Entrar';
  }

  function getFriendlyError(error) {
    const text = String(error?.message || '').toLowerCase();

    if (
      text.includes('invalid login credentials') ||
      text.includes('invalid_credentials')
    ) {
      return 'E-mail ou senha incorretos.';
    }

    if (text.includes('email not confirmed')) {
      return 'Confirme seu e-mail antes de entrar.';
    }

    if (
      text.includes('user already registered') ||
      text.includes('already registered')
    ) {
      return 'Este e-mail já possui uma conta. Tente entrar.';
    }

    if (text.includes('password should be at least')) {
      return 'A senha precisa ter pelo menos 8 caracteres.';
    }

    if (text.includes('rate limit')) {
      return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    }

    return error?.message || 'Não foi possível concluir a operação.';
  }

  async function redirectAfterLogin() {
    const bootstrap = window.NekkoBootstrap || window.Bootstrap;

    if (!bootstrap || typeof bootstrap.init !== "function") {
        throw new Error(
            "Bootstrap não carregado. Verifique o arquivo bootstrap.js e sua inclusão no login.html."
        );
    }
    
    const result = await bootstrap.init();

    if (result.status === 'unauthenticated') {
      showMessage('Sua sessão não foi encontrada. Entre novamente.');
      return;
    }

    if (result.status === 'no_company') {
      window.location.href = '../onboarding/company.html';
      return;
    }

    if (result.status === 'no_store') {
      window.location.href = '../onboarding/stores.html';
      return;
    }

    if (result.status === 'ready') {
      window.location.href = '../menu/index.html';
      return;
    }

    showMessage('Não foi possível identificar sua empresa.');
  }

  signupButton.addEventListener('click', () => {
    signupMode = !signupMode;
    clearMessage();

    if (signupMode) {
      window.location.href = 'signup.html';
      return;
    }

    loginButton.textContent = 'Entrar';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(true);

    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (signupMode) {
        await window.NekkoAuth.signUp({
          email,
          password,
          fullName: email.split('@')[0]
        });

        showMessage(
          'Cadastro solicitado. Se a confirmação de e-mail estiver habilitada, confira sua caixa de entrada.',
          'success'
        );

        return;
      }

      await window.NekkoAuth.signIn({ email, password });

      await redirectAfterLogin();
    } catch (error) {
      console.error('[NEKKO WD] Erro de autenticação:', error);
      showMessage(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  });

  forgotButton.addEventListener('click', async () => {
    clearMessage();

    const email = emailInput.value.trim();

    if (!email) {
      showMessage('Digite seu e-mail antes de solicitar a recuperação.');
      emailInput.focus();
      return;
    }

    forgotButton.disabled = true;

    try {
      await window.NekkoAuth.resetPassword(email);

      showMessage(
        'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.',
        'success'
      );
    } catch (error) {
      console.error('[NEKKO WD] Erro ao recuperar senha:', error);
      showMessage(getFriendlyError(error));
    } finally {
      forgotButton.disabled = false;
    }
  });

  // Se já houver sessão, encaminha o usuário para a etapa adequada.
  window.NekkoAuth.getSession()
    .then((session) => {
      if (session) {
        return redirectAfterLogin();
      }
    })
    .catch((error) => {
      console.error('[NEKKO WD] Erro ao verificar sessão:', error);
    });
})();
