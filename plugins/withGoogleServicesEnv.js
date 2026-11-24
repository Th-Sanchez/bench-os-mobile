const fs = require('node:fs');
const path = require('node:path');

/**
 * Resolves `android.googleServicesFile` dynamically from EAS's `GOOGLE_SERVICES_JSON`
 * file-type secret during cloud builds, or falls back to a gitignored local
 * `./google-services.json` file during local prebuilds. Keeps `app.json` static for
 * SemVer CI/CD scripts and avoids failing CI when the secret file is absent.
 */
module.exports = function withGoogleServicesEnv(config) {
  const fromEnv = (process.env.GOOGLE_SERVICES_JSON || '').trim();
  const localPath = path.resolve(process.cwd(), 'google-services.json');

  const resolvedFile = fromEnv || (fs.existsSync(localPath) ? './google-services.json' : null);

  if (!resolvedFile) {
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile: resolvedFile,
    },
  };
};
