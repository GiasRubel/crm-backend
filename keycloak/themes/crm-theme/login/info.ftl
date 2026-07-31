<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>

    <#if section = "header">
        <#if messageHeader??>${messageHeader}<#else>${message.summary}</#if>

    <#elseif section = "form">
        <div id="kc-info-message" class="crm-status">
            <span class="crm-status__icon crm-status__icon--success" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </span>
            <p class="crm-status__text">
                ${message.summary}<#if requiredActions??><#list requiredActions>: <b><#items as reqActionItem>${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}<#sep>, </#items></b></#list></#if>
            </p>

            <#if !skipLink??>
                <#if pageRedirectUri?has_content>
                    <a class="crm-btn crm-btn--primary crm-btn--block" href="${pageRedirectUri}">${kcSanitize(msg("backToApplication"))?no_esc}</a>
                <#elseif actionUri?has_content>
                    <a class="crm-btn crm-btn--primary crm-btn--block" href="${actionUri}">${kcSanitize(msg("proceedWithAction"))?no_esc}</a>
                <#elseif (client.baseUrl)?has_content>
                    <a class="crm-btn crm-btn--primary crm-btn--block" href="${client.baseUrl}">${kcSanitize(msg("backToApplication"))?no_esc}</a>
                </#if>
            </#if>
        </div>
    </#if>

</@layout.registrationLayout>
