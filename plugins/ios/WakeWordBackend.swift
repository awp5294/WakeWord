// Wake Word's alarm, built on AlarmKit (iOS 26 and later).
// The config plugin copies this file into the app target, because the system finds
// App Intents (the alarm's Snooze and Open buttons) only in the app bundle.
//
// How the alarm stays on until the mission is done:
// - A daily AlarmKit alarm rings through silent mode and the lock screen.
// - AlarmKit always offers a way to stop the sound. Our stop button is "Snooze": its intent
//   checks whether today's mission is done and, if not, sets a one-off "nag" alarm 60 seconds out.
// - "Open" stops the sound, opens the app and sets a nag 2 minutes out as a safety net.
// - While a mission is on screen the app keeps pushing the nag forward. Leave the app and it rings again.
// - Finishing the mission cancels the nag. Nagging stops 60 minutes after the alarm time either way.

import AlarmKit
import AppIntents
import Foundation
import SwiftUI
import WakeAlarm

struct WakeWordAlarmMeta: AlarmMetadata {}

enum WakeWordStore {
  static let defaults = UserDefaults.standard
  static let nagWindow: TimeInterval = 60 * 60

  static var hour: Int { defaults.object(forKey: "ww.hour") as? Int ?? -1 }
  static var minute: Int { defaults.integer(forKey: "ww.minute") }
  static var lastComplete: Double { defaults.double(forKey: "ww.lastComplete") }
  static var testRingAt: Double { defaults.double(forKey: "ww.testRingAt") }

  static func uuid(_ key: String) -> UUID? {
    defaults.string(forKey: key).flatMap(UUID.init(uuidString:))
  }

  /// The most recent ring at or before `now` (daily alarm or a test ring).
  static func lastRing(before now: Date) -> Date? {
    var best: Date? = nil
    if hour >= 0 {
      let cal = Calendar.current
      var c = cal.dateComponents([.year, .month, .day], from: now)
      c.hour = hour
      c.minute = minute
      c.second = 0
      if var d = cal.date(from: c) {
        if d > now { d = cal.date(byAdding: .day, value: -1, to: d) ?? d }
        best = d
      }
    }
    if testRingAt > 0 {
      let t = Date(timeIntervalSince1970: testRingAt)
      if t <= now, best == nil || t > best! { best = t }
    }
    return best
  }

  /// The ring that still needs a finished mission, if it was within the last hour.
  static func owed(now: Date = Date()) -> Date? {
    guard let ring = lastRing(before: now) else { return nil }
    guard now.timeIntervalSince(ring) < nagWindow else { return nil }
    guard lastComplete < ring.timeIntervalSince1970 else { return nil }
    return ring
  }
}

enum WakeWordAlarms {
  static var supported: Bool {
    if #available(iOS 26.0, *) { return true }
    return false
  }

  @available(iOS 26.0, *)
  static func attributes(title: String) -> AlarmAttributes<WakeWordAlarmMeta> {
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz"),
      secondaryButton: AlarmButton(text: "Open", textColor: .white, systemImageName: "character.book.closed"),
      secondaryButtonBehavior: .custom
    )
    return AlarmAttributes(
      presentation: AlarmPresentation(alert: alert),
      metadata: WakeWordAlarmMeta(),
      tintColor: Color(red: 0.89, green: 0.34, blue: 0.12)
    )
  }

  @available(iOS 26.0, *)
  static func schedule(id: UUID, schedule: Alarm.Schedule, title: String) async throws {
    let config = AlarmManager.AlarmConfiguration.alarm(
      schedule: schedule,
      attributes: attributes(title: title),
      stopIntent: WakeWordSnoozeIntent(alarmID: id.uuidString),
      secondaryIntent: WakeWordOpenIntent(alarmID: id.uuidString)
    )
    _ = try await AlarmManager.shared.schedule(id: id, configuration: config)
  }

  /// Replace any pending nag with one `seconds` from now, as long as a mission is owed.
  @available(iOS 26.0, *)
  static func nag(in seconds: TimeInterval) async {
    guard WakeWordStore.owed() != nil else {
      cancelNag()
      return
    }
    cancelNag()
    let id = UUID()
    WakeWordStore.defaults.set(id.uuidString, forKey: "ww.nagID")
    try? await schedule(
      id: id,
      schedule: .fixed(Date().addingTimeInterval(seconds)),
      title: "Finish your Wake Word mission"
    )
  }

  @available(iOS 26.0, *)
  static func cancelNag() {
    if let id = WakeWordStore.uuid("ww.nagID") {
      try? AlarmManager.shared.cancel(id: id)
      WakeWordStore.defaults.removeObject(forKey: "ww.nagID")
    }
  }

  @available(iOS 26.0, *)
  static func stopRinging(_ alarmID: String) {
    if let id = UUID(uuidString: alarmID) { try? AlarmManager.shared.stop(id: id) }
  }
}

