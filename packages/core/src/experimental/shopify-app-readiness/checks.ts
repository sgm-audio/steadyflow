import type { ShopifyAppRequirement } from './schema';

export type ReadinessCheckStatus =
  'pass' | 'fail' | 'warning' | 'manual_review' | 'not_applicable' | 'unknown';

export interface ReadinessCheckResult {
  requirementId: string;
  status: ReadinessCheckStatus;
  message: string;
  evidence?: unknown;
  sourceLocation?: string;
}

export interface AppConfiguration {
  name?: string | undefined;
  description?: string | undefined;
  privacyPolicyUrl?: string | undefined;
  supportUrl?: string | undefined;
  scopes?: string[] | undefined;
  webhooks?: { topic: string; address: string }[] | undefined;
  extensions?: { type: string; handle: string }[] | undefined;
  embeddedApp?: boolean | undefined;
  oauth?:
    | {
        redirectUris?: string[] | undefined;
        clientId?: string | undefined;
        clientSecret?: string | undefined;
      }
    | undefined;
  developmentUrls?: string[] | undefined;
  mutations?: string[] | undefined;
  externalDependencies?: string[] | undefined;
  themeExtensions?: { name: string; handle: string }[] | undefined;
  [key: string]: unknown;
}

/**
 * 1. Configuration parsing – validate that app config can be parsed and has required fields
 */
export function checkConfigurationParsing(
  config: unknown,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  if (!config || typeof config !== 'object') {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: 'App configuration is missing or not a valid object',
    };
  }
  // Do NOT echo the raw config into evidence — it may contain secrets that
  // would then be serialized into the report. Report only a safe summary.
  const fieldCount = Object.keys(config).length;
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: 'Configuration parsed successfully',
    evidence: { fieldCount },
  };
}

/**
 * 2. API scope extraction – verify requested scopes are declared and minimal
 */
export function checkApiScopeExtraction(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const scopes = config.scopes ?? [];
  if (!scopes.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: 'No API scopes declared',
    };
  }
  const allowedWriteScope = /^write_(products|orders|customers)$/;
  const excessive = scopes.filter((s) => s.includes('write_') && !allowedWriteScope.test(s));
  if (excessive.length) {
    return {
      requirementId: requirement.id,
      status: 'warning',
      message: `Potentially excessive scopes detected: ${excessive.join(', ')}`,
      evidence: { scopes, excessive },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: `Scopes declared: ${scopes.join(', ')}`,
    evidence: { scopes },
  };
}

/**
 * 3. Deprecated API detection – flag usage of deprecated REST/GraphQL APIs
 */
export function checkDeprecatedApiDetection(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const deprecatedPatterns = [
    '/admin/api/2022-',
    '/admin/api/2023-',
    'ProductImage',
    'ProductVariant',
  ];
  const found: string[] = [];
  const configStr = JSON.stringify(config);
  for (const pattern of deprecatedPatterns) {
    if (configStr.includes(pattern)) found.push(pattern);
  }
  if (found.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Deprecated API references found: ${found.join(', ')}`,
      evidence: { found },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: 'No deprecated API references detected',
  };
}

/**
 * 4. OAuth / installation detection – ensure OAuth flow is properly configured
 */
export function checkOAuthInstallationDetection(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const oauth = config.oauth;
  if (oauth === undefined) {
    return {
      requirementId: requirement.id,
      status: 'not_applicable',
      message: 'OAuth configuration not provided; cannot verify',
    };
  }
  const redirectUris = oauth.redirectUris ?? [];
  if (redirectUris.length === 0) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: 'OAuth redirect URIs not configured',
    };
  }
  const invalid = redirectUris.filter((uri) => !uri.startsWith('https://'));
  if (invalid.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Non-HTTPS redirect URIs: ${invalid.join(', ')}`,
      evidence: { invalid },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: `OAuth configured with ${redirectUris.length} redirect URI(s)`,
    evidence: { redirectUris },
  };
}

/**
 * 5. Embedded app detection – verify app uses App Bridge for embedded apps
 */
export function checkEmbeddedAppDetection(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  if (config.embeddedApp === false) {
    return {
      requirementId: requirement.id,
      status: 'not_applicable',
      message: 'App is not embedded',
    };
  }
  return {
    requirementId: requirement.id,
    status: 'manual_review',
    message: 'Embedded app detected – verify App Bridge usage manually',
    evidence: { embeddedApp: config.embeddedApp },
  };
}

/**
 * 6. Theme extension checks – validate theme app extensions follow requirements
 */
export function checkThemeExtensionChecks(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const extensions = config.themeExtensions ?? [];
  if (!extensions.length) {
    return {
      requirementId: requirement.id,
      status: 'not_applicable',
      message: 'No theme extensions declared',
    };
  }
  const missingHandle = extensions.filter((e) => !e.handle);
  if (missingHandle.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Theme extensions missing handle: ${missingHandle.map((e) => e.name).join(', ')}`,
      evidence: { missingHandle },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: `${extensions.length} theme extension(s) validated`,
    evidence: { extensions },
  };
}

/**
 * 7. Direct mutation flags – detect direct DB/mutation calls that bypass Shopify APIs
 */
export function checkDirectMutationFlags(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const mutations = config.mutations;
  if (mutations === undefined) {
    return {
      requirementId: requirement.id,
      status: 'not_applicable',
      message: 'No mutation data provided; cannot verify',
    };
  }
  if (!mutations.length) {
    return {
      requirementId: requirement.id,
      status: 'pass',
      message: 'No direct mutations detected',
    };
  }
  return {
    requirementId: requirement.id,
    status: 'warning',
    message: `Direct mutations detected: ${mutations.join(', ')}`,
    evidence: { mutations },
  };
}

/**
 * 8. Privacy policy / support URL presence
 */
export function checkPrivacySupportUrls(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const missing: string[] = [];
  if (!config.privacyPolicyUrl) missing.push('privacyPolicyUrl');
  if (!config.supportUrl) missing.push('supportUrl');
  if (missing.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Missing required URLs: ${missing.join(', ')}`,
      evidence: { missing },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: 'Privacy policy and support URLs present',
    evidence: { privacyPolicyUrl: config.privacyPolicyUrl, supportUrl: config.supportUrl },
  };
}

