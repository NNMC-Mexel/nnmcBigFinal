<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>АО "ННМЦ" — Регистрация</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${url.resourcesPath}/css/style.css?v=20260513-register">
</head>
<body>
  <div class="page">

    <header class="header">
      <div class="brand">
        <img src="${url.resourcesPath}/img/nnmc-logo.png?v=20260513" alt="ННМЦ" class="brand-logo" width="34" height="34" style="width:34px;height:34px;max-width:34px;max-height:34px;object-fit:contain;" />
        <div>
          <div class="brand-title">АО "ННМЦ"</div>
          <div class="brand-sub">Корпоративная система</div>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="card card-register">

        <div class="card-header register-header">
          <div class="card-logo-wrap card-logo-wrap-small">
            <img src="${url.resourcesPath}/img/nnmc-logo.png?v=20260513" alt="ННМЦ" class="card-logo card-logo-small" width="72" height="72" style="width:72px;height:72px;max-width:72px;max-height:72px;object-fit:contain;" />
          </div>
          <h2 class="card-title">Регистрация</h2>
          <p class="card-sub">Создание учетной записи корпоративной системы</p>
        </div>

        <#if message?has_content>
          <div class="alert alert-${message.type}">
            ${message.summary?no_esc}
          </div>
        </#if>

        <form action="${url.registrationAction}" method="post" class="form register-form">

          <#if !realm.registrationEmailAsUsername>
            <div class="field">
              <label for="username">Логин</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21a8 8 0 0 0-16 0"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <input id="username" name="username" type="text"
                  value="${(register.formData.username!'')}"
                  autocomplete="username"
                  placeholder="Введите логин"
                />
              </div>
              <#if messagesPerField.existsError('username')>
                <span class="field-error">${messagesPerField.get('username')}</span>
              </#if>
            </div>
          </#if>

          <div class="field">
            <label for="email">Email</label>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input id="email" name="email" type="email"
                value="${(register.formData.email!'')}"
                autocomplete="email"
                placeholder="Введите email"
              />
            </div>
            <#if messagesPerField.existsError('email')>
              <span class="field-error">${messagesPerField.get('email')}</span>
            </#if>
          </div>

          <div class="field">
            <label for="firstName">Имя</label>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21a8 8 0 0 0-16 0"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input id="firstName" name="firstName" type="text"
                value="${(register.formData.firstName!'')}"
                autocomplete="given-name"
                placeholder="Введите имя"
              />
            </div>
            <#if messagesPerField.existsError('firstName')>
              <span class="field-error">${messagesPerField.get('firstName')}</span>
            </#if>
          </div>

          <div class="field">
            <label for="lastName">Фамилия</label>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21a8 8 0 0 0-16 0"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input id="lastName" name="lastName" type="text"
                value="${(register.formData.lastName!'')}"
                autocomplete="family-name"
                placeholder="Введите фамилию"
              />
            </div>
            <#if messagesPerField.existsError('lastName')>
              <span class="field-error">${messagesPerField.get('lastName')}</span>
            </#if>
          </div>

          <#if passwordRequired??>
            <div class="field">
              <label for="password">Пароль</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input id="password" name="password" type="password"
                  autocomplete="new-password"
                  placeholder="Введите пароль"
                />
              </div>
              <#if messagesPerField.existsError('password')>
                <span class="field-error">${messagesPerField.get('password')}</span>
              </#if>
            </div>

            <div class="field">
              <label for="password-confirm">Подтверждение пароля</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input id="password-confirm" name="password-confirm" type="password"
                  autocomplete="new-password"
                  placeholder="Повторите пароль"
                />
              </div>
              <#if messagesPerField.existsError('password-confirm')>
                <span class="field-error">${messagesPerField.get('password-confirm')}</span>
              </#if>
            </div>
          </#if>

          <button type="submit" class="btn-submit">Зарегистрироваться</button>

          <div class="auth-actions">
            <a href="${url.loginUrl}" class="auth-link auth-link-secondary">Вернуться ко входу</a>
          </div>

        </form>

      </div>
    </main>

    <footer class="footer">© 2026 ТОО "Biocraft Digital"</footer>
  </div>
</body>
</html>
