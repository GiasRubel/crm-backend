<#import "template.ftl" as layout>
<@layout.registrationLayout; section>

    <#if section = "header">
        ${msg("pageExpiredTitle")}

    <#elseif section = "subtitle">
        Sign-in links are single-use and short-lived, so reloading one or opening
        it a second time expires it. Nothing is wrong with your account.

    <#elseif section = "form">
        <div class="crm-status">
            <span class="crm-status__icon crm-status__icon--warning" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>
            </span>
            <p class="crm-status__text">
                Start again from the beginning. Continuing the previous attempt
                only works if it is still active &mdash; if it was opened from an
                email link, that link has already been used and you will need a
                new one.
            </p>
            <div class="crm-form-actions">
                <a id="loginRestartLink" class="crm-btn crm-btn--primary crm-btn--block crm-btn--lg" href="${url.loginRestartFlowUrl}">${msg("pageExpiredMsg1")}</a>
                <a id="loginContinueLink" class="crm-btn crm-btn--ghost crm-btn--block crm-btn--lg" href="${url.loginAction}">${msg("pageExpiredMsg2")}</a>
            </div>
        </div>
    </#if>

</@layout.registrationLayout>
