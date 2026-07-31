<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true; section>

    <#if section = "header">
        ${msg("emailVerifyTitle")}

    <#elseif section = "form">
        <div class="crm-status">
            <span class="crm-status__icon crm-status__icon--info" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>
            </span>
            <p class="crm-status__text">${msg("emailVerifyInstruction1",user.email)}</p>
        </div>

    <#elseif section = "info">
        <p>
            ${msg("emailVerifyInstruction2")}
            <a class="crm-link" href="${url.loginAction}">${msg("doClickHere")}</a> ${msg("emailVerifyInstruction3")}
        </p>
    </#if>

</@layout.registrationLayout>
