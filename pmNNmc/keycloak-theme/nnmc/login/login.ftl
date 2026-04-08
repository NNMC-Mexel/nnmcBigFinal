<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>АО "ННМЦ" — Вход в систему</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${url.resourcesPath}/css/style.css">
</head>
<body>
  <div class="page">

    <header class="header">
      <div class="brand">
        <img src="${url.resourcesPath}/img/logo.png" alt="ННМЦ" class="brand-logo" />
        <div>
          <div class="brand-title">АО "ННМЦ"</div>
          <div class="brand-sub">Корпоративная система</div>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="card">

        <div class="card-header">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
          </div>
          <h2 class="card-title">Вход в систему</h2>
          <p class="card-sub">АО "ННМЦ" — корпоративная система</p>
        </div>

        <#if message?has_content>
          <div class="alert alert-${message.type}">
            ${message.summary?no_esc}
          </div>
        </#if>

        <form action="${url.loginAction}" method="post" class="form">

          <div class="field">
            <label for="username">Логин или Email</label>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input id="username" name="username" type="text"
                value="${(login.username!'')}"
                autocomplete="off" autofocus
                placeholder="Введите логин или email"
              />
            </div>
            <#if messagesPerField.existsError('username')>
              <span class="field-error">${messagesPerField.get('username')}</span>
            </#if>
          </div>

          <div class="field">
            <label for="password">Пароль</label>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input id="password" name="password" type="password"
                autocomplete="off"
                placeholder="Введите пароль"
              />
            </div>
            <#if messagesPerField.existsError('password')>
              <span class="field-error">${messagesPerField.get('password')}</span>
            </#if>
          </div>

          <div class="row-between">
            <#if realm.rememberMe>
              <label class="checkbox-label">
                <input type="checkbox" name="rememberMe" <#if login.rememberMe??>checked</#if>>
                Запомнить меня
              </label>
            </#if>
            <#if realm.resetPasswordAllowed>
              <a href="${url.loginResetCredentialsUrl}" class="link-small">Забыли пароль?</a>
            </#if>
          </div>

          <button type="submit" class="btn-submit">Войти</button>

        </form>

      </div>
    </main>

    <footer class="footer">© 2026 ТОО "Biocraft Digital"</footer>
  </div>
</body>
</html>
