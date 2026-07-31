<#import "template.ftl" as layout>
<#import "user-profile-commons.ftl" as userProfileCommons>
<#import "register-commons.ftl" as registerCommons>
<#import "field-macros.ftl" as fields>
<@layout.registrationLayout displayMessage=messagesPerField.exists('global') displayRequiredFields=true displayInfo=true; section>

    <#if section = "header">
        ${msg("registerTitle")}

    <#elseif section = "subtitle">
        It only takes a minute to get your workspace running.

    <#elseif section = "form">
        <form id="kc-register-form" class="crm-form" action="${url.registrationAction}" method="post" novalidate>

            <@userProfileCommons.userProfileFormFields; callback, attribute>
                <#if callback = "afterField">
                <#-- password fields go straight under username (or email, when it is the username) -->
                    <#if passwordRequired?? && (attribute.name == 'username' || (attribute.name == 'email' && realm.registrationEmailAsUsername))>
                        <div class="crm-field<#if messagesPerField.existsError('password')> crm-field--error</#if>">
                            <label for="password" class="crm-label">
                                ${msg("password")}<span class="crm-required" aria-hidden="true">*</span>
                            </label>
                            <@fields.password id="password" name="password" autocomplete="new-password"
                                              placeholder=msg("password") meter=true
                                              invalid=messagesPerField.existsError('password','password-confirm')/>
                            <#if messagesPerField.existsError('password')>
                                <span id="input-error-password" class="crm-field__error" aria-live="polite">
                                    ${kcSanitize(messagesPerField.get('password'))?no_esc}
                                </span>
                            </#if>
                        </div>

                        <div class="crm-field<#if messagesPerField.existsError('password-confirm')> crm-field--error</#if>">
                            <label for="password-confirm" class="crm-label">
                                ${msg("passwordConfirm")}<span class="crm-required" aria-hidden="true">*</span>
                            </label>
                            <@fields.password id="password-confirm" name="password-confirm" autocomplete="new-password"
                                              placeholder=msg("passwordConfirm")
                                              invalid=messagesPerField.existsError('password-confirm')/>
                            <#if messagesPerField.existsError('password-confirm')>
                                <span id="input-error-password-confirm" class="crm-field__error" aria-live="polite">
                                    ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
                                </span>
                            </#if>
                        </div>
                    </#if>
                </#if>
            </@userProfileCommons.userProfileFormFields>

            <@registerCommons.termsAcceptance/>

            <#if recaptchaRequired??>
                <div class="crm-field crm-field--captcha">
                    <div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}"></div>
                </div>
            </#if>

            <button class="crm-btn crm-btn--primary crm-btn--block crm-btn--lg" type="submit">${msg("doRegister")}</button>
        </form>

    <#elseif section = "info">
        <div id="kc-registration">
            Already have an account?
            <a class="crm-link" href="${url.loginUrl}">${msg("doLogIn")}</a>
        </div>
    </#if>

</@layout.registrationLayout>
