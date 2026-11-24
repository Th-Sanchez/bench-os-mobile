const { withSentry } = require('@sentry/react-native/expo');

/**
 * Wraps `@sentry/react-native/expo` so EAS/local native builds succeed even before
 * `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are configured in EAS
 * Environment Variables. As soon as `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and
 * `SENTRY_PROJECT` are present, source map auto-upload is enabled automatically.
 */
module.exports = function withSentrySafeUpload(config, props = {}) {
  const organization = props.organization || process.env.SENTRY_ORG;
  const project = props.project || process.env.SENTRY_PROJECT;
  const hasUploadCredentials = Boolean(process.env.SENTRY_AUTH_TOKEN && organization && project);

  return withSentry(config, {
    url: props.url || 'https://sentry.io/',
    organization,
    project,
    disableAutoUpload: !hasUploadCredentials,
  });
};
