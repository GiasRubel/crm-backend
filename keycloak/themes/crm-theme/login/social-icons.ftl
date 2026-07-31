<#--
  Brand marks for the identity-provider buttons.

  Keycloak only hands templates an `iconClasses` string that assumes Font
  Awesome is loaded; this theme ships no icon font, so we match on the provider
  alias and inline the real logo instead. Unknown providers fall back to a
  neutral globe, so adding an IdP in Keycloak never renders a broken button.
-->
<#macro socialIcon alias>
    <#local a = alias?lower_case>
    <span class="crm-social__icon" aria-hidden="true">
    <#if a?contains("google")>
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 01-2.4 3.63v3h3.87c2.26-2.09 3.56-5.17 3.56-8.87z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3a7.2 7.2 0 01-10.73-3.78H1.34v3.09A12 12 0 0012 24z"/><path fill="#FBBC05" d="M5.34 14.31a7.19 7.19 0 010-4.62V6.6H1.34a12 12 0 000 10.8l4-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 001.34 6.6l4 3.09A7.16 7.16 0 0112 4.75z"/></svg>
    <#elseif a?contains("facebook")>
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c-.02-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
    <#elseif a?contains("github")>
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 .3a12 12 0 00-3.79 23.4c.6.1.82-.26.82-.58v-2.2c-3.34.72-4.04-1.4-4.04-1.4-.55-1.4-1.34-1.78-1.34-1.78-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.31 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.62-2.8 5.64-5.48 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0012 .3z"/></svg>
    <#elseif a?contains("microsoft") || a?contains("azure")>
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#F25022" d="M1 1h10.2v10.2H1z"/><path fill="#7FBA00" d="M12.8 1H23v10.2H12.8z"/><path fill="#00A4EF" d="M1 12.8h10.2V23H1z"/><path fill="#FFB900" d="M12.8 12.8H23V23H12.8z"/></svg>
    <#elseif a?contains("linkedin")>
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 013.37-1.85c3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>
    <#elseif a?contains("apple")>
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16.36 12.72c-.03-2.7 2.2-4 2.3-4.06-1.25-1.83-3.2-2.08-3.89-2.11-1.66-.17-3.24.97-4.08.97-.84 0-2.14-.95-3.52-.92-1.81.03-3.48 1.05-4.41 2.67-1.88 3.26-.48 8.09 1.35 10.74.9 1.3 1.97 2.75 3.38 2.7 1.36-.06 1.87-.88 3.51-.88 1.64 0 2.1.88 3.53.85 1.46-.02 2.38-1.32 3.27-2.62 1.03-1.5 1.46-2.96 1.48-3.03-.03-.02-2.84-1.09-2.87-4.31zM13.7 4.6c.74-.9 1.24-2.15 1.1-3.4-1.07.05-2.36.71-3.13 1.61-.68.79-1.28 2.06-1.12 3.28 1.19.09 2.41-.6 3.15-1.49z"/></svg>
    <#elseif a?contains("gitlab")>
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#FC6D26" d="M12 22.5L16.42 8.9H7.58zM3.16 8.9L1.5 14.03a1.1 1.1 0 00.4 1.23L12 22.5zM7.58 8.9H3.16L5.02 3.2a.57.57 0 011.08 0zM20.84 8.9l1.66 5.13a1.1 1.1 0 01-.4 1.23L12 22.5zm-4.42 0h4.42l-1.86-5.7a.57.57 0 00-1.08 0z"/></svg>
    <#elseif a?contains("twitter") || a == "x">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M18.24 2.25h3.31l-7.23 8.26L22.5 21.75h-6.63l-5.2-6.79-5.94 6.79H1.42l7.73-8.84L1.5 2.25h6.8l4.7 6.21zm-1.16 17.52h1.83L7.01 4.13H5.05z"/></svg>
    <#else>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z"/></svg>
    </#if>
    </span>
</#macro>
