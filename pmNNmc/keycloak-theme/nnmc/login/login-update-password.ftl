<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>АО "ННМЦ" — Новый пароль</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${url.resourcesPath}/css/style.css?v=20260514-password">
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
      <div class="card">

        <div class="card-header">
          <div class="card-logo-wrap">
            <img src="${url.resourcesPath}/img/nnmc-logo.png?v=20260513" alt="ННМЦ" class="card-logo" width="84" height="84" style="width:84px;height:84px;max-width:84px;max-height:84px;object-fit:contain;" />
          </div>
          <h2 class="card-title">Создайте новый пароль</h2>
          <p class="card-sub">Стандартный пароль используется только для первого входа</p>
        </div>

        <#if message?has_content>
          <div class="alert alert-${message.type}">
            ${message.summary?no_esc}
          </div>
        </#if>

        <form action="${url.loginAction}" method="post" class="form">

          <div class="field">
            <label for="password-new">Новый пароль</label>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input id="password-new" name="password-new" type="password"
                autocomplete="new-password"
                placeholder="Введите новый пароль"
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
                placeholder="Повторите новый пароль"
              />
            </div>
            <#if messagesPerField.existsError('password-confirm')>
              <span class="field-error">${messagesPerField.get('password-confirm')}</span>
            </#if>
          </div>

          <input type="hidden" name="logout-sessions" value="on" />

          <#if isAppInitiatedAction??>
            <div class="auth-actions auth-actions-before-submit">
              <button type="submit" name="cancel-aia" value="true" class="auth-link auth-link-secondary">Отмена</button>
            </div>
          </#if>

          <button type="submit" class="btn-submit">Сохранить пароль</button>

        </form>

      </div>
    </main>

    <footer class="footer">© 2026 ТОО "Biocraft Digital"</footer>
  </div>
</body>
</html>
