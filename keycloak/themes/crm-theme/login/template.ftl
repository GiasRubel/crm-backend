<#--
  CRM Pro — shared page shell for every Keycloak login-theme page.

  Layout is a two-column split: a branded marketing panel on the left (hidden
  under 1024px) and the form panel on the right. Pages fill it through the
  named sections below.

  Nested sections a page may implement:
    "header"          – the page title (required)
    "subtitle"        – one line under the title (optional, CRM Pro addition;
                        base templates simply don't emit it and render nothing)
    "form"            – the main body / form
    "socialProviders" – identity-provider buttons
    "info"            – the footnote under the card
    "show-username"   – rendered instead of the username chip
-->
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}"<#if realm.internationalizationEnabled> lang="${locale.currentLanguageTag}"</#if>>

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="robots" content="noindex, nofollow">
    <#-- Dark-only: keeps native controls, scrollbars and autofill in the same
         palette as the page instead of the OS default. -->
    <meta name="color-scheme" content="dark">
    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${msg("loginTitle",(realm.displayName!'CRM Pro'))}</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Ctext x='16' y='23' font-family='system-ui,sans-serif' font-size='19' font-weight='800' fill='white' text-anchor='middle'%3EC%3C/text%3E%3C/svg%3E"/>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript" defer></script>
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#if authenticationSession??>
        <script type="module">
            import { checkCookiesAndSetTimer } from "${url.resourcesPath}/js/authChecker.js";
            checkCookiesAndSetTimer(
              "${authenticationSession.authSessionId}",
              "${authenticationSession.tabId}",
              "${url.ssoLoginInOtherTabsUrl?no_esc}"
            );
        </script>
    </#if>
</head>

