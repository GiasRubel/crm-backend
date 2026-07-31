<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true displayMessage=!messagesPerField.existsError('username'); section>

    <#if section = "header">
        ${msg("emailForgotTitle")}

    <#elseif section = "subtitle">
        <#if realm.duplicateEmailsAllowed>${msg("emailInstructionUsername")}<#else>${msg("emailInstruction")}</#if>

    <#elseif section = "form">
        <form id="kc-reset-password-form" class="crm-form" action="${url.loginAction}" method="post" novalidate>
            <#assign resetLabel><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></#assign>
            <div class="crm-field<#if messagesPerField.existsError('username')> crm-field--error</#if>">
                <label for="username" class="crm-label">${resetLabel}</label>
                <div class="crm-input-group">
                    <span class="crm-input-group__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>
                    </span>
                    <input type="text" id="username" name="username" class="crm-input crm-input--with-icon"
                           autofocus autocomplete="username" placeholder="${resetLabel}"
                           value="${(auth.attemptedUsername!'')}"
                           aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"/>
                </div>
                <#if messagesPerField.existsError('username')>
                    <span id="input-error-username" class="crm-field__error" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('username'))?no_esc}
                    </span>
                </#if>
            </div>

            <button class="crm-btn crm-btn--primary crm-btn--block crm-btn--lg" type="submit">${msg("doSubmit")}</button>
        </form>

    <#elseif section = "info">
        <a class="crm-link crm-link--back" href="${url.loginUrl}">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            ${msg("doLogIn")}
        </a>
    </#if>

</@layout.registrationLayout>