// The alarm's stop button. Stops the sound, then rings again in a minute until the mission is done.
@available(iOS 26.0, *)
struct WakeWordSnoozeIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Snooze Wake Word"
  static let isDiscoverable = false

  @Parameter(title: "Alarm ID") var alarmID: String

  init(alarmID: String) { self.alarmID = alarmID }
  init() { self.alarmID = "" }

  func perform() async throws -> some IntentResult {
    WakeWordAlarms.stopRinging(alarmID)
    await WakeWordAlarms.nag(in: 60)
    return .result()
  }
}

// The alarm's Open button. Stops the sound and opens the app on the mission.
@available(iOS 26.0, *)
struct WakeWordOpenIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Open Wake Word"
  static let openAppWhenRun = true
  static let isDiscoverable = false

  @Parameter(title: "Alarm ID") var alarmID: String

  init(alarmID: String) { self.alarmID = alarmID }
  init() { self.alarmID = "" }

  func perform() async throws -> some IntentResult {
    WakeWordAlarms.stopRinging(alarmID)
    await WakeWordAlarms.nag(in: 120)
    return .result()
  }
}

@objc(WakeWordBackend)
final class WakeWordBackend: NSObject, WakeAlarmBackend {
  required override init() { super.init() }

  func isSupported() -> Bool { WakeWordAlarms.supported }

  func status() -> String {
    guard #available(iOS 26.0, *) else { return "unavailable" }
    switch AlarmManager.shared.authorizationState {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }

  func requestPermission(_ done: @escaping (String) -> Void) {
    guard #available(iOS 26.0, *) else { return done("unavailable") }
    Task {
      let state = try? await AlarmManager.shared.requestAuthorization()
      done(state == .authorized ? "granted" : "denied")
    }
  }

  func scheduleDaily(_ hour: Int, minute: Int, title: String, done: @escaping (String?) -> Void) {
    guard #available(iOS 26.0, *) else { return done("Alarms need iOS 26 or later") }
    Task {
      do {
        if let old = WakeWordStore.uuid("ww.dailyID") { try? AlarmManager.shared.cancel(id: old) }
        let id = UUID()
        let everyDay: [Locale.Weekday] = [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
        let schedule = Alarm.Schedule.relative(.init(
          time: .init(hour: hour, minute: minute),
          repeats: .weekly(everyDay)
        ))
        try await WakeWordAlarms.schedule(id: id, schedule: schedule, title: title)
        let d = WakeWordStore.defaults
        d.set(id.uuidString, forKey: "ww.dailyID")
        d.set(hour, forKey: "ww.hour")
        d.set(minute, forKey: "ww.minute")
        done(nil)
      } catch {
        done(error.localizedDescription)
      }
    }
  }

  func scheduleTest(_ seconds: Int, title: String, done: @escaping (String?) -> Void) {
    guard #available(iOS 26.0, *) else { return done("Alarms need iOS 26 or later") }
    Task {
      do {
        let at = Date().addingTimeInterval(TimeInterval(seconds))
        let id = UUID()
        try await WakeWordAlarms.schedule(id: id, schedule: .fixed(at), title: title)
        WakeWordStore.defaults.set(at.timeIntervalSince1970, forKey: "ww.testRingAt")
        done(nil)
      } catch {
        done(error.localizedDescription)
      }
    }
  }

  func cancelAll(_ done: @escaping (String?) -> Void) {
    guard #available(iOS 26.0, *) else { return done(nil) }
    for alarm in (try? AlarmManager.shared.alarms) ?? [] {
      try? AlarmManager.shared.cancel(id: alarm.id)
    }
    let d = WakeWordStore.defaults
    for key in ["ww.dailyID", "ww.nagID", "ww.hour", "ww.minute", "ww.testRingAt"] { d.removeObject(forKey: key) }
    done(nil)
  }

  func owedRing() -> Double {
    guard let ring = WakeWordStore.owed() else { return 0 }
    return ring.timeIntervalSince1970 * 1000
  }

  func missionStarted() {
    guard #available(iOS 26.0, *) else { return }
    Task { await WakeWordAlarms.nag(in: 90) }
  }

  func missionHeartbeat() {
    guard #available(iOS 26.0, *) else { return }
    Task { await WakeWordAlarms.nag(in: 90) }
  }

  func missionComplete() {
    WakeWordStore.defaults.set(Date().timeIntervalSince1970, forKey: "ww.lastComplete")
    guard #available(iOS 26.0, *) else { return }
    WakeWordAlarms.cancelNag()
  }
}