<body class="${properties.kcBodyClass!} <#if bodyClass?has_content>crm-body--${bodyClass}</#if>">
<div class="${properties.kcLoginClass!}">

    <#-- ============================ brand panel ============================ -->
    <aside class="crm-brand" aria-hidden="true">
        <div class="crm-brand__glow"></div>
        <div class="crm-brand__inner">
            <div class="crm-brand__logo">
                <span class="crm-brand__mark">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 17l5-5 4 3 6-7"/><path d="M14 8h5v5"/>
                    </svg>
                </span>
                <span class="crm-brand__name">${realm.displayName!'CRM Pro'}</span>
            </div>

            <div class="crm-brand__copy">
                <h2 class="crm-brand__headline">Every customer,<br/>one workspace.</h2>
                <p class="crm-brand__lede">
                    Leads, deals, tickets and conversations — tracked in one place
                    so your team always knows the next move.
                </p>
                <ul class="crm-brand__list">
                    <li><span class="crm-brand__tick">&#10003;</span> Pipeline &amp; forecasting that stays current</li>
                    <li><span class="crm-brand__tick">&#10003;</span> Shared activity timeline across the team</li>
                    <li><span class="crm-brand__tick">&#10003;</span> Enterprise single sign-on &amp; role-based access</li>
                </ul>
            </div>

            <p class="crm-brand__foot">Secured by Keycloak &middot; SSO enabled</p>
        </div>
    </aside>

    <#-- ============================ form panel ============================= -->
    <main class="crm-panel">
        <#if realm.internationalizationEnabled && locale.supported?size gt 1>
            <div class="${properties.kcLocaleMainClass!}" id="kc-locale">
                <div id="kc-locale-wrapper" class="${properties.kcLocaleWrapperClass!}">
                    <div id="kc-locale-dropdown" class="${properties.kcLocaleDropDownClass!}" data-crm-locale>
                        <button type="button" id="kc-current-locale-link" aria-label="${msg("languages")}"
                                aria-haspopup="true" aria-expanded="false" aria-controls="language-switch1">
                            ${locale.current}
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                        </button>
                        <ul role="menu" tabindex="-1" aria-labelledby="kc-current-locale-link"
                            id="language-switch1" class="${properties.kcLocaleListClass!}">
                            <#list locale.supported as l>
                                <li class="${properties.kcLocaleListItemClass!}" role="none">
                                    <a role="menuitem" class="${properties.kcLocaleItemClass!}" href="${l.url}">${l.label}</a>
                                </li>
                            </#list>
                        </ul>
                    </div>
                </div>
            </div>
        </#if>

        <div class="${properties.kcFormCardClass!}">

            <#-- brand lockup, mobile only (the aside is hidden on small screens) -->
            <div class="crm-card__brand">
                <span class="crm-brand__mark crm-brand__mark--sm">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 17l5-5 4 3 6-7"/><path d="M14 8h5v5"/>
                    </svg>
                </span>
                <span class="crm-brand__name crm-brand__name--sm">${realm.displayName!'CRM Pro'}</span>
            </div>

            <header class="${properties.kcFormHeaderClass!}">
                <#if auth?has_content && auth.showUsername() && !auth.showResetCredentials()>
                    <h1 id="kc-page-title"><#nested "header"></h1>
                    <#nested "show-username">
                    <#assign attemptedUsername = auth.attemptedUsername!"">
                    <div id="kc-username" class="crm-identity">
                        <span class="crm-identity__avatar" aria-hidden="true"><#if attemptedUsername?has_content>${attemptedUsername?substring(0,1)?upper_case}<#else>&#183;</#if></span>
                        <span class="crm-identity__name" id="kc-attempted-username">${auth.attemptedUsername}</span>
                        <a id="reset-login" class="crm-identity__switch" href="${url.loginRestartFlowUrl}"
                           aria-label="${msg("restartLoginTooltip")}" title="${msg("restartLoginTooltip")}">
                            ${msg("restartLoginTooltip")}
                        </a>
                    </div>
                <#else>
                    <h1 id="kc-page-title"><#nested "header"></h1>
                    <p class="crm-card__subtitle"><#nested "subtitle"></p>
                </#if>

                <#if displayRequiredFields>
                    <p class="crm-required-note"><span class="crm-required">*</span> ${msg("requiredFields")}</p>
                </#if>
            </header>

            <div id="kc-content">
                <div id="kc-content-wrapper" class="${properties.kcContentWrapperClass!}">

                    <#-- App-initiated actions should not see warnings about completing the action -->
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="${properties.kcAlertClass!} crm-alert--${message.type}" role="alert">
                            <span class="crm-alert__icon" aria-hidden="true">
                                <#if message.type = 'success'>
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                <#elseif message.type = 'error'>
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>
                                <#elseif message.type = 'warning'>
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.8L2 18a2 2 0 001.7 3h16.6A2 2 0 0022 18L13.7 3.8a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                                <#else>
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 7.5v.01"/></svg>
                                </#if>
                            </span>
                            <span class="${properties.kcAlertTitleClass!}">${kcSanitize(message.summary)?no_esc}</span>
                        </div>
                    </#if>

                    <#nested "form">

                    <#if auth?has_content && auth.showTryAnotherWayLink()>
                        <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post" class="crm-try-another">
                            <input type="hidden" name="tryAnotherWay" value="on"/>
                            <button type="submit" id="try-another-way" class="crm-link crm-link--button">${msg("doTryAnotherWay")}</button>
                        </form>
                    </#if>

                    <#nested "socialProviders">

                    <#if displayInfo>
                        <div id="kc-info" class="${properties.kcSignUpClass!}">
                            <div id="kc-info-wrapper" class="${properties.kcInfoAreaWrapperClass!}">
                                <#nested "info">
                            </div>
                        </div>
                    </#if>
                </div>
            </div>
        </div>

        <p class="crm-legal">
            &copy; ${.now?string('yyyy')} ${realm.displayName!'CRM Pro'} &middot; Protected by single sign-on
        </p>
    </main>
</div>
</body>
</html>
</#macro>
