<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>АО "ННМЦ" - Регистрация недоступна</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${url.resourcesPath}/css/style.css?v=20260515-register-disabled">
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
          <p class="card-sub">Создание учетной записи временно ограничено</p>
        </div>

        <div class="inline-notice inline-notice-warning" role="status" aria-live="polite">
          Данная функция пока недоступна. Если хотите зарегистрироваться, обратитесь в IT-службу.
        </div>

        <div class="auth-actions">
          <a href="${url.loginUrl}" class="auth-link auth-link-secondary">Вернуться ко входу</a>
        </div>

      </div>
    </main>

    <footer class="footer">© 2026 ТОО "Biocraft Digital"</footer>
  </div>
</body>
</html>
