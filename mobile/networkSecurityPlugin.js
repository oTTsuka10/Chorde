const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">192.168.1.172</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>`;

module.exports = function (config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];
    if (!application.$) application.$ = {};
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    (config) => {
      const resXmlPath = path.join(
        config.modRequest.projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      if (!fs.existsSync(resXmlPath)) {
        fs.mkdirSync(resXmlPath, { recursive: true });
      }
      fs.writeFileSync(
        path.join(resXmlPath, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG
      );
      return config;
    },
  ]);

  return config;
};