/**
 * 9. Name / description extraction – ensure app name and description are present and non-empty
 */
export function checkNameDescriptionExtraction(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const issues: string[] = [];
  if (!config.name?.trim()) issues.push('name');
  if (!config.description?.trim()) issues.push('description');
  if (issues.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Missing required fields: ${issues.join(', ')}`,
      evidence: { issues },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: `Name: "${config.name}", Description length: ${config.description?.length ?? 0}`,
    evidence: { name: config.name, description: config.description },
  };
}

/**
 * 10. Hardcoded development URLs – detect localhost, ngrok, etc.
 */
export function checkHardcodedDevelopmentUrls(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const devPatterns = ['localhost', '127.0.0.1', 'ngrok', 'tunnel', '.local'];
  const urls = config.developmentUrls;
  if (urls === undefined) {
    return {
      requirementId: requirement.id,
      status: 'not_applicable',
      message: 'No development URL data provided; cannot verify',
    };
  }
  const found = urls.filter((u) => devPatterns.some((p) => u.includes(p)));
  if (found.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Development URLs detected: ${found.join(', ')}`,
      evidence: { found },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: 'No development URLs detected',
    evidence: { checked: urls },
  };
}

/**
 * 11. Secret-like value detection – scan for API keys, tokens, secrets in config
 */
export function checkSecretLikeValueDetection(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const secretPatterns = [
    /sk_[a-zA-Z0-9]{24,}/,
    /shpat_[a-zA-Z0-9]{24,}/,
    /api[_-]?key/i,
    /secret/i,
    /token/i,
    /password/i,
  ];
  const configStr = JSON.stringify(config);
  const found = secretPatterns.filter((p) => p.test(configStr));
  if (found.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Potential secrets detected in configuration`,
      evidence: { patternsMatched: found.length },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: 'No secret-like values detected',
  };
}

/**
 * 12. Webhook identification – verify webhooks are declared with valid topics
 */
export function checkWebhookIdentification(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const webhooks = config.webhooks ?? [];
  if (!webhooks.length) {
    return {
      requirementId: requirement.id,
      status: 'not_applicable',
      message: 'No webhooks declared',
    };
  }
  const invalid = webhooks.filter((w) => !w.topic || !w.address);
  if (invalid.length) {
    return {
      requirementId: requirement.id,
      status: 'fail',
      message: `Webhooks missing topic or address: ${invalid.length}`,
      evidence: { invalid },
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: `${webhooks.length} webhook(s) validated`,
    evidence: { webhooks },
  };
}

/**
 * 13. External dependency inventory – list external services / packages used
 */
export function checkExternalDependencyInventory(
  config: AppConfiguration,
  requirement: ShopifyAppRequirement,
): ReadinessCheckResult {
  const deps = config.externalDependencies;
  if (deps === undefined) {
    return {
      requirementId: requirement.id,
      status: 'not_applicable',
      message: 'No external dependency data provided; cannot verify',
    };
  }
  return {
    requirementId: requirement.id,
    status: 'pass',
    message: `${deps.length} external dependenc${deps.length === 1 ? 'y' : 'ies'} inventoried`,
    evidence: { dependencies: deps },
  };
}

/**
 * Run all static checks against an app configuration
 */
export function runStaticChecks(
  config: AppConfiguration,
  requirements: ShopifyAppRequirement[],
): ReadinessCheckResult[] {
  const checkMap: Record<
    string,
    (c: AppConfiguration, r: ShopifyAppRequirement) => ReadinessCheckResult
  > = {
    'config-parsing': checkConfigurationParsing,
    'api-scopes': checkApiScopeExtraction,
    'deprecated-api': checkDeprecatedApiDetection,
    'oauth-installation': checkOAuthInstallationDetection,
    'embedded-app': checkEmbeddedAppDetection,
    'theme-extension': checkThemeExtensionChecks,
    'direct-mutations': checkDirectMutationFlags,
    'privacy-support-urls': checkPrivacySupportUrls,
    'name-description': checkNameDescriptionExtraction,
    'dev-urls': checkHardcodedDevelopmentUrls,
    'secret-detection': checkSecretLikeValueDetection,
    'webhook-identification': checkWebhookIdentification,
    'external-deps': checkExternalDependencyInventory,
  };

  return requirements.map((req) => {
    const checker = checkMap[req.id];
    if (!checker) {
      return {
        requirementId: req.id,
        status: 'unknown',
        message: `No static checker implemented for requirement ${req.id}`,
      };
    }
    try {
      return checker(config, req);
    } catch (err) {
      return {
        requirementId: req.id,
        status: 'fail',
        message: `Check threw error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
}
