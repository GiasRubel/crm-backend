<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>

    <#if section = "header">
        ${kcSanitize(msg("errorTitle"))?no_esc}

    <#elseif section = "form">
        <div id="kc-error-message" class="crm-status">
            <span class="crm-status__icon crm-status__icon--error" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>
            </span>
            <p class="crm-status__text">${kcSanitize(message.summary)?no_esc}</p>

            <#if !skipLink?? && client?? && client.baseUrl?has_content>
                <a id="backToApplication" class="crm-btn crm-btn--primary crm-btn--block" href="${client.baseUrl}">${kcSanitize(msg("backToApplication"))?no_esc}</a>
            </#if>
        </div>
    </#if>

</@layout.registrationLayout>
