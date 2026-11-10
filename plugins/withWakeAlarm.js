// Config plugin for the Wake Word alarm.
// iOS: adds the AlarmKit usage text and puts WakeWordBackend.swift (alarm + App Intents) in the app target.
// Android: lets the app's screen show over the lock screen and turn the screen on when the alarm rings.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withInfoPlist, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const SWIFT = path.join(__dirname, 'ios', 'WakeWordBackend.swift');

function withWakeAlarmIOS(config, { alarmUsage }) {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSAlarmKitUsageDescription =
      alarmUsage || 'Wake Word rings your alarm, even in silent mode, until you finish your language mission.';
    return c;
  });
  return IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: 'WakeWordBackend.swift',
    contents: fs.readFileSync(SWIFT, 'utf8'),
    overwrite: true,
  });
}

function withWakeAlarmAndroid(config) {
  return withAndroidManifest(config, (c) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    activity.$['android:showWhenLocked'] = 'true';
    activity.$['android:turnScreenOn'] = 'true';
    return c;
  });
}

module.exports = function withWakeAlarm(config, props = {}) {
  config = withWakeAlarmIOS(config, props);
  config = withWakeAlarmAndroid(config);
  return config;
};
