<#import "template.ftl" as layout>
<#import "social-icons.ftl" as icons>
<#import "field-macros.ftl" as fields>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>

    <#if section = "header">
        ${msg("loginAccountTitle")}

    <#elseif section = "subtitle">
        Sign in to continue to your workspace.

    <#elseif section = "form">
        <#if realm.password>
            <form id="kc-form-login" class="crm-form" onsubmit="login.disabled = true; return true;"
                  action="${url.loginAction}" method="post" novalidate>

                <#if !usernameHidden??>
                    <#assign usernameLabel><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></#assign>
                    <div class="crm-field<#if messagesPerField.existsError('username','password')> crm-field--error</#if>">
                        <label for="username" class="crm-label">${usernameLabel}</label>
                        <div class="crm-input-group">
                            <span class="crm-input-group__icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 10-16 0"/><circle cx="12" cy="8" r="4"/></svg>
                            </span>
                            <input tabindex="1" id="username" name="username" type="text"
                                   class="crm-input crm-input--with-icon"
                                   value="${(login.username!'')}" autofocus autocomplete="username"
                                   placeholder="${usernameLabel}"
                                   aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"/>
                        </div>
                        <#if messagesPerField.existsError('username','password')>
                            <span id="input-error" class="crm-field__error" aria-live="polite">
                                ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                            </span>
                        </#if>
                    </div>
                </#if>

                <div class="crm-field<#if usernameHidden?? && messagesPerField.existsError('username','password')> crm-field--error</#if>">
                    <div class="crm-label-row">
                        <label for="password" class="crm-label">${msg("password")}</label>
                        <#if realm.resetPasswordAllowed>
                            <a tabindex="5" class="crm-link crm-link--sm" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                        </#if>
                    </div>
                    <@fields.password id="password" name="password" tabindex=2 autocomplete="current-password"
                                      placeholder=msg("password")
                                      invalid=messagesPerField.existsError('username','password')/>
                    <#if usernameHidden?? && messagesPerField.existsError('username','password')>
                        <span id="input-error" class="crm-field__error" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                        </span>
                    </#if>
                </div>

                <#if realm.rememberMe && !usernameHidden??>
                    <div class="crm-check">
                        <input tabindex="4" id="rememberMe" name="rememberMe" type="checkbox"
                               class="crm-check__input" <#if login.rememberMe??>checked</#if>>
                        <label for="rememberMe" class="crm-check__label">${msg("rememberMe")}</label>
                    </div>
                </#if>

                <input type="hidden" id="id-hidden-input" name="credentialId"
                       <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                <button tabindex="6" class="crm-btn crm-btn--primary crm-btn--block crm-btn--lg"
                        name="login" id="kc-login" type="submit">${msg("doLogIn")}</button>
            </form>
        </#if>

    <#elseif section = "socialProviders">
        <#if realm.password && social.providers??>
            <div id="kc-social-providers" class="crm-social">
                <div class="crm-divider"><span>${msg("identity-provider-login-label")}</span></div>
                <div class="crm-social__list<#if social.providers?size gt 2> crm-social__list--grid</#if>">
                    <#list social.providers as p>
                        <a id="social-${p.alias}" class="crm-social__btn" href="${p.loginUrl}">
                            <@icons.socialIcon alias=p.alias/>
                            <span class="crm-social__name">${p.displayName!p.alias}</span>
                        </a>
                    </#list>
                </div>
            </div>
        </#if>

    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration">
                ${msg("noAccount")}
                <a tabindex="7" class="crm-link" href="${url.registrationUrl}">${msg("doRegister")}</a>
            </div>
        </#if>
    </#if>

</@layout.registrationLayout>
