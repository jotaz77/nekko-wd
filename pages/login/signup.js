
/**
 * NEKKO WD — Cadastro
 * Validação e criação de contas usando Supabase Auth.
 */

(() => {
  'use strict';

  const form = document.getElementById('signupForm');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const signupButton = document.getElementById('signupButton');
  const message = document.getElementById('message');

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = 'mb-5 rounded-lg border p-3 text-sm';

    if (type === 'success') {
      message.classList.add(
        'border-green-500/20',
        'bg-green-500/10',
        'text-green-400'
      );
    } else {
      message.classList.add(
        'border-red-500/20',
        'bg-red-500/10',
        'text-red-400'
      );
    }
  }

  function clearMessage() {
    message.textContent = '';
    message.className = 'hidden mb-5 rounded-lg border p-3 text-sm';
  }

  function setLoading(loading) {
    signupButton.disabled = loading;
    signupButton.innerHTML = loading
      ? '<span>Criando conta...</span>'
      : '<span>Criar minha conta</span><i data-lucide="arrow-right" class="h-4 w-4"></i>';

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function getFriendlyError(error) {
    const text = String(error?.message || '').toLowerCase();

    if (
      text.includes('user already registered') ||
      text.includes('already registered')
    ) {
      return 'Este e-mail já está cadastrado. Tente fazer login.';
    }

    if (text.includes('password should be at least')) {
      return 'A senha precisa ter pelo menos 8 caracteres.';
    }

    if (text.includes('invalid email')) {
      return 'Informe um endereço de e-mail válido.';
    }

    if (text.includes('rate limit')) {
      return 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.';
    }

    if (
      text.includes('failed to fetch') ||
      text.includes('networkerror')
    ) {
      return 'Não foi possível conectar ao servidor. Verifique sua internet.';
    }

    return error?.message || 'Não foi possível criar sua conta.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (fullName.length < 3) {
      showMessage('Informe seu nome completo.');
      fullNameInput.focus();
      return;
    }

    if (!email) {
      showMessage('Informe seu e-mail.');
      emailInput.focus();
      return;
    }

    if (password.length < 8) {
      showMessage('A senha deve ter pelo menos 8 caracteres.');
      passwordInput.focus();
      return;
    }

    if (password !== confirmPassword) {
      showMessage('As senhas não coincidem.');
      confirmPasswordInput.focus();
      return;
    }

    setLoading(true);

    try {
      const data = await window.NekkoAuth.signUp({
        email,
        password,
        fullName,
        phone: phone || null
      });

      if (data.session) {
        showMessage(
          'Conta criada com sucesso! Vamos preparar sua marcenaria.',
          'success'
        );

        window.setTimeout(() => {
          window.location.href = '../onboarding/company.html';
        }, 1200);

        return;
      }

      showMessage(
        'Cadastro realizado! Verifique seu e-mail para confirmar a conta antes de entrar.',
        'success'
      );

      form.reset();
    } catch (error) {
      console.error('[NEKKO WD] Erro no cadastro:', error);
      showMessage(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  });

})();
