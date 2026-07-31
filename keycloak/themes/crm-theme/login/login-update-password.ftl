<#import "template.ftl" as layout>
<#import "field-macros.ftl" as fields>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm'); section>

    <#if section = "header">
        ${msg("updatePasswordTitle")}

    <#elseif section = "subtitle">
        Choose a new password to finish signing in.

    <#elseif section = "form">
        <form id="kc-passwd-update-form" class="crm-form" action="${url.loginAction}" method="post" novalidate>

            <div class="crm-field<#if messagesPerField.existsError('password')> crm-field--error</#if>">
                <label for="password-new" class="crm-label">${msg("passwordNew")}</label>
                <@fields.password id="password-new" name="password-new" autofocus=true meter=true
                                  autocomplete="new-password" placeholder=msg("passwordNew")
                                  invalid=messagesPerField.existsError('password','password-confirm')/>
                <#if messagesPerField.existsError('password')>
                    <span id="input-error-password" class="crm-field__error" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('password'))?no_esc}
                    </span>
                </#if>
            </div>

            <div class="crm-field<#if messagesPerField.existsError('password-confirm')> crm-field--error</#if>">
                <label for="password-confirm" class="crm-label">${msg("passwordConfirm")}</label>
                <@fields.password id="password-confirm" name="password-confirm"
                                  autocomplete="new-password" placeholder=msg("passwordConfirm")
                                  invalid=messagesPerField.existsError('password-confirm')/>
                <#if messagesPerField.existsError('password-confirm')>
                    <span id="input-error-password-confirm" class="crm-field__error" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
                    </span>
                </#if>
            </div>

            <div class="crm-check">
                <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" class="crm-check__input" checked>
                <label for="logout-sessions" class="crm-check__label">${msg("logoutOtherSessions")}</label>
            </div>

            <div class="crm-form-actions<#if isAppInitiatedAction??> crm-form-actions--split</#if>">
                <button class="crm-btn crm-btn--primary crm-btn--block crm-btn--lg" type="submit">${msg("doSubmit")}</button>
                <#if isAppInitiatedAction??>
                    <button class="crm-btn crm-btn--ghost crm-btn--block crm-btn--lg" type="submit" name="cancel-aia" value="true">${msg("doCancel")}</button>
                </#if>
            </div>
        </form>
    </#if>

</@layout.registrationLayout>
