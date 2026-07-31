<#--
  Shared field markup so every password box in the theme looks and behaves the
  same (lock icon, reveal button, optional strength meter). js/crm-theme.js
  wires the `data-crm-reveal` / `data-crm-strength` hooks.
-->

<#macro password id name tabindex=0 autocomplete="new-password" placeholder="" invalid=false autofocus=false meter=false>
    <div class="crm-input-group">
        <span class="crm-input-group__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 018 0v3.5"/>
            </svg>
        </span>
        <input type="password" id="${id}" name="${name}"
               class="crm-input crm-input--with-icon crm-input--with-action"
               <#if tabindex gt 0>tabindex="${tabindex}"</#if>
               autocomplete="${autocomplete}"
               <#if autofocus>autofocus</#if>
               <#if placeholder?has_content>placeholder="${placeholder}"</#if>
               <#if meter>data-crm-strength="strength-${id}"</#if>
               aria-invalid="<#if invalid>true</#if>"/>
        <button type="button" class="crm-reveal" data-crm-reveal="${id}" tabindex="-1"
                aria-controls="${id}" aria-label="${msg('showPassword')}"
                data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
            <svg class="crm-reveal__show" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>
            </svg>
            <svg class="crm-reveal__hide" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3l18 18"/><path d="M10.6 6.7A9.9 9.9 0 0112 6.5c6.4 0 10 6.5 10 6.5a18 18 0 01-3.3 4.1M6.4 7.9A18 18 0 002 13s3.6 6.5 10 6.5a9.8 9.8 0 004.2-.9"/><path d="M9.9 10.1a2.8 2.8 0 004 4"/>
            </svg>
        </button>
    </div>
    <#if meter>
        <div class="crm-strength" id="strength-${id}" hidden>
            <div class="crm-strength__track"><span class="crm-strength__bar"></span></div>
            <span class="crm-strength__label"></span>
        </div>
    </#if>
</#macro>
