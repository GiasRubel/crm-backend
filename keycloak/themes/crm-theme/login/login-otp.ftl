<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp'); section>

    <#if section = "header">
        Two-step verification

    <#elseif section = "subtitle">
        Enter the one-time code from your authenticator app.

    <#elseif section = "form">
        <form id="kc-otp-login-form" class="crm-form" action="${url.loginAction}" method="post" novalidate>

            <#if otpLogin.userOtpCredentials?size gt 1>
                <div class="crm-field">
                    <span class="crm-label">Choose a device</span>
                    <div class="crm-otp-options">
                        <#list otpLogin.userOtpCredentials as otpCredential>
                            <input id="kc-otp-credential-${otpCredential?index}" class="crm-otp-option__input"
                                   type="radio" name="selectedCredentialId" value="${otpCredential.id}"
                                   <#if otpCredential.id == otpLogin.selectedCredentialId>checked="checked"</#if>>
                            <label for="kc-otp-credential-${otpCredential?index}" class="crm-otp-option">
                                <span class="crm-otp-option__icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18.5h2"/></svg>
                                </span>
                                <span class="crm-otp-option__title">${otpCredential.userLabel}</span>
                            </label>
                        </#list>
                    </div>
                </div>
            </#if>

            <div class="crm-field<#if messagesPerField.existsError('totp')> crm-field--error</#if>">
                <label for="otp" class="crm-label">${msg("loginOtpOneTime")}</label>
                <input id="otp" name="otp" type="text" class="crm-input crm-input--code"
                       inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code"
                       maxlength="8" placeholder="000000" autofocus
                       aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"/>
                <#if messagesPerField.existsError('totp')>
                    <span id="input-error-otp-code" class="crm-field__error" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                    </span>
                </#if>
            </div>

            <button class="crm-btn crm-btn--primary crm-btn--block crm-btn--lg"
                    name="login" id="kc-login" type="submit">${msg("doLogIn")}</button>
        </form>
    </#if>

</@layout.registrationLayout>
