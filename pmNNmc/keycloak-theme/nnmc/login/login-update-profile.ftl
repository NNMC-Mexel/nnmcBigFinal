<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>АО "ННМЦ" — Данные профиля</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${url.resourcesPath}/css/style.css?v=20260514-profile-fields">
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
          <h2 class="card-title">Данные профиля</h2>
          <p class="card-sub">Заполните только недостающие данные</p>
        </div>

        <#if message?has_content>
          <div class="alert alert-${message.type}">
            ${message.summary?no_esc}
          </div>
        </#if>

        <form action="${url.loginAction}" method="post" class="form">

          <#assign visibleFields = 0>
          <#if profile?? && profile.attributes??>
            <#list profile.attributes as attribute>
              <#if attribute.name != "locale">
                <#assign fieldName = attribute.name>
                <#assign fieldValue = (attribute.value!'')>
                <#if !fieldValue?has_content && attribute.values?? && attribute.values?has_content>
                  <#assign fieldValue = attribute.values[0]!''>
                </#if>
                <#assign hasError = messagesPerField.existsError(fieldName)>
                <#assign shouldShow = hasError || !fieldValue?has_content>

                <#if shouldShow>
                  <#assign visibleFields = visibleFields + 1>
                  <div class="field">
                    <label for="${fieldName}">
                      <#if fieldName == "email">Email<#elseif fieldName == "firstName">Имя<#elseif fieldName == "lastName">Фамилия<#elseif fieldName == "username">Логин<#else>${fieldName}</#if>
                      <#if (attribute.required)!false> *</#if>
                    </label>
                    <div class="input-wrap">
                      <#if fieldName == "email">
                        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                      <#else>
                        <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20 21a8 8 0 0 0-16 0"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </#if>
                      <input id="${fieldName}" name="${fieldName}" type="<#if fieldName == 'email'>email<#else>text</#if>"
                        value="${fieldValue?html}"
                        autocomplete="<#if fieldName == 'email'>email<#elseif fieldName == 'firstName'>given-name<#elseif fieldName == 'lastName'>family-name<#else>off</#if>"
                        placeholder="<#if fieldName == 'email'>Введите email<#elseif fieldName == 'firstName'>Введите имя<#elseif fieldName == 'lastName'>Введите фамилию<#elseif fieldName == 'username'>Введите логин<#else>Введите значение</#if>"
                      />
                    </div>
                    <#if hasError>
                      <span class="field-error">${messagesPerField.get(fieldName)}</span>
                    </#if>
                  </div>
                <#else>
                  <input type="hidden" name="${fieldName}" value="${fieldValue?html}" />
                </#if>
              </#if>
            </#list>
          <#else>
            <#assign emailValue = (user.email!'')>
            <#assign firstNameValue = (user.firstName!'')>
            <#assign lastNameValue = (user.lastName!'')>
            <#if emailValue?has_content && !messagesPerField.existsError('email')>
              <input type="hidden" name="email" value="${emailValue?html}" />
            <#else>
              <#assign visibleFields = visibleFields + 1>
              <div class="field">
                <label for="email">Email *</label>
                <div class="input-wrap">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input id="email" name="email" type="email" value="${emailValue?html}" autocomplete="email" placeholder="Введите email" />
                </div>
                <#if messagesPerField.existsError('email')><span class="field-error">${messagesPerField.get('email')}</span></#if>
              </div>
            </#if>

            <#if firstNameValue?has_content && !messagesPerField.existsError('firstName')>
              <input type="hidden" name="firstName" value="${firstNameValue?html}" />
            <#else>
              <#assign visibleFields = visibleFields + 1>
              <div class="field">
                <label for="firstName">Имя *</label>
                <div class="input-wrap">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21a8 8 0 0 0-16 0"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input id="firstName" name="firstName" type="text" value="${firstNameValue?html}" autocomplete="given-name" placeholder="Введите имя" />
                </div>
                <#if messagesPerField.existsError('firstName')><span class="field-error">${messagesPerField.get('firstName')}</span></#if>
              </div>
            </#if>

            <#if lastNameValue?has_content && !messagesPerField.existsError('lastName')>
              <input type="hidden" name="lastName" value="${lastNameValue?html}" />
            <#else>
              <#assign visibleFields = visibleFields + 1>
              <div class="field">
                <label for="lastName">Фамилия *</label>
                <div class="input-wrap">
                  <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21a8 8 0 0 0-16 0"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input id="lastName" name="lastName" type="text" value="${lastNameValue?html}" autocomplete="family-name" placeholder="Введите фамилию" />
                </div>
                <#if messagesPerField.existsError('lastName')><span class="field-error">${messagesPerField.get('lastName')}</span></#if>
              </div>
            </#if>
          </#if>

          <#if visibleFields == 0>
            <div class="inline-notice">
              Все обязательные данные уже заполнены. Нажмите кнопку, чтобы продолжить.
            </div>
          </#if>

          <button type="submit" class="btn-submit">Сохранить и продолжить</button>

        </form>

      </div>
    </main>

    <footer class="footer">© 2026 ТОО "Biocraft Digital"</footer>
  </div>
</body>
</html>
