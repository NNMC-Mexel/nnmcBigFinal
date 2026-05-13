<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>АО "ННМЦ" — Данные профиля</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${url.resourcesPath}/css/style.css">
</head>
<body>
  <div class="page">

    <header class="header">
      <div class="brand">
        <img src="${url.resourcesPath}/img/nnmc-logo.png?v=20260513" alt="ННМЦ" class="brand-logo" />
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
            <img src="${url.resourcesPath}/img/nnmc-logo.png?v=20260513" alt="ННМЦ" class="card-logo" />
          </div>
          <h2 class="card-title">Данные профиля</h2>
          <p class="card-sub">Заполните обязательные поля для входа в систему</p>
        </div>

        <#if message?has_content>
          <div class="alert alert-${message.type}">
            ${message.summary?no_esc}
          </div>
        </#if>

        <form action="${url.loginAction}" method="post" class="form">

          <div class="field">
            <label for="email">Email</label>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input id="email" name="email" type="email"
                value="${(user.email!'')}"
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
                value="${(user.firstName!'')}"
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
                value="${(user.lastName!'')}"
                autocomplete="family-name"
                placeholder="Введите фамилию"
              />
            </div>
            <#if messagesPerField.existsError('lastName')>
              <span class="field-error">${messagesPerField.get('lastName')}</span>
            </#if>
          </div>

          <button type="submit" class="btn-submit">Сохранить и продолжить</button>

        </form>

      </div>
    </main>

    <footer class="footer">© 2026 ТОО "Biocraft Digital"</footer>
  </div>
</body>
</html>
